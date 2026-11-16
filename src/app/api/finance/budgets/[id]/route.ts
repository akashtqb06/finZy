import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { updateBudgetSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

type RouteContext = { params: Promise<{ id: string }> };


export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('budgets');
    if (gated) return gated;

    const { id } = await context.params;
    const service = getFinanceService();
    const budget = await service.getBudget(user.id, id);
    return jsonNoStore({ budget });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('budgets');
    if (gated) return gated;

    const { id } = await context.params;
    const json = await request.json();
    const data = updateBudgetSchema.parse(json);

    const service = getFinanceService();
    const budget = await service.updateBudget(user.id, id, data);
    return NextResponse.json({ budget });
  } catch (err) {
    return handleApiError(err);
  }
}

export const PATCH = PUT;

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('budgets');
    if (gated) return gated;

    const { id } = await context.params;
    const url = new URL(request.url);
    const expectedVersionParam = url.searchParams.get('expectedVersion');
    const expectedVersion = expectedVersionParam ? parseInt(expectedVersionParam, 10) : undefined;

    const service = getFinanceService();
    await service.deleteBudget(user.id, id, expectedVersion);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

