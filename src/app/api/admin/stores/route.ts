import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { isAdminRequest } from '@/lib/authorization';
import User from '@/models/User';
import Store from '@/models/Store';

export const dynamic = 'force-dynamic';

type StoreDocument = {
  _id: unknown;
  name?: string;
  ownerUserId?: string;
  memberUserIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
};

const requireAdmin = (request: Request) => isAdminRequest(request);

const toStoreSummary = (store: StoreDocument) => ({
  id: String(store._id),
  name: store.name || '',
  ownerUserId: store.ownerUserId || '',
  memberUserIds: store.memberUserIds || [],
  createdAt: store.createdAt,
  updatedAt: store.updatedAt,
});

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    }

    const [users, stores] = await Promise.all([
      User.find({ userId: { $ne: 'admin' } }, { userId: 1, storeIds: 1, activeStoreId: 1, createdAt: 1 }).sort({ userId: 1 }).lean(),
      Store.find({ ownerUserId: { $ne: 'admin' }, memberUserIds: { $ne: 'admin' } }).sort({ ownerUserId: 1, createdAt: 1 }).lean(),
    ]);

    const storesByOwner = new Map<string, ReturnType<typeof toStoreSummary>[]>();
    stores.forEach((store) => {
      const summary = toStoreSummary(store);
      const ownerStores = storesByOwner.get(summary.ownerUserId) || [];
      ownerStores.push(summary);
      storesByOwner.set(summary.ownerUserId, ownerStores);
    });

    const userRows = users.map((user) => ({
      userId: user.userId,
      storeIds: user.storeIds || [],
      activeStoreId: user.activeStoreId || '',
      createdAt: user.createdAt,
      stores: storesByOwner.get(user.userId) || [],
    }));

    const orphanStores = stores
      .map(toStoreSummary)
      .filter((store) => !users.some((user) => user.userId === store.ownerUserId));

    return NextResponse.json({
      users: userRows,
      orphanStores,
      totalUsers: users.length,
      totalStores: stores.length,
    }, { status: 200 });
  } catch (error) {
    console.error('Admin stores GET error:', error);
    return NextResponse.json(
      { message: '店舗情報の取得に失敗しました', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}

// Legacy cleanup could delete operational data. This operation is retired.
export async function POST() {
  return NextResponse.json({ message: '店舗データの自動整理は廃止しました' }, { status: 410 });
}
