import mongoose, { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
    // フィールド名をDBの実際のキー 'userId' に修正
    userId: { 
        type: String,
        required: [true, 'IDは必須です'],
        unique: true,
    },
    // パスワードはそのまま
    password: {
    type: String,
    required: [true, 'パスワードは必須です'],
    },
}, { timestamps: true });

// コレクション名 'accounts' は引き続き必要です
const User = models.User || model('User', UserSchema, 'accounts');

export default User;