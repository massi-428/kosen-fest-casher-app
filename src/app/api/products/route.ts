import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Product from '@/models/Product';

// キャッシュ無効化（常に最新の商品リストを取得するため）
export const dynamic = 'force-dynamic';

// 初期データ（データが空っぽの時にこれらを自動登録します）
const DEFAULT_MENU = [
  { name: "ブレンドコーヒー", price: 450 },
  { name: "アイスコーヒー", price: 450 },
  { name: "カフェラテ", price: 550 },
  { name: "オレンジジュース", price: 400 },
  { name: "ミックスサンド", price: 650 },
  { name: "チーズケーキ", price: 500 },
];

// GET: 商品一覧を取得
export async function GET() {
  try {
    await connectToDatabase();
    let products = await Product.find({}).sort({ createdAt: 1 });

    // もし商品が1つもなければ、初期データを投入する
    if (products.length === 0) {
      products = await Product.insertMany(DEFAULT_MENU);
    }

    return NextResponse.json(products, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: '取得エラー' }, { status: 500 });
  }
}

// POST: 新しい商品を追加
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    
    if (!body.name || !body.price) {
      return NextResponse.json({ message: '名前と価格は必須です' }, { status: 400 });
    }

    const newProduct = await Product.create({
      name: body.name,
      price: Number(body.price)
    });

    return NextResponse.json(newProduct, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: '作成エラー' }, { status: 500 });
  }
}

// PUT: 商品情報を更新
export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const { _id, name, price } = await request.json();

    const updatedProduct = await Product.findByIdAndUpdate(
      _id,
      { name, price: Number(price) },
      { new: true } // 更新後のデータを返す
    );

    return NextResponse.json(updatedProduct, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: '更新エラー' }, { status: 500 });
  }
}

// DELETE: 商品を削除
export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const { _id } = await request.json();

    await Product.findByIdAndDelete(_id);

    return NextResponse.json({ message: '削除しました' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: '削除エラー' }, { status: 500 });
  }
}