/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EMAIL NOTIFICATIONS — EmailJS (free, no backend needed)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * QUICK SETUP (5 minutes):
 *
 * 1. Go to https://www.emailjs.com  →  Sign Up (free)
 *
 * 2. Add Email Service:
 *    Dashboard → Email Services → Add New Service → Gmail
 *    Connect your school Gmail account → Copy the Service ID
 *    Paste it as EMAILJS_SERVICE_ID below
 *
 * 3. Create Email Template:
 *    Dashboard → Email Templates → Create New Template
 *    - Set "To Email" field to:  {{to_email}}
 *    - Set Subject to:           🚨 Emergency Alert: {{alert_type}}
 *    - Paste the HTML from:      docs/email-template.html  (in this project)
 *    - Save → Copy the Template ID
 *    Paste it as EMAILJS_TEMPLATE_ID below
 *
 * 4. Get your Public Key:
 *    Dashboard → Account → General → Public Key
 *    Paste it as EMAILJS_PUBLIC_KEY below
 *
 * 5. Set your school Gmail as ALERT_NOTIFICATION_EMAIL below
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PASTE YOUR VALUES HERE:
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';    // e.g. 'service_abc123'
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';   // e.g. 'template_xyz789'
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';    // e.g. 'abcDEFghiJKL'

/** Gmail address that receives ALL emergency alert notifications */
export const ALERT_NOTIFICATION_EMAIL = 'your-school@gmail.com';

// ─────────────────────────────────────────────────────────────────────────────

export interface AlertEmailParams {
  alertType: 'fire' | 'crime' | 'medical' | 'all';
  reporterName: string;
  reporterEmail?: string;
  location: string;
  description?: string;
  timestamp: string;
  toEmail?: string;
}

const TYPE_LABELS: Record<string, string> = {
  fire:    '🔥 DRRM / Fire Emergency',
  crime:   '🚔 Security / Crime Emergency',
  medical: '🚑 Clinic / Medical Emergency',
  all:     '🚨 ALL OFFICES Emergency',
};

let emailjsInitialized = false;

export async function sendAlertEmailNotification(params: AlertEmailParams): Promise<boolean> {
  // Skip if not configured yet
  if (
    EMAILJS_SERVICE_ID  === 'YOUR_SERVICE_ID'  ||
    EMAILJS_TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ||
    EMAILJS_PUBLIC_KEY  === 'YOUR_PUBLIC_KEY'
  ) {
    console.info('[EmailJS] Not configured — skipping email notification. See src/lib/email-notifications.ts for setup.');
    return false;
  }

  try {
    // Load EmailJS from CDN once
    if (!emailjsInitialized) {
      // @ts-ignore
      if (!window.emailjs) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('EmailJS CDN failed to load'));
          document.head.appendChild(script);
        });
      }
      // @ts-ignore
      window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      emailjsInitialized = true;
    }

    const templateParams = {
      to_email:       params.toEmail || ALERT_NOTIFICATION_EMAIL,
      alert_type:     TYPE_LABELS[params.alertType] || params.alertType.toUpperCase(),
      reporter_name:  params.reporterName,
      reporter_email: params.reporterEmail || 'N/A',
      location:       params.location,
      description:    params.description || 'No description provided',
      timestamp:      params.timestamp,
      dashboard_url:  typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : '',
    };

    // @ts-ignore
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
    console.info('[EmailJS] Alert email sent to', templateParams.to_email);
    return true;
  } catch (e) {
    console.warn('[EmailJS] Email notification failed:', e);
    return false;
  }
}
