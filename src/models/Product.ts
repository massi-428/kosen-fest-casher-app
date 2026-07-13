import { Schema, model, models } from 'mongoose';

const ProductSchema = new Schema({
  ownerId: { type: String, required: true, index: true },
  storeId: { type: String, required: false, index: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') delete models.Product;
const Product = models.Product || model('Product', ProductSchema, 'products');
export default Product;
