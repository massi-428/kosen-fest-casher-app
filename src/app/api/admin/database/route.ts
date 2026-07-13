import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import mongoose from 'mongoose';
import { isAdminRequest } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    }

    const db = mongoose.connection.db;
    if (!db) throw new Error('DB Connection failed');

    const collections = await db.listCollections().toArray();
    const stats = await Promise.all(collections.map(async (col) => {
      const count = await db.collection(col.name).countDocuments();
      return { name: col.name, count };
    }));

    stats.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error('DB Get Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ message: '取得エラー', error: message }, { status: 500 });
  }
}