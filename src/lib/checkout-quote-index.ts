import CheckoutQuote from '@/models/CheckoutQuote';

// Model.init() retains a rejected promise after an initial connection/index
// failure. Share successful index setup per client, but allow failures to retry.
const readiness = new WeakMap<object, Promise<unknown>>();

export async function ensureCheckoutQuoteIndex() {
  const client = CheckoutQuote.db.getClient();
  let pending = readiness.get(client);
  if (!pending) {
    pending = Promise.resolve().then(() => CheckoutQuote.collection.createIndex(
      { storeId: 1, requestId: 1 }, { unique: true },
    )).catch(error => {
      readiness.delete(client);
      throw error;
    });
    readiness.set(client, pending);
  }
  await pending;
}
