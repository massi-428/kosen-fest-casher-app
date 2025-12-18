import mongoose, { Schema, model, models } from 'mongoose';

const OrderSchema = new Schema({
  ticketNumber: { type: String, required: true },
  items: [{
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    amount: { type: Number, required: true }, // オプション込みの小計
    detail: { type: String, required: false, default: '' }, // 自由記述メモ
    // ★追加: 選択された有料/無料オプション
    selectedOptions: [{
      name: String,
      price: Number
    }]
  }],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['active', 'completed', 'pending'],
    default: 'active',
  },
  paymentMethod: { type: String, required: false },
  note: { type: String, required: false, default: '' },
  orderDate: { type: Date, default: Date.now }
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.Order;
}

const Order = models.Order || model('Order', OrderSchema, 'orders');

export default Order;