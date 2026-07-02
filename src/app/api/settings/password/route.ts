import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';
import { getSessionUserId, hashPassword, unauthorizedResponse, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    
    // CookieからユーザーIDを取得（認証）
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: '現在のパスワードと新しいパスワードを入力してください' }, { status: 400 });
    }

    // ユーザーを検索
    const user = await User.findOne({ userId });
    if (!user) {
      return NextResponse.json({ message: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // 現在のパスワードを確認
    const passwordMatches = await verifyPassword(currentPassword, user.password);
    if (!passwordMatches) {
      return NextResponse.json({ message: '現在のパスワードが間違っています' }, { status: 400 });
    }

    // パスワードを更新
    user.password = await hashPassword(newPassword);
    await user.save();

    return NextResponse.json({ message: 'パスワードを変更しました' }, { status: 200 });

  } catch (error: any) {
    console.error("Password Change Error:", error);
    return NextResponse.json({ message: 'サーバーエラーが発生しました', error: error.message }, { status: 500 });
  }
}
