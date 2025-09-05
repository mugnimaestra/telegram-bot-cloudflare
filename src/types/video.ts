/**
 * Types for cooking video analysis system using Chutes AI API
 */

// === Cooking Recipe Types ===

/** Core cooking recipe interface - the structured output from AI analysis */
export interface CookingRecipe {
  /** The name of the dish/recipe */
  title: string;
  /** Number of servings the recipe yields */
  servings?: number;
  /** Estimated preparation time */
  prepTime?: string;
  /** Estimated cooking time */
  cookTime?: string;
  /** Total estimated time */
  totalTime?: string;
  /** Difficulty level (easy, medium, hard, etc.) */
  difficulty?: string;
  /** List of ingredients with measurements and preparations */
  ingredients: Array<{
    /** Name of the ingredient */
    item: string;
    /** Quantity/measurement (e.g., "2 cups", "1 tablespoon") */
    amount?: string;
    /** Preparation notes (e.g., "diced", "room temperature", "melted") */
    preparation?: string;
  }>;
  /** List of equipment/tools needed */
  equipment: string[];
  /** Step-by-step cooking instructions */
  instructions: Array<{
    /** Step number */
    step: number;
    /** Detailed description of the step */
    description: string;
    /** Duration for this step if specified */
    duration?: string;
    /** Additional tips for this step */
    tips?: string;
  }>;
  /** Special techniques used in the recipe */
  techniques?: string[];
  /** General cooking tips and notes */
  tips?: string[];
  /** Additional notes from the video creator */
  notes?: string;
}

// === Chutes AI API Types ===

/** Usage statistics returned by Chutes API */
export interface ChutesAPIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Individual choice in Chutes API response */
export interface ChutesAPIChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

/** Complete response from Chutes AI API */
export interface ChutesAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChutesAPIChoice[];
  usage?: ChutesAPIUsage;
}

/** Content message for video analysis request */
export interface VideoMessageContent {
  type: "video" | "text";
  video?: {
    base64: string;
  };
  text?: string;
}

/** Message structure for Chutes API request */
export interface ChutesAPIMessage {
  role: "system" | "user";
  content: string | VideoMessageContent[];
}

/** Complete Chutes API request payload */
export interface ChutesAPIRequest {
  model: string;
  messages: ChutesAPIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

// === Video Processing Types ===

/** Video processing status for progress updates */
export enum VideoProcessingStatus {
  DOWNLOADING = "downloading",
  CONVERTING = "converting",
  ANALYZING = "analyzing",
  FORMATTING = "formatting",
  COMPLETED = "completed",
  FAILED = "failed",
}

/** Progress callback for video processing */
export interface VideoProgressCallback {
  (status: VideoProcessingStatus, message: string): void;
}

/** Video processing configuration */
export interface VideoProcessingConfig {
  /** Maximum video file size in bytes (default: 20MB) */
  maxVideoSize?: number;
  /** API timeout in milliseconds (default: 60000) */
  apiTimeout?: number;
  /** Temperature for AI model (default: 0.3) */
  temperature?: number;
  /** Maximum tokens for AI response (default: 4096) */
  maxTokens?: number;
}

// === Tentative Recognition Types ===
/** Tentative analysis results for partial extractions */
export interface TentativeRecipe {
  /** Basic recipe structure with fallbacks */
  recipe: Partial<CookingRecipe>;
  /** Confidence level of the extraction (0-1) */
  confidence: number;
  /** Which parts of the recipe were successfully extracted */
  extractedParts: string[];
  /** Which parts were missing or unclear */
  missingParts: string[];
  /** Raw AI response for debugging */
  rawResponse?: any;
}

// === Utility Types ===

/** Result wrapper for video analysis operations */
export interface VideoAnalysisResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number; // Processing time in milliseconds
}

/** Extracted recipe result */
export type RecipeResult = VideoAnalysisResult<CookingRecipe>;
export type TentativeRecipeResult = VideoAnalysisResult<TentativeRecipe>;

/** Error types specific to video analysis */
export enum VideoAnalysisError {
  INVALID_VIDEO_FORMAT = "invalid_video_format",
  VIDEO_TOO_LARGE = "video_too_large",
  API_TIMEOUT = "api_timeout",
  API_ERROR = "api_error",
  PARSING_FAILED = "parsing_failed",
  NETWORK_ERROR = "network_error",
  UNKNOWN_ERROR = "unknown_error",
}

/** Video analysis error details */
export interface VideoAnalysisErrorDetails {
  type: VideoAnalysisError;
  message: string;
  details?: any;
}
