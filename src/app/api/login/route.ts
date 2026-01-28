import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';

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
    if (user.password !== password) {
      console.log("Password mismatch for:", id);
      return NextResponse.json({ message: 'パスワードが間違っています' }, { status: 401 });
    }

    console.log("Login successful:", id);
    return NextResponse.json({ message: 'ログイン成功' }, { status: 200 });
  } catch (error: any) {
    console.error("Login Error:", error);
    return NextResponse.json({ message: 'サーバーエラー', error: error.message }, { status: 500 });
  }
}