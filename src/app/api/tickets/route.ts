import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Order from '@/models/Order';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();

    const activeOrders = await Order.find({ 
      status: { $in: ['active', 'pending'] } 
    }).select('ticketNumber');
    
    const activeTickets = activeOrders
      .map(o => parseInt(o.ticketNumber))
      .filter(num => !isNaN(num));

    const lastOrder = await Order.findOne().sort({ createdAt: -1 });
    let lastTicketNumber = 0;
    if (lastOrder && !isNaN(parseInt(lastOrder.ticketNumber))) {
      lastTicketNumber = parseInt(lastOrder.ticketNumber);
    }

    return NextResponse.json({ 
      activeTickets, 
      lastTicketNumber 
    }, { status: 200 });

  } catch (error) {
    console.error("Ticket API Error:", error);
    return NextResponse.json({ message: 'エラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    // ★ orderId を受け取るように追加
    const { ticketNumber, status, orderId } = await request.json();

    const newStatus = status || 'completed';

    // ★重要: orderIdがある場合は、そのIDを持つ注文「1つだけ」を更新する
    if (orderId) {
      await Order.findByIdAndUpdate(orderId, { status: newStatus });
    } else {
      // orderIdがない場合（POSからの返却など）は、
      // 過去の完了済み(completed)データまで巻き込まないように、完了済み以外を対象にする
      await Order.updateMany(
        { 
          ticketNumber: String(ticketNumber),
          status: { $ne: 'completed' } // 完了済みのものは変更しない
        },
        { $set: { status: newStatus } }
      );
    }

    return NextResponse.json({ message: '更新しました' }, { status: 200 });

  } catch (error) {
    console.error("Update Error:", error);
    return NextResponse.json({ message: '更新エラー' }, { status: 500 });
  }
}