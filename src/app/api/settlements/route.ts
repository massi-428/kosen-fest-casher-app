import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Product from '@/models/Product';
import Setting from '@/models/Setting';
import { getActiveStoreContext } from '@/lib/store';
import { unauthorizedResponse } from '@/lib/auth';
import { getCancelPassword } from '@/lib/systemSettings';
import { badRequest, isNonEmptyString, isOptionalString, isValidObjectId } from '@/lib/validation';
import { priceEditedItems, revisionFilter, settlementAmounts } from '@/lib/order-accounting';
import type { SettlementOperation } from '@/lib/settlement-types';

export const dynamic = 'force-dynamic';
const conflict = (message: string) => NextResponse.json({ message }, { status: 409 });

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const id = new URL(request.url).searchParams.get('operationId');
    if (id) {
      const order = await Order.findOne({ storeId: context.storeId, 'settlementOperations.operationId': id });
      if (!order) return NextResponse.json({ message: '操作は見つかりません。まだ受け渡しを行わないでください。' }, { status: 404 });
      return NextResponse.json({ order, operation: order.settlementOperations.find((op: SettlementOperation) => op.operationId === id) });
    }
    const orders = await Order.find({ storeId: context.storeId, settlementLock: { $type: 'string' } }).sort({ createdAt: 1 }).limit(100);
    return NextResponse.json(orders);
  } catch { return NextResponse.json({ message: '精算状況を取得できません。受け渡しを繰り返さず、再取得してください。' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const body = await request.json();
    if (!isValidObjectId(body.orderId) || !isNonEmptyString(body.operationId, 100)) return badRequest('注文ID・操作IDが正しくありません。');
    const order = await Order.findOne({ _id: body.orderId, storeId: context.storeId });
    if (!order) return NextResponse.json({ message: '注文が見つかりません。' }, { status: 404 });
    const op: SettlementOperation | undefined = order.settlementOperations?.find((entry: SettlementOperation) => entry.operationId === body.operationId);
    const respond = (updated: typeof order) => NextResponse.json({ order: updated, operation: updated.settlementOperations.find((entry: SettlementOperation) => entry.operationId === body.operationId) });
    if (body.action === 'prepare') {
      if (op) return respond(order);
      if (order.settlementLock) return conflict('この注文は精算中です。未完了の精算を確認してください。');
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== (order.revision || 0)) return conflict('注文が変更されました。最新の内容を開き直してください。まだ受け渡しを行わないでください。');
      if (body.kind !== 'edit' && body.kind !== 'cancel') return badRequest('精算種別が正しくありません。');
      if (order.status === 'cancelled' || (body.kind === 'edit' && !['active', 'pending'].includes(order.status))) return conflict('現在の注文状態では精算を開始できません。');
      if (body.kind === 'cancel' && String(body.cancelPassword || '') !== await getCancelPassword()) return NextResponse.json({ message: 'キャンセル用パスワードが違います。' }, { status: 403 });
      const setting = await Setting.findOne({ storeId: context.storeId, key: 'app_config' });
      let items = order.items;
      let total = 0;
      if (body.kind === 'edit') {
        if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100 || !isOptionalString(body.note, 500)) return badRequest('注文内容が正しくありません。');
        const newIds = body.items.filter((item: { lineId?: string }) => !item?.lineId).map((item: { productId: string }) => item?.productId);
        if (newIds.some((id: unknown) => !isValidObjectId(id))) return badRequest('商品が削除されています。内容を見直してください。');
        const products = await Product.find({ storeId: context.storeId, _id: { $in: newIds } });
        try { items = priceEditedItems(body.items, order.items, products, setting?.customizations || []); }
        catch (error) { return badRequest(error instanceof Error ? error.message : '金額を確認できません。'); }
        total = items.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);
        if (!Number.isSafeInteger(total) || total < 0 || total > 10000000) return badRequest('合計金額が範囲外です。');
        if (body.expectedTotal !== total) return conflict('価格が変更されています。内容を開き直し、新しい金額を確認してください。まだ受け渡しを行わないでください。');
      }
      const operation = { operationId: body.operationId, kind: body.kind, phase: 'prepared', beforeAmount: order.totalAmount, afterAmount: total, delta: total - order.totalAmount, items, note: body.kind === 'edit' ? body.note || '' : order.note || '', paymentMethod: order.paymentMethod || '', cashCalculation: setting?.cashCalculationEnabled === true && order.paymentMethod === setting.cashPaymentMethod, createdAt: new Date() };
      const updated = await Order.findOneAndUpdate({ _id: order._id, storeId: context.storeId, settlementLock: null, ...revisionFilter(body.expectedRevision) }, { $set: { settlementLock: body.operationId }, $push: { settlementOperations: operation }, $inc: { revision: 1 } }, { new: true });
      if (updated) return respond(updated);
      const latest = await Order.findOne({ _id: order._id, storeId: context.storeId });
      if (latest?.settlementOperations?.some((entry: SettlementOperation) => entry.operationId === body.operationId)) return respond(latest);
      return conflict('別の操作が先に開始されました。再取得してください。');
    }
    if (!op) return NextResponse.json({ message: '精算操作が見つかりません。' }, { status: 404 });
    if (op.phase === 'completed' || op.phase === 'aborted') return respond(order);
    if (order.settlementLock !== body.operationId) return conflict('精算のロックを確認できません。');
    const filter = { _id: order._id, storeId: context.storeId, settlementLock: body.operationId, ...revisionFilter(order.revision || 0) };
    const operations = order.settlementOperations.map((entry: SettlementOperation & { toObject?: () => SettlementOperation }) => entry.toObject ? entry.toObject() : entry);
    const index = operations.findIndex((entry: SettlementOperation) => entry.operationId === body.operationId);
    if (body.action === 'start') {
      if (op.phase === 'handling') return conflict('受け渡しは既に開始されています。担当者に確認し、操作IDで結果を再取得してください。二度受け渡さないでください。');
      operations[index] = { ...operations[index], phase: 'handling', handledAt: new Date() };
      const updated = await Order.findOneAndUpdate(filter, { $set: { settlementOperations: operations }, $inc: { revision: 1 } }, { new: true });
      if (!updated) return conflict('受け渡し開始の結果を操作IDで再取得してください。');
      return NextResponse.json({ order: updated, operation: updated.settlementOperations.find((entry: SettlementOperation) => entry.operationId === body.operationId), startedNow: true });
    }
    if (body.action === 'abort') {
      if (op.phase !== 'prepared') return conflict('受け渡し開始後は中止できません。受け渡し状況を確認して記録を完了してください。');
      operations[index] = { ...operations[index], phase: 'aborted' };
      const updated = await Order.findOneAndUpdate(filter, { $set: { settlementOperations: operations, settlementLock: null }, $inc: { revision: 1 } }, { new: true });
      if (!updated) return conflict('中止結果を再取得してください。');
      return respond(updated);
    }
    if (body.action !== 'commit' || (op.delta !== 0 && op.phase !== 'handling')) return badRequest('先に受け渡し開始を記録してください。');
    let amounts;
    try { amounts = settlementAmounts(op.beforeAmount, op.afterAmount, body.confirmed, op.cashCalculation, body.receivedAmount); }
    catch (error) { return badRequest(error instanceof Error ? error.message : '精算内容が正しくありません。'); }
    operations[index] = { ...operations[index], phase: 'completed', completedAt: new Date() };
    const updated = await Order.findOneAndUpdate(filter, {
      $set: { settlementLock: null, settlementOperations: operations, ...(op.kind === 'edit' ? { items: op.items, totalAmount: op.afterAmount, note: op.note } : { status: 'cancelled', cancelledAt: new Date() }) },
      $inc: { revision: 1 },
      ...(op.delta !== 0 ? { $push: { settlements: { requestId: op.operationId, kind: op.kind, beforeAmount: op.beforeAmount, afterAmount: op.afterAmount, ...amounts, paymentMethod: op.paymentMethod, createdAt: new Date() } } } : {}),
    }, { new: true });
    if (updated) return respond(updated);
    const latest = await Order.findOne({ _id: order._id, storeId: context.storeId });
    if (latest?.settlementOperations?.some((entry: SettlementOperation) => entry.operationId === body.operationId && entry.phase === 'completed')) return respond(latest);
    return conflict('確定結果を再取得してください。受け渡しを繰り返さないでください。');
  } catch { return NextResponse.json({ message: '精算結果が不明です。操作IDで再取得してください。受け渡しは繰り返さないでください。' }, { status: 500 }); }
}
