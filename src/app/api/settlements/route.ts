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
      if (!order) return NextResponse.json({ message: '操作は見つかりません。まだ支払いや返金を行わないでください。' }, { status: 404 });
      return NextResponse.json({ order, operation: order.settlementOperations.find((op: SettlementOperation) => op.operationId === id) });
    }
    const orders = await Order.find({ storeId: context.storeId, settlementLock: { $type: 'string' } }).sort({ createdAt: 1 }).limit(100);
    return NextResponse.json(orders);
  } catch { return NextResponse.json({ message: '支払い・返金の状況を取得できません。支払いや返金を繰り返さず、再読み込みしてください。' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const body = await request.json();
    if (!isValidObjectId(body.orderId) || !isNonEmptyString(body.operationId, 100)) return badRequest('注文の情報が正しくありません。注文履歴から開き直してください。');
    const order = await Order.findOne({ _id: body.orderId, storeId: context.storeId });
    if (!order) return NextResponse.json({ message: '注文が見つかりません。' }, { status: 404 });
    const op: SettlementOperation | undefined = order.settlementOperations?.find((entry: SettlementOperation) => entry.operationId === body.operationId);
    const respond = (updated: typeof order) => NextResponse.json({ order: updated, operation: updated.settlementOperations.find((entry: SettlementOperation) => entry.operationId === body.operationId) });
    if (body.action === 'prepare') {
      if (op) return respond(order);
      if (order.settlementLock) return conflict('この注文は変更・返金の手続き中です。注文履歴の「手続きが未完了の注文」から続きを行ってください。');
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== (order.revision || 0)) return conflict('注文が変更されました。最新の内容を開き直してください。まだ支払いや返金を行わないでください。');
      if (body.kind !== 'edit' && body.kind !== 'cancel') return badRequest('手続きの種類を確認できません。注文履歴から開き直してください。');
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
        if (body.expectedTotal !== total) return conflict('価格が変更されています。内容を開き直し、新しい金額を確認してください。まだ支払いや返金を行わないでください。');
      }
      const operation = { operationId: body.operationId, kind: body.kind, phase: 'prepared', beforeAmount: order.totalAmount, afterAmount: total, delta: total - order.totalAmount, items, note: body.kind === 'edit' ? body.note || '' : order.note || '', paymentMethod: order.paymentMethod || '', cashCalculation: setting?.cashCalculationEnabled === true && order.paymentMethod === setting.cashPaymentMethod, createdAt: new Date() };
      const updated = await Order.findOneAndUpdate({ _id: order._id, storeId: context.storeId, settlementLock: null, ...revisionFilter(body.expectedRevision) }, { $set: { settlementLock: body.operationId }, $push: { settlementOperations: operation }, $inc: { revision: 1 } }, { new: true });
      if (updated) return respond(updated);
      const latest = await Order.findOne({ _id: order._id, storeId: context.storeId });
      if (latest?.settlementOperations?.some((entry: SettlementOperation) => entry.operationId === body.operationId)) return respond(latest);
      return conflict('別の操作が先に開始されました。再読み込みしてください。');
    }
    if (!op) return NextResponse.json({ message: '変更・返金の手続きが見つかりません。注文履歴から確認してください。' }, { status: 404 });
    if (op.phase === 'completed' || op.phase === 'aborted') return respond(order);
    if (order.settlementLock !== body.operationId) return conflict('別の操作で注文が変わりました。注文履歴から最新の状態を確認してください。');
    const filter = { _id: order._id, storeId: context.storeId, settlementLock: body.operationId, ...revisionFilter(order.revision || 0) };
    const operations = order.settlementOperations.map((entry: SettlementOperation & { toObject?: () => SettlementOperation }) => entry.toObject ? entry.toObject() : entry);
    const index = operations.findIndex((entry: SettlementOperation) => entry.operationId === body.operationId);
    if (body.action === 'start') {
      if (op.phase === 'handling') return conflict('支払い・返金の手続きは開始済みです。担当者に確認してから「最新の状態を確認する」を押してください。支払いや返金を繰り返さないでください。');
      operations[index] = { ...operations[index], phase: 'handling', handledAt: new Date() };
      const updated = await Order.findOneAndUpdate(filter, { $set: { settlementOperations: operations }, $inc: { revision: 1 } }, { new: true });
      if (!updated) return conflict('手続きが開始できたか確認が必要です。「最新の状態を確認する」を押してください。');
      return NextResponse.json({ order: updated, operation: updated.settlementOperations.find((entry: SettlementOperation) => entry.operationId === body.operationId), startedNow: true });
    }
    if (body.action === 'abort') {
      if (op.phase !== 'prepared') return conflict('支払い・返金の手続き開始後は、元に戻せません。担当者に支払い・返金が済んだか確認し、注文の変更・キャンセルを確定してください。');
      operations[index] = { ...operations[index], phase: 'aborted' };
      const updated = await Order.findOneAndUpdate(filter, { $set: { settlementOperations: operations, settlementLock: null }, $inc: { revision: 1 } }, { new: true });
      if (!updated) return conflict('中止結果を再読み込みしてください。');
      return respond(updated);
    }
    if (body.action !== 'commit' || (op.delta !== 0 && op.phase !== 'handling')) return badRequest('先に「返金の手続きへ進む」または「追加のお支払いの手続きへ進む」を押してください。');
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
    return conflict('確定結果を再読み込みしてください。支払いや返金を繰り返さないでください。');
  } catch { return NextResponse.json({ message: '保存できたか確認できません。「最新の状態を確認する」を押してください。支払いや返金は繰り返さないでください。' }, { status: 500 }); }
}
