import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Setting from '@/models/Setting';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString, toValidSignedPrice } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type SettingUpdateData = {
  maxTicketNumber?: number;
  maxPendingItemCount?: number;
  maxItemsPerOrder?: number;
  acceptingOrders?: boolean;
  orderStopReason?: string;
  paymentMethods?: string[];
  customizations?: { name: string; price: number }[];
  lostTickets?: number[];
  cancelPassword?: string;
};

type IncomingCustomization = {
  name?: unknown;
  price?: unknown;
};

const defaultSetting = (userId: string, storeId: string) => ({
  ownerId: userId,
  storeId,
  key: 'app_config',
  maxTicketNumber: 30,
  maxPendingItemCount: 30,
  maxItemsPerOrder: 10,
  acceptingOrders: true,
  orderStopReason: '',
  pendingItemCount: 0,
  paymentMethods: ['現金', 'クレジットカード', 'PayPay', '交通系IC'],
  customizations: [
    { name: '氷少なめ', price: 0 },
    { name: 'ネギ抜き', price: 0 },
    { name: '大盛り', price: 100 },
    { name: 'テイクアウト', price: 0 },
  ],
  lostTickets: [],
  cancelPassword: '0000',
});

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    let setting = await Setting.findOne({ storeId: context.storeId, key: 'app_config' });

    if (!setting) {
      try {
        setting = await Setting.create(defaultSetting(context.userId, context.storeId));
      } catch {
        setting = await Setting.findOne({ storeId: context.storeId, key: 'app_config' });
      }
    }

    return NextResponse.json(setting, { status: 200 });
  } catch (error) {
    console.error('設定取得エラー:', error);
    return NextResponse.json({ message: '設定の取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const body = await request.json();
    const updateData: SettingUpdateData = {};

    if (body.maxTicketNumber !== undefined) {
      const maxTicketNumber = Number(body.maxTicketNumber);
      if (!Number.isInteger(maxTicketNumber) || maxTicketNumber < 1 || maxTicketNumber > 9999) return badRequest('整理番号の最大値が不正です');
      updateData.maxTicketNumber = maxTicketNumber;
    }

    if (body.maxPendingItemCount !== undefined) {
      const value = Number(body.maxPendingItemCount);
      if (!Number.isInteger(value) || value < 1 || value > 9999) return badRequest('未提供本数上限が不正です。');
      updateData.maxPendingItemCount = value;
    }

    if (body.maxItemsPerOrder !== undefined) {
      const value = Number(body.maxItemsPerOrder);
      if (!Number.isInteger(value) || value < 1 || value > 999) return badRequest('1注文の本数上限が不正です。');
      updateData.maxItemsPerOrder = value;
    }

    if (body.acceptingOrders !== undefined) {
      if (typeof body.acceptingOrders !== 'boolean') return badRequest('受注状態が不正です。');
      updateData.acceptingOrders = body.acceptingOrders;
    }

    if (body.orderStopReason !== undefined) {
      if (typeof body.orderStopReason !== 'string' || body.orderStopReason.length > 200) return badRequest('受注停止理由が不正です。');
      updateData.orderStopReason = body.orderStopReason.trim();
    }

    if (body.paymentMethods) {
      if (!Array.isArray(body.paymentMethods) || body.paymentMethods.length > 30 || body.paymentMethods.some((method: unknown) => !isNonEmptyString(method, 80))) return badRequest('支払い方法が不正です');
      updateData.paymentMethods = (body.paymentMethods as string[]).map((method) => method.trim());
    }

    if (body.customizations) {
      if (!Array.isArray(body.customizations) || body.customizations.length > 100) return badRequest('オプション設定が不正です');
      const customizations = (body.customizations as IncomingCustomization[]).map((item) => {
        const price = toValidSignedPrice(item?.price ?? 0);
        if (!isNonEmptyString(item?.name, 80) || price === null) return null;
        return { name: String(item.name).trim(), price };
      });
      if (customizations.some((item) => item === null)) return badRequest('オプション設定が不正です');
      updateData.customizations = customizations.filter((item): item is { name: string; price: number } => item !== null);
    }

    if (body.lostTickets !== undefined) {
      if (!Array.isArray(body.lostTickets) || body.lostTickets.some((num: unknown) => !Number.isInteger(Number(num)) || Number(num) < 1 || Number(num) > 9999)) return badRequest('紛失整理番号が不正です');
      updateData.lostTickets = body.lostTickets.map((num: number | string) => Number(num));
    }

    if (body.cancelPassword !== undefined) {
      if (!isNonEmptyString(body.cancelPassword, 80)) return badRequest('キャンセル用パスワードが不正です');
      updateData.cancelPassword = body.cancelPassword;
    }

    const updated = await Setting.findOneAndUpdate(
      { storeId: context.storeId, key: 'app_config' },
      {
        $set: updateData,
        $setOnInsert: defaultSetting(context.userId, context.storeId),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error('設定保存エラー:', error);
    return NextResponse.json({ message: '設定の保存に失敗しました。' }, { status: 500 });
  }
}
