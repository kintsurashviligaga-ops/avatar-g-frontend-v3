/** Shared shapes for the support live chat. Mirrors supabase/migrations/20260802_support_live_chat.sql. */

export type SupportChatStatus = 'open' | 'pending' | 'closed';
export type SupportSender = 'user' | 'admin';

export interface SupportMessage {
  id: string;
  chat_id: string;
  sender: SupportSender;
  body: string;
  created_at: string;
}

export interface SupportChat {
  id: string;
  user_id: string;
  status: SupportChatStatus;
  subject: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  last_sender: SupportSender | null;
  message_count: number;
  unread_for_admin: number;
  unread_for_user: number;
  created_at: string;
}

/** A row in the admin inbox list — the chat plus who it belongs to. */
export interface SupportChatWithUser extends SupportChat {
  email: string | null;
}
