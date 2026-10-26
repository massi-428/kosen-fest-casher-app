import CheckoutQuote from '@/models/CheckoutQuote';
import { historyQuery } from '@/lib/history-query';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import TicketCounter from '@/models/TicketCounter';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString } from '@/lib/validation';
import { withOpenBusiness, BusinessClosedError } from '@/lib/business-day';
import type { ClientSession } from 'mongoose';

export const dynamic = 'force-dynamic';

const DEFAULT_MAX_TICKET_NUMBER = 30;
const DEFAULT_MAX_PENDING_ITEM_COUNT = 30;
const DEFAULT_MAX_ITEMS_PER_ORDER = 10;
const DUPLICATE_KEY_ERROR_CODE = 11000;
const OPEN_STATUSES = ['active', 'pending'];

const issueTicketCandidate = async (storeId: string, maxTicketNumber: number, session: ClientSession) => {
  const counter = await TicketCounter.findOneAndUpdate(
    { storeId },
    [{ $set: { storeId, lastIssuedNumber: { $let: { vars: { nextNumber: { $add: [{ $ifNull: ['$lastIssuedNumber', 0] }, 1] } }, in: { $cond: [{ $gt: ['$$nextNumber', maxTicketNumber] }, 1, '$$nextNumber'] } } } } }],
    { new: true, upsert: true, setDefaultsOnInsert: true, session },
  );
  return String(counter.lastIssuedNumber);
};

const isDuplicateKeyError = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY_ERROR_CODE;

