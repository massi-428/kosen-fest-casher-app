import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';
import { hashPassword, isPasswordHash, setAuthCookie, verifyPassword } from '@/lib/auth';
import { normalizeUserRole } from '@/lib/authorization';
import { ensureDefaultStore } from '@/lib/store';

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const { id, password } = await request.json();

    const user = await User.findOne({ userId: id });
    if (!user) {
      return NextResponse.json({ message: 'ID????????' }, { status: 401 });
    }

    const passwordMatches = await verifyPassword(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json({ message: '?????????????' }, { status: 401 });
    }

    let needsSave = false;
    if (!isPasswordHash(user.password)) {
      user.password = await hashPassword(password);
      needsSave = true;
    }

    const role = normalizeUserRole(user.userId, user.role);
    if (user.role !== role) {
      user.role = role;
      needsSave = true;
    }

    let activeStoreId = '';
    if (role === 'admin') {
      if ((user.storeIds?.length || 0) > 0 || user.activeStoreId) {
        user.storeIds = [];
        user.activeStoreId = '';
        needsSave = true;
      }
    } else {
      activeStoreId = await ensureDefaultStore(id);
      if (!user.storeIds?.includes(activeStoreId) || user.activeStoreId !== activeStoreId) {
        user.storeIds = [activeStoreId];
        user.activeStoreId = activeStoreId;
        needsSave = true;
      }
    }

    if (needsSave) await user.save();

    const response = NextResponse.json({ message: '??????', role }, { status: 200 });
    setAuthCookie(response, id, activeStoreId);
    return response;
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json(
      { message: 'ログイン処理に失敗しました。' },
      { status: 500 },
    );
  }
}
