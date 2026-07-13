import { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'store'],
    default: 'store',
    index: true,
  },
  storeIds: {
    type: [String],
    default: [],
  },
  activeStoreId: {
    type: String,
    required: false,
  },
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') {
  delete models.User;
}

const User = models.User || model('User', UserSchema, 'accounts');

export default User;