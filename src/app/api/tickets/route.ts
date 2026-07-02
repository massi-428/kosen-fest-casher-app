import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();

    const activeOrders = await Order.find({ ownerId: userId, status: { $in: ['active', 'pending'] } }).select('ticketNumber');
    const activeTickets = activeOrders.map(o => parseInt(o.ticketNumber)).filter(num => !isNaN(num));
    const lastOrder = await Order.findOne({ ownerId: userId }).sort({ createdAt: -1 });
    let lastTicketNumber = 0;
    if (lastOrder && !isNaN(parseInt(lastOrder.ticketNumber))) lastTicketNumber = parseInt(lastOrder.ticketNumber);

    return NextResponse.json({ activeTickets, lastTicketNumber }, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const userId = getSessionUserId(request);
    if (!userId) return unauthorizedResponse();
    const { ticketNumber, status, orderId } = await request.json();
    const newStatus = status || 'completed';

    if (orderId) {
      await Order.findOneAndUpdate({ _id: orderId, ownerId: userId }, { status: newStatus });
    } else {
      await Order.updateMany({ ownerId: userId, ticketNumber: String(ticketNumber), status: { $ne: 'completed' } }, { $set: { status: newStatus } });
    }
    return NextResponse.json({ message: '更新しました' }, { status: 200 });
  } catch (error) { return NextResponse.json({ message: 'エラー' }, { status: 500 }); }
}
