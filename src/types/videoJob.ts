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
    type: 'webhook';
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
      prep_time_minutes?: number;
      cook_time_minutes?: number;
      total_time_minutes?: number;
      servings?: string;
      difficulty_level?: string;
      cuisine_type?: string;
      meal_category?: string;
      dietary_info?: string[];
      cultural_context?: string;
      equipment?: Array<{
        item: string;
        size_or_type?: string;
        alternative?: string;
      }>;
      techniques?: Array<{
        name: string;
        description?: string;
        purpose?: string;
      }>;
      notes_and_tips?: string[];
      serving_suggestions?: string[];
      variations?: string[];
      storage_instructions?: string;
      reheating_instructions?: string;
    };
  };
  error?: string;
  error_type?: "size_context_limit" | "processing_error" | "network_error" | "unknown_error";
  error_details?: {
    max_size_mb?: number;
    max_duration_seconds?: number;
    max_frames?: number;
    suggested_actions?: string[];
  };
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
      prep_time_minutes?: number;
      cook_time_minutes?: number;
      total_time_minutes?: number;
      servings?: string;
      difficulty_level?: string;
      cuisine_type?: string;
      meal_category?: string;
      dietary_info?: string[];
      cultural_context?: string;
      equipment?: Array<{
        item: string;
        size_or_type?: string;
        alternative?: string;
      }>;
      techniques?: Array<{
        name: string;
        description?: string;
        purpose?: string;
      }>;
      notes_and_tips?: string[];
      serving_suggestions?: string[];
      variations?: string[];
      storage_instructions?: string;
      reheating_instructions?: string;
    };
  };
  error?: string;
  error_type?: "size_context_limit" | "processing_error" | "network_error" | "unknown_error";
  error_details?: {
    max_size_mb?: number;
    max_duration_seconds?: number;
    max_frames?: number;
    suggested_actions?: string[];
  };
  callback_data: {
    chat_id: number;
    message_id: number;
    bot_token: string;
  };
}