import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ message: '認証エラー' }, { status: 401 });
    await Order.deleteMany({ ownerId: userId });
    return NextResponse.json({ message: '削除完了' }, { status: 200 });
  } catch (error) { return NextResponse.json({ message: '削除失敗' }, { status: 500 }); }
}