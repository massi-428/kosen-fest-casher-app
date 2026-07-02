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
