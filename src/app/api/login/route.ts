import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';
// import bcrypt from 'bcryptjs'; // パスワードハッシュ化を使う場合はこれを有効にします

export async function POST(request: Request) {
  try {
    // データベースに接続
    await connectToDatabase();

    // フォームから送られてきたIDとパスワードを取得
    const { id, password } = await request.json();

    // ユーザーモデルを使って、DBのキー 'userId' と入力された 'id' を照合
    const user = await User.findOne({ userId: id }); 

    if (!user) {
      // ユーザーが見つからない
      return NextResponse.json(
        { message: 'IDが見つかりません' }, 
        { status: 401 }
      );
    }

    // パスワードの照合
    // データベースに平文（暗号化されていない文字）で保存されている前提で比較
    const isMatch = user.password === password; 

    if (!isMatch) {
      // パスワードが一致しない
      return NextResponse.json(
        { message: 'パスワードが違います' }, 
        { status: 401 }
      );
    }

    // ログイン成功
    return NextResponse.json({ message: 'ログイン成功' }, { status: 200 });

  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました' }, 
      { status: 500 }
    );
  }
}