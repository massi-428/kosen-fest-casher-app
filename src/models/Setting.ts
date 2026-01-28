import mongoose, { Schema, model, models } from 'mongoose';

const SettingSchema = new Schema({
  // ★修正: 共通設定にするため ownerId は必須でなくす
  ownerId: { type: String, required: false, index: true },
  key: {
    type: String,
    default: 'app_config',
  },
  maxTicketNumber: {
    type: Number,
    default: 30,
    required: true,
  },
  paymentMethods: {
    type: [String],
    default: ['現金', 'クレジットカード', 'PayPay', '交通系IC'],
  },
  customizations: {
    type: [{
      name: String,
      price: Number
    }],
    default: [
      { name: '氷少なめ', price: 0 },
      { name: 'ネギ抜き', price: 0 },
      { name: '大盛り', price: 100 },
      { name: 'テイクアウト', price: 0 }
    ],
  },
  lostTickets: {
    type: [Number],
    default: []
  }
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.Setting;
}

// コレクション名を 'global_settings' に変更して心機一転させます
const Setting = models.Setting || model('Setting', SettingSchema, 'global_settings');

export default Setting;