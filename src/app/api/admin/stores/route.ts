import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { isAdminRequest } from '@/lib/authorization';
import User from '@/models/User';
import Store from '@/models/Store';
import Product from '@/models/Product';
import Order from '@/models/Order';
import Setting from '@/models/Setting';

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

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ message: '権限がありません' }, { status: 403 });
    }

    const users = await User.find({ userId: { $ne: 'admin' } }).sort({ userId: 1 });
    const result = {
      fixedUsers: 0,
      removedStores: 0,
      createdStores: 0,
      migratedDocuments: 0,
    };

    const adminStores = await Store.find({ $or: [{ ownerUserId: 'admin' }, { memberUserIds: 'admin' }] });
    if (adminStores.length > 0) {
      const adminStoreIds = adminStores.map((store) => store._id);
      const [products, orders, settings, deletedStores] = await Promise.all([
        Product.deleteMany({ storeId: { $in: adminStoreIds } }),
        Order.deleteMany({ storeId: { $in: adminStoreIds } }),
        Setting.deleteMany({ storeId: { $in: adminStoreIds } }),
        Store.deleteMany({ _id: { $in: adminStoreIds } }),
      ]);
      result.migratedDocuments += products.deletedCount + orders.deletedCount + settings.deletedCount;
      result.removedStores += deletedStores.deletedCount || 0;
    }

    await User.updateOne({ userId: 'admin' }, { $set: { role: 'admin', storeIds: [], activeStoreId: '' } });

    for (const user of users) {
      const stores = await Store.find({ ownerUserId: user.userId }).sort({ createdAt: 1 });
      let keepStore = stores[0];

      if (!keepStore) {
        keepStore = await Store.create({
          name: `${user.userId} store`,
          ownerUserId: user.userId,
          memberUserIds: [user.userId],
        });
        result.createdStores += 1;
      }

      const keepStoreId = String(keepStore._id);
      const duplicateStores = stores.slice(1);

      for (const duplicateStore of duplicateStores) {
        const duplicateStoreId = String(duplicateStore._id);
        const [products, orders, settings] = await Promise.all([
          Product.updateMany({ storeId: duplicateStoreId }, { $set: { storeId: keepStoreId, ownerId: user.userId } }),
          Order.updateMany({ storeId: duplicateStoreId }, { $set: { storeId: keepStoreId, ownerId: user.userId } }),
          Setting.updateMany({ storeId: duplicateStoreId }, { $set: { storeId: keepStoreId, ownerId: user.userId } }),
        ]);

        result.migratedDocuments += products.modifiedCount + orders.modifiedCount + settings.modifiedCount;
      }

      if (duplicateStores.length > 0) {
        const duplicateStoreIds = duplicateStores.map((store) => store._id);
        const deleteResult = await Store.deleteMany({ _id: { $in: duplicateStoreIds } });
        result.removedStores += deleteResult.deletedCount || 0;
      }

      const nextMemberUserIds = Array.from(new Set([...(keepStore.memberUserIds || []), user.userId]));
      keepStore.memberUserIds = nextMemberUserIds;
      await keepStore.save();

      if (duplicateStores.length > 0 || user.activeStoreId !== keepStoreId || user.storeIds?.length !== 1 || user.storeIds?.[0] !== keepStoreId) {
        user.storeIds = [keepStoreId];
        user.activeStoreId = keepStoreId;
        await user.save();
        result.fixedUsers += 1;
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Admin stores cleanup error:', error);
    return NextResponse.json(
      { message: '店舗データの整理に失敗しました', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}
