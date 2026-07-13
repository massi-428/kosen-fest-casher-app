import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { unauthorizedResponse } from '@/lib/auth';
import { getActiveStoreContext } from '@/lib/store';
import { getCancelPassword } from '@/lib/systemSettings';
import { badRequest, isNonEmptyString, isOrderStatus, isValidObjectId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const activeOrders = await Order.find({ storeId: context.storeId, status: { $in: ['active', 'pending'] } }).select('ticketNumber');
    const activeTickets = activeOrders.map((order) => parseInt(order.ticketNumber)).filter((num) => !isNaN(num));
    const lastOrder = await Order.findOne({ storeId: context.storeId }).sort({ createdAt: -1 });
    const lastTicketNumber = lastOrder && !isNaN(parseInt(lastOrder.ticketNumber)) ? parseInt(lastOrder.ticketNumber) : 0;

    return NextResponse.json({ activeTickets, lastTicketNumber }, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Ticket fetch failed' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const context = await getActiveStoreContext(request);
    if (!context) return unauthorizedResponse();

    const { ticketNumber, status, orderId, cancelPassword } = await request.json();
    const newStatus = status || 'completed';
    if (!isOrderStatus(newStatus)) return badRequest('Invalid status');

    if (newStatus === 'cancelled') {
      const expectedPassword = await getCancelPassword();
      if (String(cancelPassword || '') !== expectedPassword) {
        return NextResponse.json({ message: 'Cancel password is incorrect' }, { status: 403 });
      }
    }

    if (orderId) {
      if (!isValidObjectId(orderId)) return badRequest('Invalid order id');
      await Order.findOneAndUpdate({ _id: orderId, storeId: context.storeId }, { status: newStatus }, { runValidators: true });
    } else {
      if (!isNonEmptyString(String(ticketNumber || ''), 20)) return badRequest('Invalid ticket number');
      await Order.updateMany({ storeId: context.storeId, ticketNumber: String(ticketNumber), status: { $ne: 'completed' } }, { $set: { status: newStatus } }, { runValidators: true });
    }

    return NextResponse.json({ message: 'Updated' }, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Ticket update failed' }, { status: 500 });
  }
}
