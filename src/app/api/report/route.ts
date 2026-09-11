import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { SALES_STATUSES } from '@/lib/order-accounting';
import { badRequest } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const includeAllStatuses = searchParams.get('scope') === 'all';
    if (!dateParam) return badRequest('日付指定なし');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return badRequest('日付形式が不正です');

    const startDate = new Date(dateParam + 'T00:00:00+09:00');
    if (Number.isNaN(startDate.getTime())) return badRequest('日付が不正です');


    const endDate = new Date(dateParam);
    endDate.setTime(startDate.getTime() + 86400000 - 1);

    const orders = await Order.find({
      storeId: context.storeId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: includeAllStatuses ? ['active', 'pending', 'completed', 'cancelled'] : SALES_STATUSES },
    }).sort({ createdAt: 1 });

    return NextResponse.json(orders, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'エラー' }, { status: 500 });
  }
}
