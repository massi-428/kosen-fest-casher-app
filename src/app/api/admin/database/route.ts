import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    // 管理者権限チェック
    const userId = request.headers.get('x-user-id');
    if (userId !== 'admin') {
      return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    }

    const db = mongoose.connection.db;
    if (!db) throw new Error("DB Connection failed");

    // DB内の全コレクション一覧を取得
    const collections = await db.listCollections().toArray();
    
    // 各コレクションのドキュメント（データ）数を取得
    const stats = await Promise.all(collections.map(async (col) => {
      const count = await db.collection(col.name).countDocuments();
      return { name: col.name, count };
    }));

    // 名前順にソートして返す
    stats.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(stats, { status: 200 });
  } catch (error: any) {
    console.error("DB Get Error:", error);
    return NextResponse.json({ message: '取得エラー', error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    // 管理者権限チェック
    const userId = request.headers.get('x-user-id');
    if (userId !== 'admin') {
      return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    }

    const { collectionName, action } = await request.json();
    const db = mongoose.connection.db;
    if (!db) throw new Error("DB Connection failed");

    if (action === 'empty') {
      // 中身のデータを全て削除
      await db.collection(collectionName).deleteMany({});
    } else if (action === 'drop') {
      // コレクションごとデータベースから抹消
      await db.collection(collectionName).drop();
    } else {
      return NextResponse.json({ message: '不正なアクションです' }, { status: 400 });
    }

    return NextResponse.json({ message: `コレクション [${collectionName}] の処理が完了しました` }, { status: 200 });
  } catch (error: any) {
    console.error("DB Delete Error:", error);
    return NextResponse.json({ message: '削除エラー', error: error.message }, { status: 500 });
  }
}