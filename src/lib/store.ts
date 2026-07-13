import Store from '@/models/Store';
import Product from '@/models/Product';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import { getSession } from '@/lib/auth';
import { getStoreLimit } from '@/lib/systemSettings';

const DEFAULT_STORE_SUFFIX = ' store';

export const canCreateStore = async () => {
  const [storeCount, maxStores] = await Promise.all([
    Store.countDocuments(),
    getStoreLimit(),
  ]);

  return { allowed: storeCount < maxStores, storeCount, maxStores };
};

export const ensureDefaultStore = async (userId: string) => {
  let store = await Store.findOne({ ownerUserId: userId }).sort({ createdAt: 1 });

  if (!store) {
    store = await Store.create({
      name: `${userId}${DEFAULT_STORE_SUFFIX}`,
      ownerUserId: userId,
      memberUserIds: [userId],
    });
  } else if (!store.memberUserIds?.includes(userId)) {
    store.memberUserIds = [...(store.memberUserIds || []), userId];
    await store.save();
  }

  return String(store._id);
};

export const userCanAccessStore = async (userId: string, storeId: string) => {
  const store = await Store.findOne({
    _id: storeId,
    ownerUserId: userId,
  });

  return Boolean(store);
};

export const migrateLegacyOwnerDataToStore = async (userId: string, storeId: string) => {
  await Promise.all([
    Product.updateMany({ ownerId: userId, storeId: { $exists: false } }, { $set: { storeId } }),
    Product.updateMany({ ownerId: userId, storeId: null }, { $set: { storeId } }),
    Order.updateMany({ ownerId: userId, storeId: { $exists: false } }, { $set: { storeId } }),
    Order.updateMany({ ownerId: userId, storeId: null }, { $set: { storeId } }),
    Setting.updateMany({ ownerId: userId, storeId: { $exists: false } }, { $set: { storeId } }),
    Setting.updateMany({ ownerId: userId, storeId: null }, { $set: { storeId } }),
  ]);
};

export const getActiveStoreContext = async (request: Request) => {
  const session = getSession(request);
  if (!session?.userId) return null;

  let storeId = session.activeStoreId;
  if (!storeId || !(await userCanAccessStore(session.userId, storeId))) {
    storeId = await ensureDefaultStore(session.userId);
  }

  await migrateLegacyOwnerDataToStore(session.userId, storeId);
  return { userId: session.userId, storeId };
};
