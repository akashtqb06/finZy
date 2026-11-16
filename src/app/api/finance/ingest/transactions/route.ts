import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { requireUserApi } from '@src/lib/auth/dal';
import { ingestBatchSchema } from '@src/lib/finance/ingest/schema';
import { ingestItems } from '@src/lib/finance/ingest/service';
import { dispatchEvent } from '@src/lib/finance/webhooks/dispatcher';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

export async function POST(request: NextRequest) {
  const gate = checkFeatureGatedApi('inbox');
  if (gate) return gate;

  try {
    const user = await requireUserApi();
    const userId = user.id;
    const json = await request.json();
    const { items } = ingestBatchSchema.parse(json);

    const results = await ingestItems(userId, items);

    // Fire inbox.pending event if any new items were accepted
    const newPending = results.filter((r) => r.status === 'accepted');
    if (newPending.length > 0) {
      void dispatchEvent('inbox.pending', { count: newPending.length }, userId);
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
