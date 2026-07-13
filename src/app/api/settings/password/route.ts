import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';
import { getSessionUserId, hashPassword, unauthorizedResponse, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await connectToDatabase();

    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: '現在のパスワードと新しいパスワードを入力してください' }, { status: 400 });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return NextResponse.json({ message: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const passwordMatches = await verifyPassword(currentPassword, user.password);
    if (!passwordMatches) {
      return NextResponse.json({ message: '現在のパスワードが間違っています' }, { status: 400 });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return NextResponse.json({ message: 'パスワードを変更しました' }, { status: 200 });
  } catch (error) {
    console.error('Password Change Error:', error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}