const orderSuccess = (order: InstanceType<typeof Order>, repeated = false, warning?: Record<string, unknown>) => NextResponse.json(
  { message: repeated ? '注文は登録済みです。' : '注文を登録しました。', order, ticketNumber: order.ticketNumber, repeated, ...(warning ? { warning } : {}) },
  { status: repeated ? 200 : 201 },
);

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const params = new URL(request.url).searchParams;
    if (params.get('requestId')) {
      const order = await Order.findOne({ storeId: context.storeId, ownerId: context.userId, requestId: params.get('requestId') });
      return NextResponse.json({ order });
    }
    if (params.get('scope') === 'open') return NextResponse.json(await Order.find({ storeId: context.storeId, status: { $in: OPEN_STATUSES } }).sort({ createdAt: 1 }).limit(500));
    let filter;
    try { filter = historyQuery(params, context.storeId); } catch (error) { return badRequest(error instanceof Error ? error.message : '検索条件が正しくありません。'); }
    const page = Math.max(0, Math.min(10000, Number(params.get('page')) || 0));
    const limit = 100;
    const [orders, total, hourly] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip(page * limit).limit(limit),
      Order.countDocuments(filter),
      Order.aggregate([{ $match: { ...filter, ...(filter.status === 'cancelled' ? {} : { status: filter.status || { $ne: 'cancelled' } }) } }, { $group: { _id: { $hour: { date: '$createdAt', timezone: 'Asia/Tokyo' } }, count: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] } } } }]),
    ]);
    return NextResponse.json({ orders, total, page, limit, hourly, date: params.get('date') }, { status: 200 });
  } catch (error) {
    console.error('注文取得エラー:', error);
    return NextResponse.json({ message: '注文情報の取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let reservedItemCount = 0;
  let storeId = '';
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    storeId = context.storeId;

    const body = await request.json();
    if (!isNonEmptyString(body.requestId, 100)) return badRequest('リクエストIDが正しくありません。');
    const requestId = String(body.requestId).trim();

    const existingOrder = await Order.findOne({ storeId, requestId });
    if (existingOrder) return orderSuccess(existingOrder, true);

    const quote = await CheckoutQuote.findOne({ storeId, userId: context.userId, requestId });
    if (!quote) return NextResponse.json({ message: '会計前に金額を確認してください。' }, { status: 409 });
    if (body.expectedTotal !== quote.totalAmount) return NextResponse.json({ message: '提示金額を再確認してください。', totalAmount: quote.totalAmount }, { status: 409 });
    if (!quote.paymentMethods.includes(body.paymentMethod)) return badRequest('選択された支払い方法は利用できません。');
    const safeItems = quote.items;
    const totalAmount = quote.totalAmount;
    const requestedItemCount = safeItems.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
    let receivedAmount: number | undefined;
    let changeAmount: number | undefined;
    if (quote.cashCalculationEnabled && body.paymentMethod === quote.cashPaymentMethod) {
      receivedAmount = body.receivedAmount;
      if (typeof receivedAmount !== 'number' || !Number.isInteger(receivedAmount) || receivedAmount < totalAmount || receivedAmount > 10000000) return badRequest('預かり金は確定金額以上の整数で入力してください。');
      changeAmount = receivedAmount - totalAmount;
    }
    const submission = { paymentMethod: body.paymentMethod, receivedAmount: receivedAmount ?? null, changeAmount: changeAmount ?? null };
    const lockedQuote = await CheckoutQuote.findOneAndUpdate({ _id: quote._id, submission: null }, { $set: { submission } }, { new: true });
    const stored = lockedQuote?.submission || (await CheckoutQuote.findById(quote._id))?.submission;
    if (JSON.stringify(stored) !== JSON.stringify(submission)) return NextResponse.json({ message: 'この操作IDの会計内容は確定済みです。結果確認から再開してください。' }, { status: 409 });
    const setting = await Setting.findOneAndUpdate({ storeId, key: 'app_config' }, { $setOnInsert: { ownerId: context.userId, storeId, key: 'app_config' } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    const maxItemsPerOrder = Number.isInteger(setting?.maxItemsPerOrder) ? setting.maxItemsPerOrder : DEFAULT_MAX_ITEMS_PER_ORDER;

    const actualPending = await Order.aggregate([
      { $match: { storeId, status: { $in: OPEN_STATUSES } } },
      { $unwind: '$items' },
      { $group: { _id: null, count: { $sum: '$items.quantity' } } },
    ]);
    await Setting.updateOne({ storeId, key: 'app_config', pendingItemCount: { $exists: false } }, { $set: { pendingItemCount: actualPending[0]?.count || 0 } });
    const maxPendingItemCount = Number.isInteger(setting?.maxPendingItemCount) ? setting.maxPendingItemCount : DEFAULT_MAX_PENDING_ITEM_COUNT;
    const reservation = await Setting.findOneAndUpdate(
      { storeId, key: 'app_config' },
      { $inc: { pendingItemCount: requestedItemCount } },
      { new: true },
    );
    if (!reservation) {
      throw new Error('受注枠カウンターを更新できませんでした。');
    }
    reservedItemCount = requestedItemCount;
    const projectedPendingItemCount = Number(reservation.pendingItemCount);
    const currentPendingItemCount = projectedPendingItemCount - requestedItemCount;
    const exceedsPendingWarning = projectedPendingItemCount > maxPendingItemCount;
    const exceedsOrderWarning = requestedItemCount > maxItemsPerOrder;
    const capacityWarning = exceedsPendingWarning || exceedsOrderWarning ? {
      message: exceedsPendingWarning && exceedsOrderWarning
        ? '未提供数と今回の注文数が警告基準を超えています。調理状況を確認してください。'
        : exceedsPendingWarning
          ? '未提供数が警告基準を超えています。調理状況を確認してください。'
          : '今回の注文数が警告基準を超えています。内容を確認してください。',
      currentPendingItemCount,
      requestedItemCount,
      projectedPendingItemCount,
      maxPendingItemCount,
      maxItemsPerOrder,
    } : undefined;

    const maxTicketNumber = Number.isInteger(setting?.maxTicketNumber) && setting.maxTicketNumber > 0 ? setting.maxTicketNumber : DEFAULT_MAX_TICKET_NUMBER;
    const lostTickets = new Set<number>((Array.isArray(setting?.lostTickets) ? setting.lostTickets : []).map(Number));
    for (let i = 0; i < maxTicketNumber; i += 1) {
      try {
        const order = await withOpenBusiness(storeId, async (session, closedAt) => {
          if (closedAt && new Date(quote.createdAt) <= closedAt) throw new BusinessClosedError('〆作業前の会計です。カートに戻り、会計金額を再確認してください。');
          const candidate = await issueTicketCandidate(storeId, maxTicketNumber, session);
          if (lostTickets.has(Number(candidate))) return null;
          if (await Order.exists({ storeId, ticketNumber: candidate, status: { $in: OPEN_STATUSES } }).session(session)) return null;
          const [created] = await Order.create([{ ownerId: context.userId, storeId, requestId, ticketNumber: candidate, items: safeItems, totalAmount, status: 'active', paymentMethod: body.paymentMethod, receivedAmount, changeAmount, note: quote.note || '' }], { session });
          return created;
        });
        if (!order) continue;
        reservedItemCount = 0;
        return orderSuccess(order, false, capacityWarning);
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const repeated = await Order.findOne({ storeId, requestId });
        if (repeated) {
          await Setting.updateOne({ storeId, key: 'app_config' }, { $inc: { pendingItemCount: -reservedItemCount } });
          reservedItemCount = 0;
          return orderSuccess(repeated, true);
        }
      }
    }
    await Setting.updateOne({ storeId, key: 'app_config' }, { $inc: { pendingItemCount: -reservedItemCount } });
    reservedItemCount = 0;
    return NextResponse.json({ message: '利用可能な整理券番号がありません。' }, { status: 409 });
  } catch (error) {
    if (reservedItemCount && storeId) await Setting.updateOne({ storeId, key: 'app_config' }, { $inc: { pendingItemCount: -reservedItemCount } }).catch(() => undefined);
    if (error instanceof BusinessClosedError) return NextResponse.json({ message: error.message }, { status: 409 });
    console.error('注文登録エラー:', error);
    return NextResponse.json({ message: '注文の登録に失敗しました。' }, { status: 500 });
  }
}

// Legacy clients must not collect money before reserving a settlement operation.
export async function PUT() {
  return NextResponse.json({ message: '注文変更は精算対象の確定から開始してください。画面を再読み込みしてください。' }, { status: 409 });
}
