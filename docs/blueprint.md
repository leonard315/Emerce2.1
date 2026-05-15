# **App Name**: GuardianLink

## Core Features:

- User Authentication & Authorization: Secure Firebase Authentication for user registration and login, implementing role-based access for Admin, General Users, Fire, Police, and Medical agencies, with roles stored in Firestore.
- Color-Coded Emergency Alerting: General users access a simple dashboard with large color-coded buttons (Orange for Fire, Blue for Crime, Red for Medical) to trigger alerts. A confirmation popup precedes alert submission, capturing GPS location, and sending alert data to Firestore.
- Personal Alert History & Status Tracking: Users can view a chronological history of their submitted alerts, complete with real-time status updates (Pending, Responding, Resolved).
- Admin Dashboard - Comprehensive Oversight: An administrative interface to manage all registered users, assign or modify roles, monitor all incoming alerts across all agencies in real-time, and manage system logs.
- Agency-Specific Alert Management: Dedicated dashboards for Fire, Police, and Medical agencies to view only alerts relevant to their jurisdiction, allowing real-time acceptance, status updates (Pending to Responding to Resolved), and potentially viewing location on a map.
- User Feedback & Usability Questionnaire: Integrate a post-use Likert scale questionnaire to gather user feedback on ease of use, reliability, and satisfaction, with responses securely stored in Firestore to adhere to TAM principles.
- Real-time Performance Metrics & Logging: Automated system logging and timing records track user click behavior, alert accuracy, response flow, and calculates the time from alert creation to response, storing this data in Firestore for research and analytics.

## Style Guidelines:

- Primary brand color: A dependable slate blue (#456BA1) to convey trust and professionalism in system branding and key interactive elements. Background color: A subtle, clean light grayish blue (#E8EAEE) for an expansive, modern feel on light themes. Accent color: A vibrant cyan (#1AD5E6) used for highlighting important notifications and calls to action. Semantic alert colors: Prominently feature Orange (#FFA500) for Fire, Blue (#007FFF) for Crime, and Red (#FF0000) for Medical emergencies, ensuring clear signal detection.
- Headline and body font: 'Inter', a grotesque-style sans-serif, chosen for its modern, objective, and highly legible characteristics suitable for an emergency response system's clean, functional dashboard.
- Use clear, universally recognizable icons, especially for emergency types and actions, to minimize cognitive load and confusion during critical situations, reinforcing color-coding where appropriate.
- A clean, spacious, and responsive dashboard design ensuring optimal usability and readability across all devices (mobile-friendly), featuring simple navigation pathways for rapid interaction and emergency response. Crucial interactive elements like alert buttons are large and distinct.
- Subtle, non-distracting animations for real-time updates and notifications (e.g., new alert arrival, status change), designed to draw user attention efficiently without causing cognitive fatigue in high-stress situations.