export type UserRole = 'admin' | 'user' | 'fire' | 'police' | 'medical' | 'security' | 'drrm' | 'clinic' | 'school_user';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: any;
  photoURL?: string;
  age?: number;
  sex?: string;
  falseReportCount?: number;
  isDeactivated?: boolean;
  fcmToken?: string;
}

export interface UserNotification {
  id: string;
  type: 'warning' | 'deactivated' | 'status_update';
  title: string;
  message: string;
  timestamp: any;
  read: boolean;
}

export type EmergencyType = 'fire' | 'crime' | 'medical';
export type AlertStatus = 'pending' | 'responding' | 'resolved' | 'false_report';

export interface EmergencyAlert {
  id: string;
  userId: string;
  userName: string;
  userAge?: number;
  userSex?: string;
  userEmail?: string;
  userPhotoURL?: string;
  exactAddress?: string;
  type: EmergencyType;
  color: string;
  description?: string;
  location: {
    lat: number;
    lng: number;
  } | null;
  status: AlertStatus;
  timestamp: any;
  responderId?: string;
  responderName?: string;
  responseStartTime?: any;
  resolvedTime?: any;
  aiAnalysis?: string;
  photoEvidenceUrl?: string;
  voiceNoteUrl?: string;
  hasPhoto?: boolean;
  hasVoice?: boolean;
  falseReportBy?: string;
  falseReportTime?: any;
}

export interface SystemLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  timestamp: any;
}

export interface FeedbackResponse {
  id: string;
  userId: string;
  easeOfUse: number;
  reliability: number;
  satisfaction: number;
  comments?: string;
  timestamp: any;
}