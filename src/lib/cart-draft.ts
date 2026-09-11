export type CartItem = { productId: string; productName: string; price: number; quantity: number; detail?: string; selectedOptions?: { name: string; price: number }[] };
export type OrderQuote = { requestId: string; items: { productId: string; productName: string; quantity: number; amount: number; detail: string; selectedOptions: { name: string; price: number }[] }[]; totalAmount: number; note: string; paymentMethods: string[]; cashCalculationEnabled: boolean; cashPaymentMethod: string };
export type CartDraft = { version: 1; userId: string; storeId: string; requestId: string; items: CartItem[]; note: string; phase: 'editing' | 'ready' | 'unknown'; quote: OrderQuote | null; submission: { paymentMethod: string; receivedAmount?: number } | null };
export const cartKey = (userId: string, storeId: string) => 'casher-cart-v1:' + encodeURIComponent(userId) + ':' + encodeURIComponent(storeId);
export function parseCartDraft(raw: string | null, userId: string, storeId: string): CartDraft | null {
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (!draft || draft.version !== 1 || draft.userId !== userId || draft.storeId !== storeId || typeof draft.requestId !== 'string' || !draft.requestId || typeof draft.note !== 'string' || draft.note.length > 500 || !Array.isArray(draft.items) || draft.items.length > 100 || !['editing', 'ready', 'unknown'].includes(draft.phase)) throw new Error('保存済みカートを読み込めません。保存データの形式が正しくありません。');
  for (const item of draft.items) {
    if (!item || typeof item.productId !== 'string' || typeof item.productName !== 'string' || !Number.isSafeInteger(item.price) || item.price < 0 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000 || (item.detail !== undefined && typeof item.detail !== 'string') || !Array.isArray(item.selectedOptions || []) || (item.selectedOptions || []).some((o: { name: unknown; price: unknown }) => !o || typeof o.name !== 'string' || !Number.isSafeInteger(o.price))) throw new Error('保存済みの商品情報が壊れています。カートを確認してください。');
  }
  if (draft.phase !== 'editing' && (!draft.quote || draft.quote.requestId !== draft.requestId || !Number.isSafeInteger(draft.quote.totalAmount) || !Array.isArray(draft.quote.items) || !Array.isArray(draft.quote.paymentMethods))) throw new Error('保存済みの会計情報が壊れています。履歴で登録結果を確認してください。');
  if (draft.phase === 'unknown' && (!draft.submission || typeof draft.submission.paymentMethod !== 'string')) throw new Error('登録結果の確認情報が壊れています。履歴を確認してください。');
  return draft;
}
export function readDraft(userId: string, storeId: string) { return parseCartDraft(window.localStorage.getItem(cartKey(userId, storeId)), userId, storeId); }
export function writeDraft(draft: CartDraft) { window.localStorage.setItem(cartKey(draft.userId, draft.storeId), JSON.stringify(draft)); }
export function removeDraft(userId: string, storeId: string) { window.localStorage.removeItem(cartKey(userId, storeId)); }
export function cartChanges(items: CartItem[], products: { _id: string; name: string; price: number; isAvailable?: boolean }[], options: { name: string; price: number }[]) {
  return items.flatMap(item => {
    const product = products.find(p => p._id === item.productId);
    const changes: string[] = [];
    if (!product) changes.push(item.productName + '：商品が削除されています');
    else { if (product.isAvailable === false) changes.push(item.productName + '：売り切れ'); if (product.price !== item.price) changes.push(item.productName + '：価格 ' + item.price + '円 → ' + product.price + '円'); }
    for (const option of item.selectedOptions || []) { const current = options.find(o => o.name === option.name); if (!current) changes.push(option.name + '：オプションが削除されています'); else if (option.price !== current.price) changes.push(option.name + '：価格 ' + option.price + '円 → ' + current.price + '円'); }
    return changes;
  });
}
