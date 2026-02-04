export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          credits: number
          subscription_tier: "free" | "pro" | "enterprise"
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          credits?: number
          subscription_tier?: "free" | "pro" | "enterprise"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          credits?: number
          subscription_tier?: "free" | "pro" | "enterprise"
          created_at?: string
          updated_at?: string
        }
      }
      generation_jobs: {
        Row: {
          id: string
          user_id: string
          type: "video" | "image" | "music" | "voice"
          prompt: string
          status: "pending" | "processing" | "completed" | "failed"
          params: Json
          result_url: string | null
          progress: number | null
          error_message: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: "video" | "image" | "music" | "voice"
          prompt: string
          status?: "pending" | "processing" | "completed" | "failed"
          params?: Json
          result_url?: string | null
          progress?: number | null
          error_message?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: "video" | "image" | "music" | "voice"
          prompt?: string
          status?: "pending" | "processing" | "completed" | "failed"
          params?: Json
          result_url?: string | null
          progress?: number | null
          error_message?: string | null
          created_at?: string
          completed_at?: string | null
        }
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}
