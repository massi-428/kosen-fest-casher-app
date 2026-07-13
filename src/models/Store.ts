import { Schema, model, models } from 'mongoose';

const StoreSchema = new Schema({
  name: { type: String, required: true },
  ownerUserId: { type: String, required: true, index: true },
  memberUserIds: { type: [String], default: [], index: true },
}, { timestamps: true });

if (process.env.NODE_ENV !== 'production') delete models.Store;
const Store = models.Store || model('Store', StoreSchema, 'stores');
export default Store;
