import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Product from '@/models/Product';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();

    let products = await Product.find({ ownerId: userId }).sort({ createdAt: 1 });
    if (products.length === 0) {
      const DEFAULT_MENU = [
        { name: "ブレンドコーヒー", price: 450 },
        { name: "アイスコーヒー", price: 450 },
        { name: "カフェラテ", price: 550 },
        { name: "オレンジジュース", price: 400 },
        { name: "ミックスサンド", price: 650 },
        { name: "チーズケーキ", price: 500 },
      ];
      products = await Product.insertMany(DEFAULT_MENU.map(p => ({ ...p, ownerId: userId })));
    }
    return NextResponse.json(products, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    const body = await request.json();
    const newProduct = await Product.create({ ownerId: userId, name: body.name, price: Number(body.price) });
    return NextResponse.json(newProduct, { status: 201 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    const { _id, name, price } = await request.json();
    const updated = await Product.findOneAndUpdate({ _id, ownerId: userId }, { name, price: Number(price) }, { new: true });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    const { _id } = await request.json();
    await Product.findOneAndDelete({ _id, ownerId: userId });
    return NextResponse.json({ message: '削除完了' }, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}
