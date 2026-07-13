import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString, isOptionalString, isOrderStatus, toValidPrice, toValidSignedPrice } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type IncomingOrderOption = {
  name?: unknown;
  price?: unknown;
};

type IncomingOrderItem = {
  productName?: unknown;
  quantity?: unknown;
  amount?: unknown;
  detail?: unknown;
  selectedOptions?: unknown;
};

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const orders = await Order.find({ storeId: context.storeId }).sort({ createdAt: -1 });
    return NextResponse.json(orders, { status: 200 });
  } catch {
    return NextResponse.json({ message: '注文情報の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const body = await request.json();
    const status = body.status === undefined ? 'active' : body.status;
    const totalAmount = toValidPrice(body.totalAmount);
    if (!isNonEmptyString(body.ticketNumber, 20) || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) return badRequest('注文内容が不正です');
    if (totalAmount === null || !isOrderStatus(status) || !isOptionalString(body.paymentMethod, 80) || !isOptionalString(body.note, 500)) return badRequest('注文内容が不正です');

    const items = (body.items as IncomingOrderItem[]).map((item) => {
      const quantity = Number(item.quantity);
      const amount = toValidPrice(item.amount);
      if (!isNonEmptyString(item.productName, 120) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999 || amount === null || !isOptionalString(item.detail, 300)) {
        return null;
      }

      const selectedOptions = Array.isArray(item.selectedOptions) ? (item.selectedOptions as IncomingOrderOption[]).map((option) => {
        const price = toValidSignedPrice(option?.price ?? 0);
        if (!isNonEmptyString(option?.name, 80) || price === null) return null;
        return { name: String(option.name).trim(), price };
      }) : [];

      if (selectedOptions.some((option) => option === null)) return null;

      return {
        productName: String(item.productName).trim(),
        quantity,
        amount,
        detail: typeof item.detail === 'string' ? item.detail : '',
        selectedOptions,
      };
    });

    if (items.some((item) => item === null)) return badRequest('注文詳細が不正です');

    const newOrder = await Order.create({
      ownerId: context.userId,
      storeId: context.storeId,
      ticketNumber: body.ticketNumber.trim(),
      items,
      totalAmount,
      status,
      paymentMethod: body.paymentMethod,
      note: body.note || '',
    });

    return NextResponse.json({ message: '注文完了', order: newOrder }, { status: 201 });
  } catch {
    return NextResponse.json({ message: '注文の作成に失敗しました' }, { status: 500 });
  }
}
