import { Schema, model, models } from 'mongoose';

const TicketCounterSchema = new Schema({
  storeId: { type: String, required: true, unique: true, index: true },
  lastIssuedNumber: { type: Number, required: true, default: 0 },
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') delete models.TicketCounter;
const TicketCounter = models.TicketCounter || model('TicketCounter', TicketCounterSchema, 'ticket_counters');
export default TicketCounter;
