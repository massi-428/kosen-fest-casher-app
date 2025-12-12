import mongoose, { Schema, model, models } from 'mongoose';

const OrderSchema = new Schema({
  ticketNumber: { type: String, required: true },
  items: [{
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    amount: { type: Number, required: true },
    // ★追加: 商品ごとの詳細設定（トッピングやカスタマイズ内容）
    detail: { type: String, required: false, default: '' }
  }],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['active', 'completed', 'pending'],
    default: 'active',
  },
  paymentMethod: {
    type: String,
    required: false,
  },
  note: { // 注文全体の備考も残しておきます
    type: String,
    required: false,
    default: '',
  },
  orderDate: { type: Date, default: Date.now }
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.Order;
}

const Order = models.Order || model('Order', OrderSchema, 'orders');

export default Order;