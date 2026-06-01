import { NextRequest, NextResponse } from 'next/server';

// This endpoint is a placeholder — actual FCM push is handled
// client-side via the firebase-messaging-sw.js service worker.
// Background notifications work automatically once the FCM token
// is registered and the service worker is active.

export async function POST(req: NextRequest) {
  // FCM V1 requires service account — use client-side push instead
  return NextResponse.json({ ok: true, method: 'client-side-fcm' });
}
