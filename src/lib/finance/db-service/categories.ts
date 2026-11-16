import { and, eq, or } from 'drizzle-orm';
import { db, finCategories } from '@src/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '@src/app/api/utils';
import { incrementDataVersion } from './sync';
import {
  type CategoryDTO,
  type CategoryFilters,
  type CreateCategoryDTO,
  type UpdateCategoryDTO,
  createCategorySchema,
  updateCategorySchema,
} from '../contract';

export function mapCategoryToDTO(row: typeof finCategories.$inferSelect): CategoryDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as CategoryDTO['type'],
    parentId: row.parentId,
    icon: row.icon,
    color: row.color,
    isSystem: row.isSystem,
    version: row.version ?? 1,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function getOrCreateCreditCardPaymentCategory(): Promise<CategoryDTO> {
  const [existing] = await db
    .select()
    .from(finCategories)
    .where(and(eq(finCategories.name, 'Credit card payment'), eq(finCategories.isSystem, true)))
    .limit(1);

  if (existing) {
    return mapCategoryToDTO(existing);
  }

  try {
    const [created] = await db
      .insert(finCategories)
      .values({
        id: 'cat_system_cc_payment',
        userId: null,
        name: 'Credit card payment',
        type: 'expense',
        isSystem: true,
        icon: 'credit-card',
        color: '#8b5cf6',
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return mapCategoryToDTO(created);
    }
  } catch {
    // If conflict on ID or unique constraint, re-fetch below
  }

  const [found] = await db
    .select()
    .from(finCategories)
    .where(
      or(
        eq(finCategories.id, 'cat_system_cc_payment'),
        and(eq(finCategories.name, 'Credit card payment'), eq(finCategories.isSystem, true))
      )
    )
    .limit(1);

  return mapCategoryToDTO(found);
}

export async function listCategories(
  userId: string,
  filters?: CategoryFilters
): Promise<CategoryDTO[]> {
  // Ensure the system credit card payment category exists
  await getOrCreateCreditCardPaymentCategory().catch(() => {});

  const userOrSystem = or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true));
  const conditions = [userOrSystem];

  if (filters?.type) {
    conditions.push(eq(finCategories.type, filters.type));
  }

  const rows = await db
    .select()
    .from(finCategories)
    .where(and(...conditions))
    .orderBy(finCategories.isSystem, finCategories.name);

  return rows.map(mapCategoryToDTO);
}

export async function getCategory(userId: string, categoryId: string): Promise<CategoryDTO> {
  const [row] = await db
    .select()
    .from(finCategories)
    .where(
      and(
        eq(finCategories.id, categoryId),
        or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true))
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  return mapCategoryToDTO(row);
}

export async function createCategory(
  userId: string,
  data: CreateCategoryDTO
): Promise<CategoryDTO> {
  const validated = createCategorySchema.parse(data);

  if (validated.parentId) {
    const parent = await getCategory(userId, validated.parentId);
    if (parent.type !== validated.type) {
      throw new BadRequestError('Parent category must have the same type (expense or income)');
    }
  }

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(finCategories)
      .values({
        userId,
        name: validated.name,
        type: validated.type,
        parentId: validated.parentId || null,
        icon: validated.icon || null,
        color: validated.color || null,
        isSystem: false,
        version: 1,
      })
      .returning();

    await incrementDataVersion(tx, userId);
    return inserted;
  });

  return mapCategoryToDTO(row);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  data: UpdateCategoryDTO
): Promise<CategoryDTO> {
  const validated = updateCategorySchema.parse(data);
  const existing = await getCategory(userId, categoryId);

  if (existing.isSystem) {
    throw new ForbiddenError('System categories cannot be modified');
  }

  if (existing.userId !== userId) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  // Concurrency check
  if (validated.expectedVersion !== undefined && existing.version !== validated.expectedVersion) {
    throw new ConflictError('Changed on another device', existing);
  }

  if (validated.parentId) {
    if (validated.parentId === categoryId) {
      throw new BadRequestError('A category cannot be its own parent');
    }
    const parent = await getCategory(userId, validated.parentId);
    if (parent.type !== existing.type) {
      throw new BadRequestError('Parent category must have the same type');
    }
  }

  const updateValues: Partial<typeof finCategories.$inferInsert> = {
    updatedAt: new Date(),
    version: (existing.version ?? 1) + 1,
  };

  if (validated.name !== undefined) updateValues.name = validated.name;
  if (validated.parentId !== undefined) updateValues.parentId = validated.parentId;
  if (validated.icon !== undefined) updateValues.icon = validated.icon;
  if (validated.color !== undefined) updateValues.color = validated.color;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(finCategories)
      .set(updateValues)
      .where(and(eq(finCategories.id, categoryId), eq(finCategories.userId, userId)))
      .returning();

    await incrementDataVersion(tx, userId);
    return row;
  });

  return mapCategoryToDTO(updated);
}

export async function deleteCategory(
  userId: string,
  categoryId: string,
  expectedVersion?: number
): Promise<void> {
  const existing = await getCategory(userId, categoryId);

  if (existing.isSystem) {
    throw new ForbiddenError('System categories cannot be deleted');
  }

  if (existing.userId !== userId) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  // Concurrency check
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new ConflictError('Changed on another device', existing);
  }

  await db.transaction(async (tx) => {
    // Any child categories referencing this parentId will have parentId unset
    await tx
      .update(finCategories)
      .set({ parentId: null, updatedAt: new Date() })
      .where(eq(finCategories.parentId, categoryId));

    await tx
      .delete(finCategories)
      .where(and(eq(finCategories.id, categoryId), eq(finCategories.userId, userId)));

    await incrementDataVersion(tx, userId);
  });
}
