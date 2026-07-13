import { Schema, model, models } from 'mongoose';

const SystemSettingSchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  maxStores: {
    type: Number,
    default: 10,
  },
  cancelPassword: {
    type: String,
    default: '0000',
  },
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.SystemSetting;
}

const SystemSetting = models.SystemSetting || model('SystemSetting', SystemSettingSchema, 'system_settings');

export default SystemSetting;
