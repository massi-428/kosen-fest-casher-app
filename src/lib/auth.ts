import crypto from 'crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const AUTH_COOKIE_NAME = 'rootine_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  exp: number;
};

const getSecret = () => {
  const secret = process.env.AUTH_SECRET || process.env.MONGODB_URI;
  if (!secret) {
    throw new Error('AUTH_SECRET or MONGODB_URI is required for session signing');
  }
  return secret;
};

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

const sign = (payload: string) => {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
};

const parseCookies = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (!rawName) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join('=')));
  }

  return cookies;
};

export const isPasswordHash = (password: string) => password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export const verifyPassword = async (inputPassword: string, storedPassword: string) => {
  if (isPasswordHash(storedPassword)) {
    return bcrypt.compare(inputPassword, storedPassword);
  }

  return inputPassword === storedPassword;
};

export const createSessionToken = (userId: string) => {
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const verifySessionToken = (token: string | undefined) => {
  if (!token) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.userId || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getSessionUserId = (request: Request) => {
  const cookies = parseCookies(request.headers.get('cookie'));
  const session = verifySessionToken(cookies.get(AUTH_COOKIE_NAME));
  return session?.userId || null;
};

export const unauthorizedResponse = () => NextResponse.json({ message: '認証エラー' }, { status: 401 });

export const setAuthCookie = (response: NextResponse, userId: string) => {
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
};

export const clearAuthCookie = (response: NextResponse) => {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
};
