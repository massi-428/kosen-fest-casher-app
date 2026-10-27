import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '@/lib/db';
import { getSessionUser } from '@/lib/authorization';
import { verifyPassword } from '@/lib/auth';
import User from '@/models/User';
import Order from '@/models/Order';
import TicketCounter from '@/models/TicketCounter';
import Store from '@/models/Store';
import CheckoutQuote from '@/models/CheckoutQuote';
import Setting from '@/models/Setting';
import { businessDate } from '@/lib/business-day';

const enabled = () => process.env.ENABLE_TEST_DATA_RESET === 'true'
  && process.env.VERCEL_ENV !== 'production'
  && (process.env.VERCEL_ENV === 'preview' || (!process.env.VERCEL && process.env.NODE_ENV === 'development'))
  && /^test_[a-zA-Z0-9_-]+$/.test(process.env.MONGODB_DB || '');

export async function GET(request: Request) {
  if (!enabled()) return NextResponse.json({ enabled: false });
  await connectToDatabase();
  const user = await getSessionUser(request);
  if (user?.role !== 'admin') return NextResponse.json({ message: '権限がありません' }, { status: 403 });
  return NextResponse.json({ enabled: true, database: process.env.MONGODB_DB });
}

export async function POST(request: Request) {
  if (!enabled()) return NextResponse.json({ message: 'Not Found' }, { status: 404 });
  try {
    await connectToDatabase();
    const sessionUser = await getSessionUser(request);
    if (sessionUser?.role !== 'admin') return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    if (mongoose.connection.db?.databaseName !== process.env.MONGODB_DB) {
      return NextResponse.json({ message: 'テストDBの接続を確認できません' }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    if (body?.confirm !== true || typeof body.password !== 'string' || !body.password || body.password.length > 1024) {
      return NextResponse.json({ message: 'パスワードと確認チェックが必要です' }, { status: 400 });
    }
    const user = await User.findOne({ userId: sessionUser.userId });
    if (!user || !(await verifyPassword(body.password, user.password))) {
      return NextResponse.json({ message: 'パスワードが違います' }, { status: 403 });
    }
    await mongoose.connection.transaction(async session => {
      // Order issuance writes the same counters, serializing reset against in-flight orders.
      // Keep stores closed after reset until an administrator explicitly reopens them.
      const stores = await Store.find({}).session(session);
      for (const store of stores) {
        await TicketCounter.findOneAndUpdate({ storeId: String(store._id) }, {
          $inc: { businessRevision: 1 },
          $set: { closedDate: businessDate(), closedAt: new Date(), lastIssuedNumber: 0 },
        }, { upsert: true, new: true, session });
      }
      await Order.deleteMany({}, { session });
      await CheckoutQuote.deleteMany({}, { session });
      await Setting.updateMany({ key: 'app_config' }, { $set: { pendingItemCount: 0 } }, { session });
    });
    return NextResponse.json({ message: 'テストDBの注文・会計情報をリセットし、全店舗の本日の受付を停止しました。「営業再開」で店舗を再開し、各端末を再読み込みしてください。' });
  } catch {
    return NextResponse.json({ message: 'リセット結果を確認できません。DBの状態を確認してください。' }, { status: 500 });
  }
}
