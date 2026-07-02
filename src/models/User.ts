import mongoose, { Schema, model, models } from 'mongoose';

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
}, { timestamps: true });

// 開発環境でのホットリロード対策
if (process.env.NODE_ENV !== 'production') {
  delete models.User;
}

// ★修正: コレクション名を元の 'accounts' に戻しました
const User = models.User || model('User', UserSchema, 'accounts');

export default User;