import { Schema, model, models } from 'mongoose';

const OrderSchema = new Schema({
  ownerId: { type: String, required: true, index: true },
  storeId: { type: String, required: false, index: true },
  requestId: { type: String, required: true },
  ticketNumber: { type: String, required: true },
  items: [{
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    amount: { type: Number, required: true },
    detail: { type: String, required: false, default: '' },
    selectedOptions: [{ name: String, price: Number }]
  }],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'pending', 'cancelled'], default: 'active' },
  paymentMethod: { type: String, required: false },
  note: { type: String, required: false, default: '' },
  orderDate: { type: Date, default: Date.now }
}, { timestamps: true });

OrderSchema.index(
  { storeId: 1, ticketNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['active', 'pending'] } },
  },
);
OrderSchema.index(
  { storeId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } },
);

if (process.env.NODE_ENV !== 'production') delete models.Order;
const Order = models.Order || model('Order', OrderSchema, 'orders');
export default Order;
