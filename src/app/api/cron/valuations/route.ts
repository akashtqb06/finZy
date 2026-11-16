import { NextRequest } from 'next/server';
import { handleDailyCron } from '../daily/route';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleDailyCron(request);
}

export async function POST(request: NextRequest) {
  return handleDailyCron(request);
}
