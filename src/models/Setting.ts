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
  // ★追加: よく使う別注オプション
  customizations: {
    type: [String],
    default: ['氷少なめ', 'ネギ抜き', 'テイクアウト', '大盛り', 'ドレッシング別'],
  }
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.Setting;
}

const Setting = models.Setting || model('Setting', SettingSchema, 'settings');

export default Setting;