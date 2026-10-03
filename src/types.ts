import { DeviceInfo } from './utils/device';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderAlias: string;
  senderAvatar: string;
  text: string;
  msgType?: 'text' | 'audio' | 'image' | 'system';
  mediaUrl?: string;
  duration?: number;
  burnTimer?: number | null;
  timestamp: number;
  reactions?: Record<string, string[]>;
  isSelf?: boolean;
  deviceInfo?: DeviceInfo;
}

export interface PeerUser {
  userId: string;
  alias: string;
  avatar: string;
  deviceInfo?: DeviceInfo;
  lastSeen: number;
}
