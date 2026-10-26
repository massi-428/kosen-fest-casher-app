import TicketCounter from '@/models/TicketCounter';
import type { ClientSession } from 'mongoose';

export const businessDate = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
export class BusinessClosedError extends Error {}

export async function withOpenBusiness<T>(storeId: string, action: (session: ClientSession, closedAt?: Date) => Promise<T>): Promise<T> {
  return TicketCounter.db.transaction(async session => {
    const counter = await TicketCounter.findOneAndUpdate({ storeId }, { $inc: { businessRevision: 1 } }, { upsert: true, new: true, session });
    if (counter.closedDate === businessDate()) throw new BusinessClosedError('本日の営業は締め切りました。翌日から注文を受け付けます。');
    return action(session, counter.closedAt);
  });
}
