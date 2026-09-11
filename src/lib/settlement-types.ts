import type { PricedItem } from './order-accounting';
export type SettlementOperation = {
  operationId: string;
  kind: 'edit' | 'cancel';
  phase: 'prepared' | 'handling' | 'completed' | 'aborted';
  beforeAmount: number;
  afterAmount: number;
  delta: number;
  items: PricedItem[];
  note: string;
  paymentMethod: string;
  cashCalculation: boolean;
  createdAt: string;
  handledAt?: string;
  completedAt?: string;
};
