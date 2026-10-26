import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { getActiveStoreContext } from '@/lib/store';
import { unauthorizedResponse } from '@/lib/auth';
import TicketCounter from '@/models/TicketCounter';
import Order from '@/models/Order';
import { businessDate } from '@/lib/business-day';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const body = await request.json();
    const today = businessDate();
    if (body?.date !== today || body?.confirm !== true) return NextResponse.json({ message: '本日の営業日を確認してから〆作業を実行してください' }, { status: 400 });
    const { storeId } = context;
    const result = await TicketCounter.db.transaction(async session => {
      const counter = await TicketCounter.findOneAndUpdate({ storeId }, { $inc: { businessRevision: 1 } }, { upsert: true, new: true, session });
      if (counter.closedDate === today) return { status: 200, message: '本日の〆作業は完了済みです' };
      const pending = await Order.exists({ storeId, $or: [{ status: { $in: ['active', 'pending'] } }, { settlementLock: { $nin: [null, ''] } }] }).session(session);
      if (pending) return { status: 409, message: '未提供・保留・精算中の注文があります。注文履歴とKD画面で処理を完了してください' };
      await TicketCounter.updateOne({ storeId }, { $set: { closedDate: today, closedAt: new Date(), lastIssuedNumber: 0 } }, { session });
      return { status: 200, message: '本日の営業を締め切りました。翌日の整理券は先頭から発行します（紛失指定の番号は除外）' };
    });
    return NextResponse.json({ message: result.message }, { status: result.status });
  } catch { return NextResponse.json({ message: '〆作業の結果を確認できません。画面を更新して状態を確認してください' }, { status: 500 }); }
}
