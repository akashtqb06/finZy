import crypto from 'node:crypto';
import { UnauthorizedError } from '@src/lib/auth/policy';

export function assertCronAuthorized(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new UnauthorizedError('CRON_SECRET is not configured on server');
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  const headerSecret = request.headers.get('x-cron-secret');

  const candidate = bearerToken ?? headerSecret;
  if (!candidate) {
    throw new UnauthorizedError('Invalid or missing cron authentication');
  }

  const candidateBuf = Buffer.from(candidate);
  const secretBuf = Buffer.from(secret);

  if (
    candidateBuf.length !== secretBuf.length ||
    !crypto.timingSafeEqual(candidateBuf, secretBuf)
  ) {
    throw new UnauthorizedError('Invalid or missing cron authentication');
  }
}
