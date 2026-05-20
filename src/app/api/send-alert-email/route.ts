import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// ── Gmail SMTP via App Password ───────────────────────────────────────────────
// Values come from .env.local — never exposed to the browser
const GMAIL_USER = process.env.GMAIL_USER || '';       // your Gmail address
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || ''; // 16-char App Password
const ALERT_RECIPIENT = process.env.ALERT_RECIPIENT_EMAIL || GMAIL_USER;

const TYPE_LABELS: Record<string, string> = {
  fire:    '🔥 DRRM / Fire Emergency',
  crime:   '🚔 Security / Crime Emergency',
  medical: '🚑 Clinic / Medical Emergency',
  all:     '🚨 ALL OFFICES Emergency',
};

export async function POST(req: NextRequest) {
  // Guard — return 200 silently if not configured so the app doesn't crash
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: false, reason: 'Email not configured' }, { status: 200 });
  }

  try {
    const body = await req.json();
    const {
      alertType = 'unknown',
      reporterName = 'Unknown',
      reporterEmail = 'N/A',
      location = 'Unknown',
      description = 'No description',
      timestamp = new Date().toLocaleString(),
    } = body;

    const typeLabel = TYPE_LABELS[alertType] || alertType.toUpperCase();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;overflow:hidden;border:1px solid #1f2937;">
        <tr>
          <td style="background:#dc2626;padding:24px 32px;text-align:center;">
            <p style="margin:0;font-size:28px;">🚨</p>
            <h1 style="margin:8px 0 4px;color:#fff;font-size:22px;font-weight:900;">EMERGENCY ALERT</h1>
            <p style="margin:0;color:#fca5a5;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">School Emergency Hotline System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0;text-align:center;">
            <span style="display:inline-block;background:#1f2937;border:1px solid #374151;color:#f9fafb;font-size:16px;font-weight:700;padding:10px 24px;border-radius:999px;">${typeLabel}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f2937;">
                <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reporter</p>
                <p style="margin:4px 0 0;color:#f9fafb;font-size:15px;font-weight:600;">${reporterName}</p>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f2937;">
                <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reporter Email</p>
                <p style="margin:4px 0 0;color:#f9fafb;font-size:15px;font-weight:600;">${reporterEmail}</p>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f2937;">
                <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📍 Location</p>
                <p style="margin:4px 0 0;color:#f9fafb;font-size:15px;font-weight:600;">${location}</p>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f2937;">
                <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">🕐 Time Reported</p>
                <p style="margin:4px 0 0;color:#f9fafb;font-size:15px;font-weight:600;">${timestamp}</p>
              </td></tr>
              <tr><td style="padding:10px 0;">
                <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📝 Description</p>
                <p style="margin:4px 0 0;color:#f9fafb;font-size:15px;font-weight:600;">${description}</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;text-align:center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.com'}/dashboard"
               style="display:inline-block;background:#dc2626;color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;">
              Open Dashboard →
            </a>
          </td>
        </tr>
        <tr>
          <td style="background:#0d1117;padding:16px 32px;text-align:center;border-top:1px solid #1f2937;">
            <p style="margin:0;color:#4b5563;font-size:11px;">Automated alert from School Emergency Hotline. Do not reply.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from: `"School Emergency Hotline" <${GMAIL_USER}>`,
      to: ALERT_RECIPIENT,
      subject: `🚨 Emergency Alert: ${typeLabel}`,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Email API] Failed:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
