import { NextResponse } from 'next/server';
import { isObjectIdOrHexString } from 'mongoose';
import connectToDatabase from '@/lib/db';
import { isAdminRequest } from '@/lib/authorization';
import { migrateLegacyOwnerDataToStore } from '@/lib/store';
import { badRequest, isNonEmptyString } from '@/lib/validation';
import Store from '@/models/Store';
import Setting from '@/models/Setting';

export const dynamic = 'force-dynamic';

async function handleRequest(request: Request, save: boolean) {
  try {
    await connectToDatabase();
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    }
    const storeId = new URL(request.url).searchParams.get('storeId');
    if (!storeId || !isObjectIdOrHexString(storeId)) return badRequest('店舗を選択してください');
    const store = await Store.findById(storeId);
    if (!store) return NextResponse.json({ message: '店舗が見つかりません' }, { status: 404 });

    let paymentMethods: string[] = [];
    if (save) {
      const body = await request.json();
      if (!Array.isArray(body.paymentMethods) || body.paymentMethods.length > 30 ||
          body.paymentMethods.some((method: unknown) => !isNonEmptyString(method, 80))) {
        return badRequest('支払い方法が不正です');
      }
      paymentMethods = [...new Set<string>(body.paymentMethods.map((method: string) => method.trim()))];
    }

    await migrateLegacyOwnerDataToStore(store.ownerUserId, storeId);
    const filter = { storeId, key: 'app_config' };
    const setting = save
      ? await Setting.findOneAndUpdate(filter, {
        $set: { paymentMethods },
        $setOnInsert: { ownerId: store.ownerUserId, ...filter },
      }, { new: true, upsert: true, setDefaultsOnInsert: true })
      : await Setting.findOne(filter);
    return NextResponse.json({ paymentMethods: (setting ?? new Setting()).paymentMethods });
  } catch (error) {
    console.error('管理者支払い方法設定エラー:', error);
    return NextResponse.json({ message: save ? '支払い方法の保存に失敗しました' : '支払い方法の取得に失敗しました' }, { status: 500 });
  }
}

export const GET = (request: Request) => handleRequest(request, false);
export const POST = (request: Request) => handleRequest(request, true);
