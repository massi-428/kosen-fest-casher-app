import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { getCancelPassword } from '@/lib/systemSettings';
import { badRequest, isNonEmptyString, isOrderStatus, isValidObjectId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const activeOrders = await Order.find({ storeId: context.storeId, status: { $in: ['active', 'pending'] } }).select('ticketNumber items.quantity');
    const activeTickets = activeOrders.map((order) => parseInt(order.ticketNumber)).filter((num) => !isNaN(num));
    const lastOrder = await Order.findOne({ storeId: context.storeId }).sort({ createdAt: -1 });
    const lastTicketNumber = lastOrder && !isNaN(parseInt(lastOrder.ticketNumber)) ? parseInt(lastOrder.ticketNumber) : 0;

    const currentPendingItemCount = activeOrders.reduce((sum, order) => sum + order.items.reduce((itemSum: number, item: { quantity: number }) => itemSum + item.quantity, 0), 0);
    const setting = await Setting.findOneAndUpdate(
      { storeId: context.storeId, key: 'app_config' },
      { $set: { pendingItemCount: currentPendingItemCount } },
      { new: true },
    );
    return NextResponse.json({ activeTickets, lastTicketNumber, currentPendingItemCount, maxPendingItemCount: setting?.maxPendingItemCount ?? 30 }, { status: 200 });
  } catch {
    return NextResponse.json({ message: '整理券情報の取得に失敗しました。' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { ticketNumber, status, orderId, cancelPassword } = await request.json();
    const newStatus = status || 'completed';
    if (!isOrderStatus(newStatus)) return badRequest('注文状態が正しくありません。');

    if (newStatus === 'cancelled') {
      const expectedPassword = await getCancelPassword();
      if (String(cancelPassword || '') !== expectedPassword) {
        return NextResponse.json({ message: 'キャンセル用パスワードが違います。' }, { status: 403 });
      }
    }

    const timestampUpdate = newStatus === 'cancelled'
      ? { cancelledAt: new Date() }
      : { cancelledAt: null };

    if (orderId) {
      if (!isValidObjectId(orderId)) return badRequest('注文IDが正しくありません。');
      const existingOrder = await Order.findOne({ _id: orderId, storeId: context.storeId }).select('completedAt');
      if (!existingOrder) return NextResponse.json({ message: '対象の注文が見つかりません。' }, { status: 404 });
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: orderId, storeId: context.storeId },
        newStatus === 'completed'
          ? { $set: { status: newStatus, cancelledAt: null, completedAt: existingOrder.completedAt ?? new Date() } }
          : { $set: { status: newStatus, ...timestampUpdate } },
        { new: true },
      );
      if (!updatedOrder) return NextResponse.json({ message: '対象の注文が見つかりません。' }, { status: 404 });
    } else {
      if (!isNonEmptyString(String(ticketNumber || ''), 20)) return badRequest('整理券番号が正しくありません。');
      const result = await Order.updateMany(
        { storeId: context.storeId, ticketNumber: String(ticketNumber), status: { $ne: 'completed' } },
        newStatus === 'completed'
          ? { $set: { status: newStatus, cancelledAt: null, completedAt: new Date() } }
          : { $set: { status: newStatus, ...timestampUpdate } },
      );
      if (result.matchedCount === 0) return NextResponse.json({ message: '対象の注文が見つかりません。' }, { status: 404 });
    }

    const remaining = await Order.aggregate([{ $match: { storeId: context.storeId, status: { $in: ['active', 'pending'] } } }, { $unwind: '$items' }, { $group: { _id: null, count: { $sum: '$items.quantity' } } }]);
    await Setting.updateOne({ storeId: context.storeId, key: 'app_config' }, { $set: { pendingItemCount: remaining[0]?.count || 0 } });
    return NextResponse.json({ message: '注文状態を更新しました。' }, { status: 200 });
  } catch (error) {
    console.error('注文状態更新エラー:', error);
    return NextResponse.json({ message: '注文状態の更新に失敗しました。' }, { status: 500 });
  }
}
