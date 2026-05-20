/**
 * Email notification service — calls the Next.js API route /api/send-alert-email
 * which uses Gmail SMTP with an App Password (configured in .env.local).
 *
 * No manual setup needed in this file. Just fill in .env.local once.
 */

export interface AlertEmailParams {
  alertType: 'fire' | 'crime' | 'medical' | 'all';
  reporterName: string;
  reporterEmail?: string;
  location: string;
  description?: string;
  timestamp: string;
}

export async function sendAlertEmailNotification(params: AlertEmailParams): Promise<boolean> {
  try {
    const res = await fetch('/api/send-alert-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (data.ok) {
      console.info('[Email] Alert email sent successfully');
      return true;
    }
    console.warn('[Email] Not sent:', data.reason || data.error);
    return false;
  } catch (e) {
    console.warn('[Email] Failed to send alert email:', e);
    return false;
  }
}
