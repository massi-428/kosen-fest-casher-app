import { Schema, model, models } from 'mongoose';

const SettingSchema = new Schema({
  ownerId: { type: String, required: true, index: true },
  storeId: { type: String, required: false, index: true },
  key: {
    type: String,
    default: 'app_config',
  },
  maxTicketNumber: {
    type: Number,
    default: 30,
    required: true,
  },
  maxPendingItemCount: { type: Number, default: 30, required: true },
  maxItemsPerOrder: { type: Number, default: 10, required: true },
  pendingItemCount: { type: Number, default: 0, required: true },
  defaultThroughputPerMinute: { type: Number, default: 1.5, required: true },
  waitTimeRecentWindowMinutes: { type: Number, default: 30, required: true },
  waitTimeMinimumCompletedItemCount: { type: Number, default: 10, required: true },
  waitTimeWarningMinutes: { type: Number, default: 15, required: true },
  waitTimeCriticalMinutes: { type: Number, default: 30, required: true },
  paymentMethods: {
    type: [String],
    default: ['現金', 'クレジットカード', 'PayPay', '交通系IC'],
  },
  customizations: {
    type: [{
      name: String,
      price: Number,
    }],
    default: [
      { name: '氷少なめ', price: 0 },
      { name: 'ネギ抜き', price: 0 },
      { name: '大盛り', price: 100 },
      { name: 'テイクアウト', price: 0 },
    ],
  },
  lostTickets: {
    type: [Number],
    default: [],
  },
  cancelPassword: {
    type: String,
    default: '0000',
  },
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.Setting;
}

const Setting = models.Setting || model('Setting', SettingSchema, 'settings');

export default Setting;
