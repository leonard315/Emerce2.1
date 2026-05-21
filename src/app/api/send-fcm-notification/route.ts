import { NextRequest, NextResponse } from 'next/server';

const PROJECT_ID = 'emerce-ac815';

// FCM V1 API — uses service account credentials
// Set GOOGLE_SERVICE_ACCOUNT_JSON in env vars (JSON string of service account key)
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';

const TYPE_LABELS: Record<string, string> = {
  fire:    '🔥 DRRM Emergency',
  crime:   '🚔 Security Emergency',
  medical: '🚑 Clinic Emergency',
  all:     '🚨 ALL OFFICES Emergency',
};

// Get OAuth2 access token from service account using JWT
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: any) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(
      serviceAccount.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\n/g, ''),
      'base64'
    ),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    Buffer.from(signingInput)
  );

  const jwt = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export async function POST(req: NextRequest) {
  if (!SERVICE_ACCOUNT_JSON || SERVICE_ACCOUNT_JSON === 'YOUR_SERVICE_ACCOUNT_JSON') {
    return NextResponse.json({ ok: false, reason: 'FCM service account not configured' }, { status: 200 });
  }

  try {
    const body = await req.json();
    const { alertType, reporterName, location, tokens = [] } = body;

    if (tokens.length === 0) {
      return NextResponse.json({ ok: false, reason: 'No tokens provided' }, { status: 200 });
    }

    const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
    const accessToken = await getAccessToken(serviceAccount);

    const title = TYPE_LABELS[alertType] || '🚨 Emergency Alert';
    const notifBody = `${reporterName} — ${location}`;

    // Send to each token using FCM V1 API
    const results = await Promise.allSettled(
      tokens.map((token: string) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body: notifBody },
              webpush: {
                notification: {
                  title,
                  body: notifBody,
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/icon-96x96.png',
                  requireInteraction: true,
                  vibrate: [200, 100, 200],
                },
                fcm_options: { link: '/dashboard' },
              },
              data: { alertType, reporterName, location, url: '/dashboard' },
            },
          }),
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ ok: true, sent, total: tokens.length });
  } catch (e: any) {
    console.error('[FCM V1 API] Error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
