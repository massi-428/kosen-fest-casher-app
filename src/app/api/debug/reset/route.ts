import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    await Order.deleteMany({ ownerId: userId });
    return NextResponse.json({ message: '削除完了' }, { status: 200 });
  } catch (error) { return NextResponse.json({ message: '削除失敗' }, { status: 500 }); }
}
