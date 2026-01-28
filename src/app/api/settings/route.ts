import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Setting from '@/models/Setting';

export const dynamic = 'force-dynamic';

// 共通設定のキー
const GLOBAL_KEY = 'global_config';

export async function GET() {
  try {
    await connectToDatabase();
    
    // ユーザーIDに関係なく、共通の設定を取得
    let setting = await Setting.findOne({ key: GLOBAL_KEY });

    if (!setting) {
      try {
        setting = await Setting.create({ 
          key: GLOBAL_KEY, 
          maxTicketNumber: 30,
          paymentMethods: ['現金', 'クレジットカード', 'PayPay', '交通系IC'],
          customizations: [
            { name: '氷少なめ', price: 0 },
            { name: '大盛り', price: 100 }
          ],
          lostTickets: [] 
        });
      } catch (e: any) {
        // 並列リクエスト等で作成済みの場合の再取得
        setting = await Setting.findOne({ key: GLOBAL_KEY });
      }
    }

    return NextResponse.json(setting, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: '取得エラー', error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    // 認証チェックはあえて外すか、ログインしていればOKとする（今回は緩めに設定）
    
    const body = await request.json();
    
    const updateData: any = {};
    if (body.maxTicketNumber !== undefined) updateData.maxTicketNumber = Number(body.maxTicketNumber);
    if (body.paymentMethods) updateData.paymentMethods = body.paymentMethods;
    if (body.customizations) updateData.customizations = body.customizations;
    if (body.lostTickets !== undefined) updateData.lostTickets = body.lostTickets;

    // 共通設定を更新
    const updated = await Setting.findOneAndUpdate(
      { key: GLOBAL_KEY },
      { 
        $set: updateData,
        $setOnInsert: { key: GLOBAL_KEY }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error: any) {
    console.error("Settings POST Error:", error);
    return NextResponse.json({ message: '保存エラー', error: error.message }, { status: 500 });
  }
}