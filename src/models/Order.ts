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
  settlementLock: { type: String, default: null },
  settlementOperations: [{ operationId: String, kind: String, phase: String, beforeAmount: Number, afterAmount: Number, delta: Number, items: [Schema.Types.Mixed], note: String, paymentMethod: String, cashCalculation: Boolean, createdAt: Date, handledAt: Date, completedAt: Date }],
  revision: { type: Number, default: 0 },
  editRequests: [{ requestId: String, fingerprint: String }],
  settlements: [{ requestId: String, kind: String, beforeAmount: Number, afterAmount: Number, delta: Number, paymentMethod: String, receivedAmount: Number, changeAmount: Number, createdAt: Date }],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'pending', 'cancelled'], default: 'active' },
  paymentMethod: { type: String, required: false },
  paymentCorrections: [{ beforeMethod: String, afterMethod: String, previousReceivedAmount: Number, previousChangeAmount: Number, changedBy: String, createdAt: Date }],
  receivedAmount: { type: Number, required: false, default: null },
  changeAmount: { type: Number, required: false, default: null },
  note: { type: String, required: false, default: '' },
  orderDate: { type: Date, default: Date.now },
  completedAt: { type: Date, required: false, default: null },
  cancelledAt: { type: Date, required: false, default: null }
}, { timestamps: true });

OrderSchema.index({ storeId: 1, status: 1, completedAt: -1 });
OrderSchema.index({ storeId: 1, createdAt: -1 });

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
