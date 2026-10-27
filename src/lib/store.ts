import Store from '@/models/Store';
import Product from '@/models/Product';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import { getSession } from '@/lib/auth';
import { getStoreLimit } from '@/lib/systemSettings';

const DEFAULT_STORE_SUFFIX = ' store';
// This only skips repeated legacy migration work, never authentication checks.
// Cache per instance for five minutes; retries and cold starts remain safe.
const migrations = new Map<string, { promise?: Promise<void>; expires: number }>();

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
  const key = JSON.stringify([userId, storeId]);
  const existing = migrations.get(key);
  if (existing?.promise) return existing.promise;
  if (existing && existing.expires > Date.now()) return;
  const entry: { promise?: Promise<void>; expires: number } = { expires: 0 };
  entry.promise = Promise.resolve().then(async () => {
    // MongoDB's null match includes missing fields. Run sequentially so a single
    // request does not occupy the entire connection pool during migration.
    for (const model of [Product, Order, Setting]) {
      await model.updateMany({ ownerId: userId, storeId: null }, { $set: { storeId } });
    }
    entry.expires = Date.now() + 5 * 60 * 1000;
  }).catch(error => {
    migrations.delete(key);
    throw error;
  }).finally(() => {
    entry.promise = undefined;
    for (const [cachedKey, value] of migrations) {
      if (!value.promise && (value.expires <= Date.now() || migrations.size > 128)) migrations.delete(cachedKey);
    }
  });
  migrations.set(key, entry);
  return entry.promise;
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
