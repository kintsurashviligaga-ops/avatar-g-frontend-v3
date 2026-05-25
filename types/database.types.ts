/**
 * Supabase database types — hand-authored, generated-format-compatible schema for
 * the tables consumed by the typed browser client. Replaces the `as any` casts in
 * lib/chat-history.ts with strict, compile-checked types.
 *
 * Shape matches `supabase gen types typescript` output so it can be swapped for a
 * fully-generated file later without code changes. Extend the `Tables` map as more
 * tables are accessed through a typed client.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      chat_sessions: {
        Row: {
          session_id: string;
          user_id: string;
          agent_id: string | null;
          channel: string | null;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          session_id?: string;
          user_id: string;
          agent_id?: string | null;
          channel?: string | null;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          session_id?: string;
          user_id?: string;
          agent_id?: string | null;
          channel?: string | null;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
