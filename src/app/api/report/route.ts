import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    if (!dateParam) {
      return NextResponse.json({ message: '日付を指定してください' }, { status: 400 });
    }

    // 指定された日付の範囲（00:00:00.000 ~ 23:59:59.999）を作成
    // ※ サーバーのタイムゾーン設定に依存する場合がありますが、簡易的に実装します
    const startDate = new Date(dateParam);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(dateParam);
    endDate.setHours(23, 59, 59, 999);

    // 指定期間の注文を取得（activeなものだけでなく、completedも対象。キャンセル扱いのpending等は除外する場合は調整）
    // ここでは 'completed' (完了済み) と 'active' (調理中) を売上として計上します
    const orders = await Order.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ['active', 'completed'] } // 保留(pending)は売上に含めない
    }).sort({ createdAt: 1 });

    return NextResponse.json(orders, { status: 200 });

  } catch (error) {
    console.error("Report API Error:", error);
    return NextResponse.json({ message: '集計データの取得に失敗しました' }, { status: 500 });
  }
}