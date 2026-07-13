import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    if (!dateParam) return badRequest('日付指定なし');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return badRequest('日付形式が不正です');

    const startDate = new Date(dateParam);
    if (Number.isNaN(startDate.getTime())) return badRequest('日付が不正です');
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(dateParam);
    endDate.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      storeId: context.storeId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['active', 'completed'] },
    }).sort({ createdAt: 1 });

    return NextResponse.json(orders, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'エラー' }, { status: 500 });
  }
}
