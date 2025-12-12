import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';

export async function DELETE() {
  try {
    await connectToDatabase();

    // 注文データを全て削除します（危険な操作なので本来は認証が必要ですが、開発用として許可します）
    await Order.deleteMany({});

    return NextResponse.json({ message: '全データを削除しました' }, { status: 200 });
  } catch (error) {
    console.error("Reset Error:", error);
    return NextResponse.json({ message: '削除に失敗しました' }, { status: 500 });
  }
}