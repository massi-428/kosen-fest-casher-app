import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { getActiveStoreContext } from '@/lib/store';
import { unauthorizedResponse, verifyPassword } from '@/lib/auth';
import User from '@/models/User';
import Order from '@/models/Order';
import TicketCounter from '@/models/TicketCounter';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();
    const body = await request.json().catch(() => null);
    if (body?.confirm !== true || typeof body.password !== 'string' || !body.password || body.password.length > 1024) {
      return NextResponse.json({ message: '確認にチェックし、ログインパスワードを入力してください。' }, { status: 400 });
    }
    const user = await User.findOne({ userId: context.userId });
    if (!user || !(await verifyPassword(body.password, user.password))) {
      return NextResponse.json({ message: 'ログインパスワードが違います。' }, { status: 403 });
    }
    const { storeId } = context;
    const result = await TicketCounter.db.transaction(async session => {
      // Serialize against order issuance and closing, which also write this counter.
      await TicketCounter.findOneAndUpdate({ storeId }, { $inc: { businessRevision: 1 } }, { upsert: true, new: true, session });
      const pending = await Order.exists({ storeId, $or: [
        { status: { $in: ['active', 'pending'] } },
        { settlementLock: { $nin: [null, ''] } },
      ] }).session(session);
      if (pending) return { status: 409, message: '未提供・保留・精算中の注文があります。処理を完了してからリセットしてください。' };
      await TicketCounter.updateOne({ storeId }, { $set: { lastIssuedNumber: 0 } }, { session });
      return { status: 200, message: '整理券の発券順を先頭に戻しました。次回は1番から、紛失指定の番号を除いて発行します。' };
    });
    return NextResponse.json({ message: result.message }, { status: result.status });
  } catch {
    return NextResponse.json({ message: 'リセット結果を確認できません。注文画面の整理券番号を確認してください。' }, { status: 500 });
  }
}
