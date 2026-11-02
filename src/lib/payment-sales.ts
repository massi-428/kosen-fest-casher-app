import { isSalesOrder } from './order-accounting';

type Sale = {
  status?: string;
  paymentMethod?: string;
  totalAmount: number;
  items: { productName: string; quantity: number; amount: number }[];
};

type ProductSales = { name: string; quantity: number; amount: number };

export function summarizeSalesByPayment(orders: Sale[]) {
  const methods = new Map<string, {
    name: string; count: number; quantity: number; amount: number;
    products: Map<string, ProductSales>;
  }>();
  for (const order of orders) {
    if (!isSalesOrder(order)) continue;
    const name = order.paymentMethod || '未設定';
    let method = methods.get(name);
    if (!method) {
      method = { name, count: 0, quantity: 0, amount: 0, products: new Map() };
      methods.set(name, method);
    }
    method.count += 1;
    method.amount += order.totalAmount;
    for (const item of order.items) {
      const product = method.products.get(item.productName) || { name: item.productName, quantity: 0, amount: 0 };
      product.quantity += item.quantity;
      product.amount += item.amount;
      method.quantity += item.quantity;
      method.products.set(item.productName, product);
    }
  }
  return [...methods.values()].map(method => ({
    ...method,
    products: [...method.products.values()].sort((a, b) => b.quantity - a.quantity || b.amount - a.amount || a.name.localeCompare(b.name, 'ja')),
  })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ja'));
}
