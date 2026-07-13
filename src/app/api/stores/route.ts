import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Store from '@/models/Store';
import User from '@/models/User';
import { getSession, unauthorizedResponse } from '@/lib/auth';
import { canCreateStore, ensureDefaultStore } from '@/lib/store';
import { badRequest, isNonEmptyString } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const session = getSession(request);
    if (!session?.userId) return unauthorizedResponse();

    const storeId = await ensureDefaultStore(session.userId);
    const stores = await Store.find({ ownerUserId: session.userId }).sort({ createdAt: 1 });

    return NextResponse.json({ activeStoreId: storeId, stores }, { status: 200 });
  } catch {
    return NextResponse.json({ message: '店舗情報の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const session = getSession(request);
    if (!session?.userId) return unauthorizedResponse();

    const body = await request.json();
    if (!isNonEmptyString(body.name, 80)) return badRequest('店舗名を正しく入力してください');

    const existingStore = await Store.findOne({ ownerUserId: session.userId });
    if (existingStore) {
      return NextResponse.json({ message: '1ユーザーにつき作成できる店舗は1件までです' }, { status: 409 });
    }

    const storeLimit = await canCreateStore();
    if (!storeLimit.allowed) {
      return NextResponse.json({ message: `店舗数の上限(${storeLimit.maxStores})に達しています` }, { status: 403 });
    }

    const store = await Store.create({
      name: body.name.trim(),
      ownerUserId: session.userId,
      memberUserIds: [session.userId],
    });

    await User.findOneAndUpdate(
      { userId: session.userId },
      {
        $set: {
          storeIds: [String(store._id)],
          activeStoreId: String(store._id),
        },
      },
    );

    return NextResponse.json(store, { status: 201 });
  } catch {
    return NextResponse.json({ message: '店舗の作成に失敗しました' }, { status: 500 });
  }
}
