import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import User from '@/models/User';
import { hashPassword } from '@/lib/auth';
import { canCreateStore, ensureDefaultStore } from '@/lib/store';

export async function POST(request: Request) {
  try {
    await connectToDatabase();

    const { id, password } = await request.json();
    if (!id || !password) {
      return NextResponse.json({ message: 'IDとパスワードは必須です' }, { status: 400 });
    }

    const existingUser = await User.findOne({ userId: id });
    if (existingUser) {
      return NextResponse.json({ message: 'このIDは既に使用されています' }, { status: 409 });
    }

    const storeLimit = await canCreateStore();
    if (!storeLimit.allowed) {
      return NextResponse.json({ message: `店舗数の上限(${storeLimit.maxStores})に達しています` }, { status: 403 });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = await User.create({ userId: id, password: hashedPassword, role: 'store' });
    const storeId = await ensureDefaultStore(id);
    newUser.storeIds = [storeId];
    newUser.activeStoreId = storeId;
    await newUser.save();

    return NextResponse.json({ message: 'アカウントを作成しました' }, { status: 201 });
  } catch (error) {
    console.error('Signup Error Detailed:', error);
    return NextResponse.json(
      { message: 'サーバーエラーが発生しました', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}