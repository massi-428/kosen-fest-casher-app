import mongoose, { Schema, model, models } from 'mongoose';

const ProductSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

// 開発環境でのホットリロード対策
if (process.env.NODE_ENV !== 'production') {
  delete models.Product;
}

const Product = models.Product || model('Product', ProductSchema, 'products');

export default Product;