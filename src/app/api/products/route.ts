import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Product from '@/models/Product';
import Store from '@/models/Store';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString, isValidObjectId, toValidPrice } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const products = await Product.find({ storeId: context.storeId }).sort({ createdAt: 1 });

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

    const newProduct = await Product.create({ ownerId: context.userId, storeId: context.storeId, name: body.name.trim(), price, isAvailable: true });
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

    const { _id, name, price, isAvailable } = await request.json();
    if (!isValidObjectId(_id)) return badRequest('商品IDが不正です');

    const updateData: { name?: string; price?: number; isAvailable?: boolean } = {};
    if (name !== undefined || price !== undefined) {
      const nextPrice = toValidPrice(price);
      if (!isNonEmptyString(name) || nextPrice === null) return badRequest('商品情報が不正です');
      updateData.name = name.trim();
      updateData.price = nextPrice;
    }
    if (isAvailable !== undefined) {
      if (typeof isAvailable !== 'boolean') return badRequest('販売状態が不正です');
      updateData.isAvailable = isAvailable;
    }
    if (Object.keys(updateData).length === 0) return badRequest('更新する商品情報がありません');

    const updated = await Product.findOneAndUpdate({ _id, storeId: context.storeId }, updateData, { new: true });
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

    const result = await Product.db.transaction(async (session) => {
      // All deletions in this store write the same document first. This prevents
      // two transactions from each seeing two products and deleting both.
      const store = await Store.updateOne(
        { _id: context.storeId },
        { $inc: { __v: 1 } },
        { session },
      );
      if (!store.matchedCount) return { status: 404, message: '店舗が見つかりません' };

      const product = await Product.findOne({ _id, storeId: context.storeId }).session(session);
      if (!product) return { status: 404, message: '商品が見つかりません' };
      const count = await Product.countDocuments({ storeId: context.storeId }).session(session);
      if (count <= 1) return { status: 409, message: '商品は0件にできません。新しい商品を追加してから削除してください。' };

      await Product.findOneAndDelete({ _id, storeId: context.storeId }, { session });
      return { status: 200, message: '削除完了' };
    });
    return NextResponse.json({ message: result.message }, { status: result.status });
  } catch {
    return NextResponse.json({ message: '商品の削除に失敗しました' }, { status: 500 });
  }
}
