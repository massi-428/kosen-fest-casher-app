import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Setting from '@/models/Setting';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    
    let setting = await Setting.findOne({ ownerId: userId, key: 'app_config' });

    if (!setting) {
      try {
        setting = await Setting.create({ 
          ownerId: userId,
          key: 'app_config', 
          maxTicketNumber: 30,
          paymentMethods: ['現金', 'クレジットカード', 'PayPay', '交通系IC'],
          customizations: [
            { name: '氷少なめ', price: 0 },
            { name: 'ネギ抜き', price: 0 },
            { name: '大盛り', price: 100 },
            { name: 'テイクアウト', price: 0 }
          ],
          lostTickets: [],
          cancelPassword: '0000'
        });
      } catch (e: any) {
        // 並列リクエスト等で作成済みの場合の再取得
        setting = await Setting.findOne({ ownerId: userId, key: 'app_config' });
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
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    
    const updateData: any = {};
    if (body.maxTicketNumber !== undefined) updateData.maxTicketNumber = Number(body.maxTicketNumber);
    if (body.paymentMethods) updateData.paymentMethods = body.paymentMethods;
    if (body.customizations) updateData.customizations = body.customizations;
    if (body.lostTickets !== undefined) updateData.lostTickets = body.lostTickets;
    
    // ★追加: キャンセル用パスワードの更新
    if (body.cancelPassword !== undefined) updateData.cancelPassword = body.cancelPassword;

    const updated = await Setting.findOneAndUpdate(
      { ownerId: userId, key: 'app_config' },
      { 
        $set: updateData,
        $setOnInsert: { ownerId: userId, key: 'app_config' }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error: any) {
    console.error("Settings POST Error:", error);
    return NextResponse.json({ message: '保存エラー', error: error.message }, { status: 500 });
  }
}
