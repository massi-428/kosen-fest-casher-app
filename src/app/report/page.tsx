import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ message: '認証エラー' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    if (!dateParam) return NextResponse.json({ message: '日付指定なし' }, { status: 400 });

    const startDate = new Date(dateParam);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateParam);
    endDate.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      ownerId: userId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['active', 'completed'] }
    }).sort({ createdAt: 1 });

    return NextResponse.json(orders, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}