import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isValidObjectId, isNonEmptyString } from '@/lib/validation';
import { revisionFilter, SALES_STATUSES } from '@/lib/order-accounting';
import TicketCounter from '@/models/TicketCounter';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const body = await request.json().catch(() => null);
    if (!body || !isValidObjectId(body.orderId) || !isNonEmptyString(body.paymentMethod, 80) || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return badRequest('注文・決済方法の情報が正しくありません。');
    const result = await TicketCounter.db.transaction(async session => {
      // Serialize with closing, but permit audited corrections without reopening.
      const counter = await TicketCounter.findOneAndUpdate({ storeId: context.storeId }, { $inc: { businessRevision: 1 } }, { upsert: true, new: true, session });
      const order = await Order.findOne({ _id: body.orderId, storeId: context.storeId }).session(session);
      if (!order) return NextResponse.json({ message: '注文が見つかりません。' }, { status: 404 });
      const afterClosing = Boolean(counter.closedAt && new Date(order.createdAt) <= counter.closedAt);
      if (order.settlementLock || !SALES_STATUSES.includes(order.status) || (order.revision || 0) !== body.expectedRevision) return NextResponse.json({ message: '注文が変更されたか、精算中・キャンセル済みです。履歴から開き直してください。' }, { status: 409 });
      const setting = await Setting.findOne({ storeId: context.storeId, key: 'app_config' }).session(session);
      const methods = setting?.paymentMethods ?? ['現金', 'クレジットカード', 'PayPay', '交通系IC'];
      if (!methods.includes(body.paymentMethod)) return badRequest('選択した決済方法は利用できません。');
      if (order.paymentMethod === body.paymentMethod) return NextResponse.json({ order });
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, storeId: context.storeId, settlementLock: null, status: order.status, ...revisionFilter(body.expectedRevision) },
        {
          $set: { paymentMethod: body.paymentMethod, receivedAmount: null, changeAmount: null },
          $inc: { revision: 1 },
          $push: { paymentCorrections: { beforeMethod: order.paymentMethod || '', afterMethod: body.paymentMethod, previousReceivedAmount: order.receivedAmount, previousChangeAmount: order.changeAmount, changedBy: context.userId, createdAt: new Date(), afterClosing, ...(afterClosing ? { closedAt: counter.closedAt } : {}) } },
        },
        { new: true, session },
      );
      if (!updated) return NextResponse.json({ message: '注文が変更されました。履歴から開き直してください。' }, { status: 409 });
      return NextResponse.json({ order: updated });
    });
    return result;
  } catch (error) {
    console.error('決済方法修正エラー:', error);
    return NextResponse.json({ message: '決済方法の修正結果を確認できません。履歴を再読み込みしてください。' }, { status: 500 });
  }
}
