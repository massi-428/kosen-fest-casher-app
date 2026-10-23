import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';

export async function DELETE(request: Request) {
  // Deny before any database or authorization work, including Vercel previews.
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL || process.env.VERCEL_ENV) {
    return NextResponse.json({ message: 'Not Found' }, { status: 404 });
  }

  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    await Order.deleteMany({ storeId: context.storeId });
    return NextResponse.json({ message: '削除完了' }, { status: 200 });
  } catch {
    return NextResponse.json({ message: '削除に失敗しました' }, { status: 500 });
  }
}
