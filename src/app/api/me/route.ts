import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { getSessionUser } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await connectToDatabase();
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    userId: user.userId,
    role: user.role,
    activeStoreId: user.activeStoreId,
    isAdmin: user.role === 'admin',
  }, { status: 200 });
}