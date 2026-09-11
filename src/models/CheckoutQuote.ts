import { Schema, model, models } from 'mongoose';
const CheckoutQuoteSchema = new Schema({
  storeId: { type: String, required: true },
  userId: { type: String, required: true },
  requestId: { type: String, required: true },
  items: [Schema.Types.Mixed],
  totalAmount: Number,
  note: String,
  paymentMethods: [String],
  cashCalculationEnabled: Boolean,
  cashPaymentMethod: String,
  submission: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });
CheckoutQuoteSchema.index({ storeId: 1, requestId: 1 }, { unique: true });
if (process.env.NODE_ENV !== 'production') delete models.CheckoutQuote;
export default models.CheckoutQuote || model('CheckoutQuote', CheckoutQuoteSchema, 'checkout_quotes');
