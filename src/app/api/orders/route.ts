import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Product from '@/models/Product';
import Setting from '@/models/Setting';
import TicketCounter from '@/models/TicketCounter';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString, isOptionalString } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const DEFAULT_MAX_TICKET_NUMBER = 30;
const DEFAULT_MAX_PENDING_ITEM_COUNT = 30;
const DEFAULT_MAX_ITEMS_PER_ORDER = 10;
const DUPLICATE_KEY_ERROR_CODE = 11000;
const OPEN_STATUSES = ['active', 'pending'];

type IncomingOrderItem = {
  productId?: unknown;
  quantity?: unknown;
  detail?: unknown;
  selectedOptionNames?: unknown;
  selectedOptions?: unknown;
};

const issueTicketCandidate = async (storeId: string, maxTicketNumber: number) => {
  const counter = await TicketCounter.findOneAndUpdate(
    { storeId },
    [{ $set: { storeId, lastIssuedNumber: { $let: { vars: { nextNumber: { $add: [{ $ifNull: ['$lastIssuedNumber', 0] }, 1] } }, in: { $cond: [{ $gt: ['$$nextNumber', maxTicketNumber] }, 1, '$$nextNumber'] } } } } }],
    { new: true, upsert: true, setDefaultsOnInsert: true },
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

    const orders = await Order.find({ storeId: context.storeId }).sort({ createdAt: -1 });
    return NextResponse.json(orders, { status: 200 });
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

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) return badRequest('注文商品が正しくありません。');
    if (!isNonEmptyString(body.paymentMethod, 80) || !isOptionalString(body.note, 500)) return badRequest('注文内容が正しくありません。');

    const setting = await Setting.findOneAndUpdate(
      { storeId, key: 'app_config' },
      { $setOnInsert: { ownerId: context.userId, storeId, key: 'app_config' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const paymentMethods: string[] = Array.isArray(setting?.paymentMethods) ? setting.paymentMethods : [];
    if (!paymentMethods.includes(String(body.paymentMethod))) return badRequest('選択された支払い方法は利用できません。');

    const maxItemsPerOrder = Number.isInteger(setting?.maxItemsPerOrder) ? setting.maxItemsPerOrder : DEFAULT_MAX_ITEMS_PER_ORDER;
    const requestedItemCount = (body.items as IncomingOrderItem[]).reduce((sum, item) => sum + (Number.isInteger(item?.quantity) ? Number(item.quantity) : 0), 0);
    if ((body.items as IncomingOrderItem[]).some((item) => !Number.isInteger(item?.quantity) || Number(item.quantity) < 1)) {
      return badRequest('数量は正の整数で入力してください。');
    }

    const productIds = [...new Set((body.items as IncomingOrderItem[]).map((item) => String(item.productId || '')))];
    if (productIds.some((id) => !id)) return badRequest('商品IDが正しくありません。');
    const products = await Product.find({ storeId, _id: { $in: productIds } });
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    if (productMap.size !== productIds.length) return badRequest('存在しない商品が含まれています。');

    const optionMap = new Map<string, number>((Array.isArray(setting?.customizations) ? setting.customizations : []).map((option: { name: string; price: number }) => [option.name, option.price]));
    const items = (body.items as IncomingOrderItem[]).map((item) => {
      const product = productMap.get(String(item.productId));
      if (!product || !isOptionalString(item.detail, 300)) return null;
      const names = Array.isArray(item.selectedOptionNames)
        ? item.selectedOptionNames
        : Array.isArray(item.selectedOptions) ? item.selectedOptions.map((option: { name?: unknown }) => option?.name) : [];
      if (names.some((name: unknown) => !isNonEmptyString(name, 80) || !optionMap.has(String(name)))) return null;
      const selectedOptions = names.map((name: unknown) => ({ name: String(name), price: optionMap.get(String(name)) as number }));
      const unitPrice = product.price + selectedOptions.reduce((sum: number, option: { price: number }) => sum + option.price, 0);
      return { productId: String(product._id), productName: product.name, quantity: Number(item.quantity), amount: unitPrice * Number(item.quantity), detail: typeof item.detail === 'string' ? item.detail : '', selectedOptions };
    });
    if (items.some((item) => item === null)) return badRequest('注文詳細またはオプションが正しくありません。');
    const safeItems = items.filter((item): item is NonNullable<typeof item> => item !== null);
    const totalAmount = safeItems.reduce((sum, item) => sum + item.amount, 0);

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
      const candidate = await issueTicketCandidate(storeId, maxTicketNumber);
      if (lostTickets.has(Number(candidate))) continue;
      if (await Order.exists({ storeId, ticketNumber: candidate, status: { $in: OPEN_STATUSES } })) continue;
      try {
        const order = await Order.create({ ownerId: context.userId, storeId, requestId, ticketNumber: candidate, items: safeItems, totalAmount, status: 'active', paymentMethod: body.paymentMethod, note: body.note || '' });
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
    console.error('注文登録エラー:', error);
    return NextResponse.json({ message: '注文の登録に失敗しました。' }, { status: 500 });
  }
}
