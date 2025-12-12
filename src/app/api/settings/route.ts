import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Setting from '@/models/Setting';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    
    let setting = await Setting.findOne({ key: 'app_config' });

    if (!setting) {
      setting = await Setting.create({ 
        key: 'app_config', 
        maxTicketNumber: 30,
        paymentMethods: ['現金', 'クレジットカード', 'PayPay', '交通系IC'],
        customizations: ['氷少なめ', 'ネギ抜き', 'テイクアウト', '大盛り']
      });
    }

    return NextResponse.json(setting, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: '取得エラー', error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    
    const updateData: any = {};

    if (body.maxTicketNumber) {
      const maxNum = Number(body.maxTicketNumber);
      if (maxNum > 0) updateData.maxTicketNumber = maxNum;
    }

    if (body.paymentMethods && Array.isArray(body.paymentMethods)) {
      updateData.paymentMethods = body.paymentMethods;
    }

    // ★追加: 別注オプションの更新
    if (body.customizations && Array.isArray(body.customizations)) {
      updateData.customizations = body.customizations;
    }

    const updated = await Setting.findOneAndUpdate(
      { key: 'app_config' },
      updateData,
      { new: true, upsert: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: '保存エラー', error: error.message }, { status: 500 });
  }
}