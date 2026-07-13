import User from '@/models/User';
import { getSession } from '@/lib/auth';

type Role = 'admin' | 'store';

export const normalizeUserRole = (userId: string, role?: string): Role => {
  if (userId === 'admin') return 'admin';
  if (role === 'admin' || role === 'store') return role;
  return 'store';
};

export const getSessionUser = async (request: Request) => {
  const session = getSession(request);
  if (!session?.userId) return null;

  const user = await User.findOne({ userId: session.userId });
  if (!user) return null;

  const role = normalizeUserRole(user.userId, user.role);
  if (user.role !== role) {
    user.role = role;
    await user.save();
  }

  return {
    userId: user.userId as string,
    role,
    activeStoreId: role === 'admin' ? '' : session.activeStoreId || user.activeStoreId || '',
  };
};

export const isAdminRequest = async (request: Request) => {
  const user = await getSessionUser(request);
  return user?.role === 'admin';
};
