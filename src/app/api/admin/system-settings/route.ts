import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import { isAdminRequest } from '@/lib/authorization';
import { getSystemSettings } from '@/lib/systemSettings';
import { badRequest, isNonEmptyString } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const settings = await getSystemSettings();
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: 'System settings fetch failed', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const maxStores = Number(body.maxStores);
    if (!Number.isInteger(maxStores) || maxStores < 1 || maxStores > 9999) {
      return badRequest('Invalid store limit');
    }
    if (body.cancelPassword !== undefined && !isNonEmptyString(body.cancelPassword, 80)) {
      return badRequest('Invalid cancel password');
    }

    const settings = await getSystemSettings();
    settings.maxStores = maxStores;
    if (body.cancelPassword !== undefined) settings.cancelPassword = String(body.cancelPassword).trim();
    await settings.save();

    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: 'System settings save failed', error: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}
