import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    const orders = await Order.find({}).sort({ createdAt: -1 });
    return NextResponse.json(orders, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: '取得エラー' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();

    if (!body.ticketNumber || !body.items || body.items.length === 0 || !body.paymentMethod) {
       return NextResponse.json({ message: '必要な情報が不足しています' }, { status: 400 });
    }

    const newOrder = await Order.create({
      ticketNumber: body.ticketNumber,
      items: body.items, // itemsの中に selectedOptions が含まれている前提
      totalAmount: body.totalAmount,
      status: body.status || 'active',
      paymentMethod: body.paymentMethod,
      note: body.note || '',
    });

    return NextResponse.json(
      { message: '注文を受け付けました', order: newOrder }, 
      { status: 201 }
    );

  } catch (error) {
    console.error("Order Error:", error);
    return NextResponse.json({ message: '注文処理に失敗しました' }, { status: 500 });
  }
}