/**
 * Type definitions for video analysis jobs
 */

export interface VideoAnalysisJob {
  jobId: string;
  chatId: number;
  messageId: number | null;
  userId?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export interface VideoAnalysisJobRequest {
  video_url: string;
  bot_token: string;
  callback: {
    type: 'telegram';
    webhook_url: string;
    chat_id: number;
    message_id: number;
  };
  metadata?: {
    user_id?: number;
    timestamp: number;
  };
}

export interface VideoAnalysisJobResponse {
  job_id: string;
  status: string;
  message: string;
  progress?: number;
}

export interface VideoAnalysisJobStatus {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  updated_at: string;
  result?: {
    recipe?: {
      title?: string;
      recipe_title?: string;
      ingredients: Array<{
        item?: string;
        name?: string;
        amount?: string;
        unit?: string;
        preparation?: string;
        notes?: string;
        optional?: boolean;
      }>;
      instructions: Array<{
        step?: number;
        step_number?: number;
        instruction?: string;
        action?: string;
        time?: string;
        duration?: string;
        temperature?: string;
        visual_cues?: string;
        tips?: string;
      }>;
      prep_time?: string;
      cook_time?: string;
      total_time?: string;
      servings?: number;
      difficulty?: string;
      cuisine?: string;
      cuisine_type?: string;
      tags?: string[];
      notes?: string;
      notes_and_tips?: string[];
    };
  };
  error?: string;
}

export interface VideoAnalysisWebhookPayload {
  job_id: string;
  status: 'completed' | 'failed';
  result?: {
    recipe?: {
      title?: string;
      recipe_title?: string;
      ingredients: Array<{
        item?: string;
        name?: string;
        amount?: string;
        unit?: string;
        preparation?: string;
        notes?: string;
        optional?: boolean;
      }>;
      instructions: Array<{
        step?: number;
        step_number?: number;
        instruction?: string;
        action?: string;
        time?: string;
        duration?: string;
        temperature?: string;
        visual_cues?: string;
        tips?: string;
      }>;
      prep_time?: string;
      cook_time?: string;
      total_time?: string;
      servings?: number;
      difficulty?: string;
      cuisine?: string;
      cuisine_type?: string;
      tags?: string[];
      notes?: string;
      notes_and_tips?: string[];
    };
  };
  error?: string;
  callback_data: {
    chat_id: number;
    message_id: number;
    bot_token: string;
  };
}