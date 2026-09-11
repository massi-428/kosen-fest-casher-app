import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isOrderStatus, isValidObjectId } from '@/lib/validation';

import { canTransition, revisionFilter } from '@/lib/order-accounting';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const activeOrders = await Order.find({ storeId: context.storeId, status: { $in: ['active', 'pending'] } }).select('ticketNumber items.quantity status revision');
    const activeTickets = activeOrders.map((order) => parseInt(order.ticketNumber)).filter((num) => !isNaN(num));
    const lastOrder = await Order.findOne({ storeId: context.storeId }).sort({ createdAt: -1 });
    const lastTicketNumber = lastOrder && !isNaN(parseInt(lastOrder.ticketNumber)) ? parseInt(lastOrder.ticketNumber) : 0;

    const currentPendingItemCount = activeOrders.reduce((sum, order) => sum + order.items.reduce((itemSum: number, item: { quantity: number }) => itemSum + item.quantity, 0), 0);
    const setting = await Setting.findOneAndUpdate(
      { storeId: context.storeId, key: 'app_config' },
      { $set: { pendingItemCount: currentPendingItemCount } },
      { new: true },
    );
    return NextResponse.json({ activeTickets, activeOrders, lastTicketNumber, currentPendingItemCount, maxPendingItemCount: setting?.maxPendingItemCount ?? 30 }, { status: 200 });
  } catch {
    return NextResponse.json({ message: '整理券情報の取得に失敗しました。' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { status, orderId, expectedRevision } = await request.json();
    const newStatus = status || 'completed';
    if (!isOrderStatus(newStatus) || !isValidObjectId(orderId)) return badRequest('注文ID・状態が正しくありません。画面を再取得してください。');
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return badRequest('更新情報が不足しています。画面を再取得してください。');
    if (newStatus === 'cancelled') {
      return NextResponse.json({ message: '全取消は先に精算対象を確定してください。' }, { status: 409 });
    }

    const existingOrder = await Order.findOne({ _id: orderId, storeId: context.storeId });
    if (!existingOrder) return NextResponse.json({ message: '対象の注文が見つかりません。' }, { status: 404 });
    if (existingOrder.settlementLock) return NextResponse.json({ message: 'この注文は精算中のため変更できません。履歴で精算を完了してください。' }, { status: 409 });
    if ((existingOrder.revision || 0) !== expectedRevision || !canTransition(existingOrder.status, newStatus)) return NextResponse.json({ message: '対象の注文は既に変更されています。再取得して状態を確認してください。' }, { status: 409 });
    // The existing partial unique index also rejects a concurrent reuse of this number.
    if (newStatus === 'active' && existingOrder.status === 'completed' && await Order.exists({ storeId: context.storeId, ticketNumber: existingOrder.ticketNumber, status: { $in: ['active', 'pending'] } })) return NextResponse.json({ message: '整理券番号が別の注文で再利用されているため、完了を取り消せません。' }, { status: 409 });
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: orderId, storeId: context.storeId, status: existingOrder.status, settlementLock: null, ...revisionFilter(expectedRevision) },
      { $set: { status: newStatus, completedAt: newStatus === 'completed' ? new Date() : null, cancelledAt: null }, $inc: { revision: 1 } },
      { new: true },
    );
    if (!updatedOrder) return NextResponse.json({ message: '注文が他の端末で変更されました。再取得してください。' }, { status: 409 });

    const remaining = await Order.aggregate([{ $match: { storeId: context.storeId, status: { $in: ['active', 'pending'] } } }, { $unwind: '$items' }, { $group: { _id: null, count: { $sum: '$items.quantity' } } }]);
    await Setting.updateOne({ storeId: context.storeId, key: 'app_config' }, { $set: { pendingItemCount: remaining[0]?.count || 0 } });
    return NextResponse.json({ message: '注文状態を更新しました。' }, { status: 200 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return NextResponse.json({ message: '整理券番号が別の注文で再利用されているため、復帰できません。' }, { status: 409 });
    console.error('注文状態更新エラー:', error);
    return NextResponse.json({ message: '注文状態の更新に失敗しました。' }, { status: 500 });
  }
}
