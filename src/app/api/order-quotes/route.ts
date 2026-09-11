import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { getActiveStoreContext } from '@/lib/store';
import { unauthorizedResponse } from '@/lib/auth';
import { badRequest, isNonEmptyString, isOptionalString, isValidObjectId } from '@/lib/validation';
import Product from '@/models/Product';
import Setting from '@/models/Setting';
import CheckoutQuote from '@/models/CheckoutQuote';
import { priceEditedItems } from '@/lib/order-accounting';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    // Do not accept a first quote before its request-ID uniqueness index is ready.
    await CheckoutQuote.init();
    const body = await request.json();
    if (!isNonEmptyString(body.requestId, 100)) return badRequest('操作IDが正しくありません。');
    const filter = { storeId: context.storeId, userId: context.userId, requestId: body.requestId };
    const existing = await CheckoutQuote.findOne(filter);
    if (existing) return NextResponse.json(existing);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100 || !isOptionalString(body.note, 500)) return badRequest('カートの内容が正しくありません。');
    const ids = body.items.map((item: { productId?: unknown }) => item?.productId);
    if (ids.some((id: unknown) => !isValidObjectId(id))) return badRequest('商品が削除されています。カートから取り除いてください。');
    const [products, settings] = await Promise.all([Product.find({ storeId: context.storeId, _id: { $in: ids } }), Setting.findOne({ storeId: context.storeId, key: 'app_config' })]);
    for (const id of ids) {
      const product = products.find(p => String(p._id) === id);
      if (!product) return badRequest('商品が削除されています。カートから取り除いてください。');
      if (product.isAvailable === false) return badRequest(product.name + ' は売り切れです。カートから取り除いてください。');
    }
    for (const item of body.items) for (const name of item.selectedOptionNames || []) if (!(settings?.customizations || []).some((o: { name: string }) => o.name === name)) return badRequest(name + ' は削除されたオプションです。詳細設定を見直してください。');
    let items;
    try { items = priceEditedItems(body.items.map((item: { productId: string; quantity: number; detail?: string; selectedOptionNames?: string[] }) => ({ productId: item.productId, quantity: item.quantity, detail: item.detail || '', selectedOptionNames: item.selectedOptionNames || [] })), [], products, settings?.customizations || []); }
    catch (error) { return badRequest(error instanceof Error ? error.message : '商品の状態を確認してください。'); }
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    if (!Number.isSafeInteger(totalAmount) || totalAmount < 0 || totalAmount > 10000000) return badRequest('合計金額が範囲外です。');
    const quote = await CheckoutQuote.findOneAndUpdate(filter, { $setOnInsert: { ...filter, items, totalAmount, note: body.note || '', paymentMethods: settings?.paymentMethods || [], cashCalculationEnabled: settings?.cashCalculationEnabled === true, cashPaymentMethod: settings?.cashPaymentMethod || '現金' } }, { upsert: true, new: true });
    return NextResponse.json(quote);
  } catch { return NextResponse.json({ message: '会計金額を確認できません。まだ受け渡しをせず、再試行してください。' }, { status: 500 }); }
}
