import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Product from '@/models/Product';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString, isValidObjectId, toValidPrice } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const DEFAULT_MENU = [
  { name: 'ブレンドコーヒー', price: 450 },
  { name: 'アイスコーヒー', price: 450 },
  { name: 'カフェラテ', price: 550 },
  { name: 'オレンジジュース', price: 400 },
  { name: 'ミックスサンド', price: 650 },
  { name: 'チーズケーキ', price: 500 },
];

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    let products = await Product.find({ storeId: context.storeId }).sort({ createdAt: 1 });
    if (products.length === 0) {
      products = await Product.insertMany(DEFAULT_MENU.map((product) => ({ ...product, ownerId: context.userId, storeId: context.storeId })));
    }

    return NextResponse.json(products, { status: 200 });
  } catch {
    return NextResponse.json({ message: '商品情報の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const body = await request.json();
    const price = toValidPrice(body.price);
    if (!isNonEmptyString(body.name) || price === null) return badRequest('商品名と価格を正しく入力してください');

    const newProduct = await Product.create({ ownerId: context.userId, storeId: context.storeId, name: body.name.trim(), price });
    return NextResponse.json(newProduct, { status: 201 });
  } catch {
    return NextResponse.json({ message: '商品の作成に失敗しました' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { _id, name, price } = await request.json();
    const nextPrice = toValidPrice(price);
    if (!isValidObjectId(_id) || !isNonEmptyString(name) || nextPrice === null) return badRequest('商品情報が不正です');

    const updated = await Product.findOneAndUpdate({ _id, storeId: context.storeId }, { name: name.trim(), price: nextPrice }, { new: true });
    if (!updated) return NextResponse.json({ message: '商品が見つかりません' }, { status: 404 });

    return NextResponse.json(updated, { status: 200 });
  } catch {
    return NextResponse.json({ message: '商品の更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { _id } = await request.json();
    if (!isValidObjectId(_id)) return badRequest('商品IDが不正です');

    await Product.findOneAndDelete({ _id, storeId: context.storeId });
    return NextResponse.json({ message: '削除完了' }, { status: 200 });
  } catch {
    return NextResponse.json({ message: '商品の削除に失敗しました' }, { status: 500 });
  }
}
