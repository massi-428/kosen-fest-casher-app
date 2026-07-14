import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { isAdminRequest } from '@/lib/authorization';
import { getSystemSettings } from '@/lib/systemSettings';
import { badRequest, isNonEmptyString } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const settings = await getSystemSettings();
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    console.error('システム設定取得エラー:', error);
    return NextResponse.json(
      { message: 'システム設定の取得に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const maxStores = Number(body.maxStores);
    if (!Number.isInteger(maxStores) || maxStores < 1 || maxStores > 9999) {
      return badRequest('店舗数上限が正しくありません。');
    }
    if (body.cancelPassword !== undefined && !isNonEmptyString(body.cancelPassword, 80)) {
      return badRequest('キャンセル用パスワードが正しくありません。');
    }

    const settings = await getSystemSettings();
    settings.maxStores = maxStores;
    if (body.cancelPassword !== undefined) settings.cancelPassword = String(body.cancelPassword).trim();
    await settings.save();

    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    console.error('システム設定保存エラー:', error);
    return NextResponse.json(
      { message: 'システム設定の保存に失敗しました。' },
      { status: 500 },
    );
  }
}
