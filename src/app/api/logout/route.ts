import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ message: 'ログアウトしました' }, { status: 200 });
  clearAuthCookie(response);
  return response;
}
