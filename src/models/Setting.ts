import mongoose, { Schema, model, models } from 'mongoose';

const SettingSchema = new Schema({
  key: {
    type: String,
    default: 'app_config',
    unique: true,
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
  // ★変更: 名前と価格を持つオブジェクトの配列にする
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
  }
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.Setting;
}

const Setting = models.Setting || model('Setting', SettingSchema, 'settings');

export default Setting;