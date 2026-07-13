import { NextResponse } from 'next/server';
import { Types } from 'mongoose';

export const ORDER_STATUSES = ['active', 'completed', 'pending', 'cancelled'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const isOrderStatus = (value: unknown): value is OrderStatus => {
  return typeof value === 'string' && ORDER_STATUSES.includes(value as OrderStatus);
};

export const isNonEmptyString = (value: unknown, maxLength = 120) => {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
};

export const isOptionalString = (value: unknown, maxLength = 500) => {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength);
};

export const isValidObjectId = (value: unknown) => {
  return typeof value === 'string' && Types.ObjectId.isValid(value);
};

export const toValidPrice = (value: unknown, max = 10_000_000) => {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > max) return null;
  return Math.round(price);
};

export const toValidSignedPrice = (value: unknown, maxAbs = 10_000_000) => {
  const price = Number(value);
  if (!Number.isFinite(price) || Math.abs(price) > maxAbs) return null;
  return Math.round(price);
};

export const badRequest = (message: string) => NextResponse.json({ message }, { status: 400 });
