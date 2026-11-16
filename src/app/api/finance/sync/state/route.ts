import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { getDataVersion } from '@src/lib/finance/db-service/sync';
import { jsonNoStore } from '../../utils';

export async function GET() {
  try {
    const user = await requireUserApi();
    const dataVersion = await getDataVersion(user.id);
    return jsonNoStore({ dataVersion });
  } catch (err) {
    return handleApiError(err);
  }
}
