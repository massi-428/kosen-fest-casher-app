export const SALES_STATUSES = ['active', 'pending', 'completed'];
export const isSalesOrder = (order: { status?: string }) => SALES_STATUSES.includes(order.status || '');
export type Settlement = { requestId: string; kind: 'edit' | 'cancel'; beforeAmount: number; afterAmount: number; delta: number; paymentMethod: string; receivedAmount?: number | null; changeAmount?: number | null; createdAt: string };
export type PricedItem = { _id?: unknown; productId: string; productName: string; quantity: number; amount: number; detail?: string; selectedOptions?: { name: string; price: number }[] };

// Existing lines keep their accepted base and option prices, even after catalog changes.
export function priceEditedItems(incoming: { lineId?: unknown; productId?: unknown; quantity?: unknown; detail?: unknown; selectedOptionNames?: unknown }[], original: PricedItem[], products: { _id: unknown; name: string; price: number; isAvailable?: boolean }[], options: { name: string; price: number }[]) {
  const used = new Set<string>();
  return incoming.map(item => {
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10000) throw new Error('数量は1〜10000の整数で入力してください。');
    const old = item.lineId ? original.find(line => String(line._id) === item.lineId) : undefined;
    if (item.lineId && (!old || used.has(String(item.lineId)))) throw new Error('明細が変更されています。再取得してください。');
    if (old) used.add(String(item.lineId));
    const product = products.find(p => String(p._id) === item.productId);
    if (old ? old.productId !== item.productId : !product || product.isAvailable === false) throw new Error('追加する商品が利用できません。');
    if (typeof item.detail !== 'string' || item.detail.length > 300) throw new Error('商品メモが正しくありません。');
    if (!Array.isArray(item.selectedOptionNames) || new Set(item.selectedOptionNames).size !== item.selectedOptionNames.length) throw new Error('オプションが正しくありません。');
    const selectedOptions = item.selectedOptionNames.map(name => {
      const option = old?.selectedOptions?.find(o => o.name === name) || options.find(o => o.name === name);
      if (!option) throw new Error('オプションが変更されています。再確認してください。');
      return { name: option.name, price: option.price };
    });
    const base = old ? old.amount / old.quantity - (old.selectedOptions || []).reduce((s, o) => s + o.price, 0) : product!.price;
    const amount = (base + selectedOptions.reduce((s, o) => s + o.price, 0)) * Number(item.quantity);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10000000) throw new Error('商品金額が範囲外です。');
    return { ...(old ? { _id: old._id } : {}), productId: String(item.productId), productName: old?.productName || product!.name, quantity: Number(item.quantity), amount, detail: item.detail, selectedOptions };
  });
}

export function settlementAmounts(before: number, after: number, confirmed: unknown, cash: boolean, received: unknown) {
  const delta = after - before;
  if (!Number.isSafeInteger(after) || after < 0 || after > 10000000) throw new Error('合計金額が範囲外です。');
  if (delta !== 0 && confirmed !== true) throw new Error('追加徴収・返金が済んだことを確認してください。');
  if (delta > 0 && cash) {
    if (typeof received !== 'number' || !Number.isSafeInteger(received) || received < delta || received > 10000000) throw new Error('今回の預かり金は追加徴収額以上の整数で入力してください。');
    return { delta, receivedAmount: received, changeAmount: received - delta };
  }
  return { delta, receivedAmount: null, changeAmount: null };
}

const transitions: Record<string, string[]> = { active: ['pending', 'completed', 'cancelled'], pending: ['active', 'completed', 'cancelled'], completed: ['active', 'cancelled'], cancelled: [] };
export const canTransition = (from: string, to: string) => transitions[from]?.includes(to) ?? false;
// Missing revisions on legacy orders are treated as revision zero.
export const revisionFilter = (revision: number) => revision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision };
