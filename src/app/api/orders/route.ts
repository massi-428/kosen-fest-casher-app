import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    const orders = await Order.find({ ownerId: userId }).sort({ createdAt: -1 });
    return NextResponse.json(orders, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    const body = await request.json();
    const newOrder = await Order.create({
      ownerId: userId,
      ticketNumber: body.ticketNumber,
      items: body.items,
      totalAmount: body.totalAmount,
      status: body.status || 'active',
      paymentMethod: body.paymentMethod,
      note: body.note || '',
    });
    return NextResponse.json({ message: '注文完了', order: newOrder }, { status: 201 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}
