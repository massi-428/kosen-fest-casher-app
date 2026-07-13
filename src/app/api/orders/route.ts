import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import Setting from '@/models/Setting';
import TicketCounter from '@/models/TicketCounter';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { badRequest, isNonEmptyString, isOptionalString, isOrderStatus, toValidPrice, toValidSignedPrice } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const DEFAULT_MAX_TICKET_NUMBER = 30;
const DUPLICATE_KEY_ERROR_CODE = 11000;

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

const getTicketConfig = async (storeId: string) => {
  const setting = await Setting.findOne({ storeId, key: 'app_config' });
  const maxTicketNumber = Number(setting?.maxTicketNumber || DEFAULT_MAX_TICKET_NUMBER);
  const safeMaxTicketNumber = Number.isInteger(maxTicketNumber) && maxTicketNumber > 0 ? maxTicketNumber : DEFAULT_MAX_TICKET_NUMBER;
  const lostTickets = Array.isArray(setting?.lostTickets)
    ? setting.lostTickets.map((num: unknown) => Number(num)).filter((num: number) => Number.isInteger(num))
    : [];

  return { maxTicketNumber: safeMaxTicketNumber, lostTickets };
};

const issueTicketCandidate = async (storeId: string, maxTicketNumber: number) => {
  const counter = await TicketCounter.findOneAndUpdate(
    { storeId },
    [
      {
        $set: {
          storeId,
          lastIssuedNumber: {
            $let: {
              vars: { nextNumber: { $add: [{ $ifNull: ['$lastIssuedNumber', 0] }, 1] } },
              in: { $cond: [{ $gt: ['$$nextNumber', maxTicketNumber] }, 1, '$$nextNumber'] },
            },
          },
        },
      },
    ],
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return String(counter.lastIssuedNumber);
};

const isDuplicateTicketError = (error: unknown) => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY_ERROR_CODE;
};

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const orders = await Order.find({ storeId: context.storeId }).sort({ createdAt: -1 });
    return NextResponse.json(orders, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Order fetch failed' }, { status: 500 });
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
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) return badRequest('Invalid order items');
    if (totalAmount === null || !isOrderStatus(status) || !isOptionalString(body.paymentMethod, 80) || !isOptionalString(body.note, 500)) return badRequest('Invalid order payload');

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

    if (items.some((item) => item === null)) return badRequest('Invalid order details');

    const ticketConfig = await getTicketConfig(context.storeId);
    const lostTickets = new Set(ticketConfig.lostTickets);
    let newOrder = null;
    let ticketNumber = '';

    for (let i = 0; i < ticketConfig.maxTicketNumber; i += 1) {
      const candidate = await issueTicketCandidate(context.storeId, ticketConfig.maxTicketNumber);
      if (lostTickets.has(Number(candidate))) continue;

      const activeTicket = await Order.exists({ storeId: context.storeId, ticketNumber: candidate, status: { $in: ['active', 'pending'] } });
      if (activeTicket) continue;

      try {
        newOrder = await Order.create({
          ownerId: context.userId,
          storeId: context.storeId,
          ticketNumber: candidate,
          items,
          totalAmount,
          status,
          paymentMethod: body.paymentMethod,
          note: body.note || '',
        });
        ticketNumber = candidate;
        break;
      } catch (error) {
        if (isDuplicateTicketError(error)) continue;
        throw error;
      }
    }

    if (!newOrder || !ticketNumber) {
      return NextResponse.json({ message: 'No ticket numbers are available' }, { status: 409 });
    }

    return NextResponse.json({ message: 'Order created', order: newOrder, ticketNumber }, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Order creation failed' }, { status: 500 });
  }
}
