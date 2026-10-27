import { NextResponse } from 'next/server';

// Retired: never permit bulk order deletion, even in local development.
export async function DELETE() {
  return NextResponse.json({ message: 'Not Found' }, { status: 404 });
}
