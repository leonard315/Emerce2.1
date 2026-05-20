/**
 * Email notification service using EmailJS (no backend required).
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://www.emailjs.com and create a free account
 * 2. Add a Gmail service (connect your Gmail account)
 * 3. Create an email template with these variables:
 *    {{to_email}}, {{alert_type}}, {{reporter_name}}, {{location}},
 *    {{timestamp}}, {{description}}, {{dashboard_url}}
 * 4. Replace the placeholders below with your actual IDs
 */

const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';   // e.g. 'service_abc123'
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; // e.g. 'template_xyz789'
const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';   // e.g. 'abcDEFghiJKL'

// Recipient email — the Gmail that receives all alert notifications
export const ALERT_NOTIFICATION_EMAIL = 'your-school@gmail.com';

export interface AlertEmailParams {
  alertType: 'fire' | 'crime' | 'medical' | 'all';
  reporterName: string;
  reporterEmail?: string;
  location: string;
  description?: string;
  timestamp: string;
  toEmail?: string; // override recipient
}

const typeLabels: Record<string, string> = {
  fire: '🔥 DRRM / Fire Emergency',
  crime: '🚔 Security / Crime Emergency',
  medical: '🚑 Clinic / Medical Emergency',
  all: '🚨 ALL OFFICES Emergency',
};

export async function sendAlertEmailNotification(params: AlertEmailParams): Promise<boolean> {
  // Dynamically load EmailJS from CDN — no npm install needed
  try {
    // @ts-ignore
    if (!window.emailjs) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('EmailJS CDN failed to load'));
        document.head.appendChild(script);
      });
      // @ts-ignore
      window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    }

    const templateParams = {
      to_email: params.toEmail || ALERT_NOTIFICATION_EMAIL,
      alert_type: typeLabels[params.alertType] || params.alertType.toUpperCase(),
      reporter_name: params.reporterName,
      reporter_email: params.reporterEmail || 'N/A',
      location: params.location,
      description: params.description || 'No description provided',
      timestamp: params.timestamp,
      dashboard_url: typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : '',
    };

    // @ts-ignore
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
    return true;
  } catch (e) {
    console.warn('Email notification failed:', e);
    return false;
  }
}
