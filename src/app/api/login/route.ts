import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';
import { hashPassword, isPasswordHash, setAuthCookie, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const { id, password } = await request.json();

    console.log("Login attempt:", id);

    // ユーザー検索
    const user = await User.findOne({ userId: id });

    if (!user) {
      console.log("User not found:", id);
      return NextResponse.json({ message: 'IDが見つかりません' }, { status: 401 });
    }

    // パスワード照合
    const passwordMatches = await verifyPassword(password, user.password);
    if (!passwordMatches) {
      console.log("Password mismatch for:", id);
      return NextResponse.json({ message: 'パスワードが間違っています' }, { status: 401 });
    }

    if (!isPasswordHash(user.password)) {
      user.password = await hashPassword(password);
      await user.save();
    }

    console.log("Login successful:", id);
    const response = NextResponse.json({ message: 'ログイン成功' }, { status: 200 });
    setAuthCookie(response, id);
    return response;
  } catch (error: any) {
    console.error("Login Error:", error);
    return NextResponse.json({ message: 'サーバーエラー', error: error.message }, { status: 500 });
  }
}
