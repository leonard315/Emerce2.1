import { NextRequest, NextResponse } from 'next/server';

const PROJECT_ID = 'emerce-ac815';
const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || '';

// Use Firebase Admin REST API to send FCM notifications
// This uses the Firebase project's server key
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';

const TYPE_LABELS: Record<string, string> = {
  fire:    '🔥 DRRM Emergency',
  crime:   '🚔 Security Emergency',
  medical: '🚑 Clinic Emergency',
  all:     '🚨 ALL OFFICES Emergency',
};

export async function POST(req: NextRequest) {
  if (!FCM_SERVER_KEY || FCM_SERVER_KEY === 'YOUR_SERVER_KEY_HERE') {
    // FCM not configured yet — silently skip
    return NextResponse.json({ ok: false, reason: 'FCM not configured' }, { status: 200 });
  }

  try {
    const body = await req.json();
    const { alertType, reporterName, location } = body;

    // Fetch all FCM tokens from Firestore using REST API
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/fcm_tokens`;
    const tokensRes = await fetch(firestoreUrl, {
      headers: { 'Authorization': `Bearer ${FCM_SERVER_KEY}` },
    });

    let tokens: string[] = [];
    if (tokensRes.ok) {
      const data = await tokensRes.json();
      tokens = (data.documents || [])
        .map((d: any) => d.fields?.token?.stringValue)
        .filter(Boolean);
    }

    if (tokens.length === 0) {
      return NextResponse.json({ ok: false, reason: 'No registered tokens' }, { status: 200 });
    }

    const title = TYPE_LABELS[alertType] || '🚨 Emergency Alert';
    const notifBody = `${reporterName} — ${location}`;

    // Send using FCM Legacy HTTP API (works with server key)
    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        registration_ids: tokens,
        notification: {
          title,
          body: notifBody,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          click_action: '/dashboard',
          require_interaction: true,
        },
        data: {
          alertType,
          reporterName,
          location,
          url: '/dashboard',
        },
        webpush: {
          notification: {
            requireInteraction: true,
            vibrate: [200, 100, 200],
          },
        },
      }),
    });

    const result = await fcmRes.json();
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    console.error('[FCM API] Error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
