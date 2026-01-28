import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';

export async function POST(request: Request) {
  try {
    console.log("Signup API called");
    await connectToDatabase();
    
    const { id, password } = await request.json();
    console.log("Signup attempt for:", id);

    if (!id || !password) {
      return NextResponse.json({ message: 'IDとパスワードは必須です' }, { status: 400 });
    }

    // 重複チェック
    const existingUser = await User.findOne({ userId: id });
    if (existingUser) {
      console.log("User already exists:", id);
      return NextResponse.json({ message: 'このIDは既に使用されています' }, { status: 409 });
    }

    // ユーザー作成
    const newUser = await User.create({ userId: id, password });
    console.log("User created:", newUser);

    return NextResponse.json({ message: 'アカウントを作成しました' }, { status: 201 });
  } catch (error: any) {
    console.error("Signup Error Detailed:", error);
    return NextResponse.json({ message: 'サーバーエラーが発生しました', error: error.message }, { status: 500 });
  }
}