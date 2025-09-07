/**
 * Video analysis utilities for cooking recipe extraction using Google Gemini Pro Vision
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerateContentResult } from "@google/generative-ai";
import { logger } from "@/utils/logger";

export interface CookingRecipe {
  title: string;
  servings?: number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  difficulty?: string;
  ingredients: Array<{
    item: string;
    amount?: string;
    preparation?: string;
  }>;
  equipment: string[];
  instructions: Array<{
    step: number;
    description: string;
    duration?: string;
    tips?: string;
  }>;
  techniques?: string[];
  tips?: string[];
  notes?: string;
}

// Gemini API Tier 1 Limits (with billing enabled)
const GEMINI_TIER_1_DAILY_LIMIT = 1000; // 1000 requests per day for Tier 1
const GEMINI_TIER_1_RESET_HOUR = 0; // Reset at midnight UTC

interface UsageData {
  count: number;
  date: string; // YYYY-MM-DD format
  resetTime: number; // Unix timestamp for next reset
}

async function getCurrentUsage(namespace?: any): Promise<UsageData | null> {
  if (!namespace) {
    logger.warn("KV namespace not available for usage tracking");
    return null;
  }

  try {
    const usageData = await namespace.get("gemini-daily-usage");
    if (!usageData) return null;

    return JSON.parse(usageData);
  } catch (error) {
    logger.error("Failed to get usage data from KV", { error });
    return null;
  }
}

async function updateUsage(namespace?: any): Promise<boolean> {
  if (!namespace) {
    logger.warn("KV namespace not available for usage tracking");
    return true; // Allow request to proceed without tracking
  }

  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(GEMINI_TIER_1_RESET_HOUR, 0, 0, 0);
    const resetTime = Math.floor(tomorrow.getTime() / 1000);

    const currentUsage = await getCurrentUsage(namespace);

    if (!currentUsage || currentUsage.date !== today) {
      // Reset usage for new day
      const newUsage: UsageData = {
        count: 1,
        date: today,
        resetTime: resetTime,
      };
      await namespace.put("gemini-daily-usage", JSON.stringify(newUsage));
      logger.info("Gemini usage reset for new day", { count: 1, limit: GEMINI_TIER_1_DAILY_LIMIT });
      return true;
    }

    // Check if limit exceeded
    if (currentUsage.count >= GEMINI_TIER_1_DAILY_LIMIT) {
      logger.warn("Gemini daily limit exceeded", {
        current: currentUsage.count,
        limit: GEMINI_TIER_1_DAILY_LIMIT,
        resetTime: new Date(currentUsage.resetTime * 1000).toISOString(),
      });
      return false;
    }

    // Increment usage
    const updatedUsage: UsageData = {
      count: currentUsage.count + 1,
      date: currentUsage.date,
      resetTime: currentUsage.resetTime,
    };

    await namespace.put("gemini-daily-usage", JSON.stringify(updatedUsage));
    logger.info("Gemini usage updated", {
      count: updatedUsage.count,
      limit: GEMINI_TIER_1_DAILY_LIMIT,
      remaining: GEMINI_TIER_1_DAILY_LIMIT - updatedUsage.count,
    });

    return true;
  } catch (error) {
    logger.error("Failed to update usage data in KV", { error });
    return true; // Allow request to proceed if tracking fails
  }
}

function getUsageLimitMessage(currentUsage?: UsageData): string {
  if (!currentUsage) {
    return "⚠️ Usage tracking unavailable. Please check your API quota manually.";
  }

  const resetTime = new Date(currentUsage.resetTime * 1000);
  const hoursUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));

  return `🚫 Gemini API Daily Limit Exceeded

📊 Usage: ${currentUsage.count}/${GEMINI_TIER_1_DAILY_LIMIT} requests
⏰ Reset in: ${hoursUntilReset} hours (${resetTime.toLocaleString()})

💡 Upgrade options:
• Upgrade to Tier 2 ($250+ spend required)
• Contact Google Cloud sales for enterprise tier
• Wait for daily reset

🔗 Check usage: https://makersuite.google.com/app/usage`;
}

export async function analyzeVideoWithGemini(
  videoBase64: string,
  apiKey: string,
  namespace?: any,
): Promise<CookingRecipe | null> {
  // Check daily usage limits first
  const currentUsage = await getCurrentUsage(namespace);
  const canProceed = await updateUsage(namespace);

  if (!canProceed) {
    logger.warn("Gemini API daily limit exceeded, rejecting request");
    throw new Error(getUsageLimitMessage(currentUsage || undefined));
  }

  // Base64 size validation is now handled by the video analyzer service
  logger.info("Video base64 size", {
    sizeMB: Math.round(videoBase64.length / 1024 / 1024 * 100) / 100
  });

  logger.info("Starting video analysis with Google Gemini", {
    videoSizeMB: Math.round(videoBase64.length / 1024 / 1024 * 100) / 100,
    hasApiKey: !!apiKey,
    currentUsage: currentUsage?.count || 0,
    dailyLimit: GEMINI_TIER_1_DAILY_LIMIT,
  });

  try {
    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(apiKey);

    // Set up 60-second timeout for video analysis (reduced for better user experience)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000);

    logger.debug("Initializing Gemini Pro Vision model", {
      videoSize: Math.ceil((videoBase64.length * 3) / 4),
      timeout: 60000,
    });

    // Get the Gemini Pro Vision model
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    // Create the prompt
    const prompt = getCookingAnalysisPrompt();

    // Create the video part
    const videoPart = {
      inlineData: {
        data: videoBase64,
        mimeType: "video/mp4",
      },
    };

    // Generate content with timeout and memory safety
    logger.debug("Starting Gemini content generation");
    
    const result = await Promise.race([
      model.generateContent([
        prompt,
        videoPart,
        "Please analyze this cooking video and extract the complete recipe information in JSON format.",
      ]),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Analysis timeout after 60 seconds")), 60000)
      )
    ]) as GenerateContentResult;

    clearTimeout(timeoutId);

    const response = await result.response;
    const content = response.text();

    logger.debug("Received Gemini API response", {
      responseSizeKB: Math.round(content.length / 1024 * 100) / 100,
    });

    // Parse the response into structured recipe format
    const recipe = parseRecipeResponse(content);
    if (recipe) {
      logger.info("Video analysis completed successfully", {
        title: recipe.title,
      });
    }
    return recipe;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.error("Video analysis timed out after 60 seconds");
      throw new Error("Video analysis timed out. Please try with a shorter video.");
    } else if (error instanceof Error && 
               (error.message.includes("out of memory") || 
                error.message.includes("Maximum call stack") ||
                error.message.includes("heap out of memory"))) {
      logger.error("Video analysis failed due to memory constraints", {
        error: error.message.substring(0, 200),
        videoSizeMB: Math.round(videoBase64.length / 1024 / 1024 * 100) / 100,
      });
      throw new Error("Video too complex to process. Please try with a shorter or simpler video.");
    } else if (error instanceof Error) {
      logger.error("Video analysis failed", {
        error: error.message.substring(0, 500),
        videoSizeMB: Math.round(videoBase64.length / 1024 / 1024 * 100) / 100,
      });
      throw error; // Re-throw to maintain error context
    } else {
      logger.error("Video analysis failed with unknown error", {
        error: String(error).substring(0, 200),
        videoSizeMB: Math.round(videoBase64.length / 1024 / 1024 * 100) / 100,
      });
      throw new Error("Video analysis failed. Please try again with a different video.");
    }
  }
}

function getCookingAnalysisPrompt(): string {
  return `You are a culinary content analyzer specializing in extracting detailed recipe information from cooking videos. Your task is to watch cooking demonstrations and create complete, accurate recipe documentation.

## Primary Extraction Goals

Extract and organize the following information from the cooking video:

### Recipe Metadata
- Dish name (both common and any cultural/regional names mentioned)
- Serving size/yield
- Prep time, cooking time, and total time
- Difficulty level (if apparent from complexity)

### Ingredients List
Create a comprehensive ingredients list with:
- Exact measurements when shown or mentioned
- Ingredient state/preparation (e.g., "diced", "room temperature", "melted")
- Substitutions mentioned by the creator
- Optional ingredients clearly marked

### Step-by-Step Instructions
Document the cooking process:
- Break down into clear, numbered steps
- Include specific techniques demonstrated
- Note cooking times for each step
- Include visual cues mentioned (e.g., "until golden brown")
- Capture any tips or warnings given

### Equipment and Techniques
- List all tools and appliances used
- Note special techniques demonstrated
- Include temperature settings shown

IMPORTANT: Respond with a valid JSON object following this exact structure:

{
  "title": "Recipe Name",
  "servings": 4,
  "prepTime": "15 minutes",
  "cookTime": "30 minutes",
  "totalTime": "45 minutes",
  "difficulty": "medium",
  "ingredients": [
    {
      "item": "ingredient name",
      "amount": "2 cups",
      "preparation": "diced"
    }
  ],
  "equipment": ["mixing bowl", "whisk", "oven"],
  "instructions": [
    {
      "step": 1,
      "description": "Detailed step description",
      "duration": "5 minutes",
      "tips": "Any specific tips for this step"
    }
  ],
  "techniques": ["folding", "whisking"],
  "tips": ["general cooking tips from the video"],
  "notes": "Additional observations or context"
}

Ensure the JSON is valid and complete. Extract as much detail as possible from the video.`;
}

function extractJSONFromContent(content: string): string | null {
  try {
    // Prevent processing of excessively long content
    if (content.length > 50000) { // Reduced to 50KB limit for safety
      logger.warn("Content too long for JSON extraction, truncating", {
        originalSizeKB: Math.round(content.length / 1024),
        truncatedSizeKB: Math.round(50000 / 1024),
      });
      content = content.substring(0, 50000);
    }

    // Try multiple approaches to find JSON, starting with the most reliable

    // Approach 1: Look for JSON code blocks first
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) {
      const jsonCandidate = codeBlockMatch[1].trim();
      try {
        JSON.parse(jsonCandidate); // Validate it's valid JSON
        return jsonCandidate;
      } catch {
        // Continue to next approach if invalid
      }
    }

    // Approach 2: Find the largest JSON-like structure using regex
    const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (jsonMatches) {
      // Sort by length and try the largest matches first
      const sortedMatches = jsonMatches.sort((a, b) => b.length - a.length);
      
      for (const match of sortedMatches) {
        try {
          JSON.parse(match); // Validate it's valid JSON
          return match;
        } catch {
          // Try the next match
          continue;
        }
      }
    }

    // Approach 3: More comprehensive regex for nested objects
    const nestedJsonRegex = /\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\}/g;
    const nestedMatches = content.match(nestedJsonRegex);
    if (nestedMatches) {
      const sortedNestedMatches = nestedMatches.sort((a, b) => b.length - a.length);
      
      for (const match of sortedNestedMatches) {
        try {
          JSON.parse(match);
          return match;
        } catch {
          continue;
        }
      }
    }

    // Approach 4: Simple fallback - first { to last }
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonCandidate = content.substring(jsonStart, jsonEnd + 1);
      try {
        JSON.parse(jsonCandidate);
        return jsonCandidate;
      } catch {
        // Last resort failed
      }
    }

    return null;
  } catch (error) {
    logger.error("Error extracting JSON from content", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseRecipeResponse(content: string): CookingRecipe | null {
  try {
    // Try to find JSON in the response

    // FIX: Improved regex to handle JSON objects more accurately
    // Use a more robust approach to extract JSON from content
    const jsonMatch = extractJSONFromContent(content);

    if (!jsonMatch) {
          logger.error("No valid JSON object found in API response", {
      contentSizeKB: Math.round(content.length / 1024 * 100) / 100,
    });
      return null;
    }

    const jsonStr = jsonMatch;

    // Try to parse the JSON, with fallback to partial extraction if it fails
    let recipe;
    try {
      recipe = JSON.parse(jsonStr);
    } catch (jsonError) {
      logger.debug("JSON parsing failed, trying fallback extraction", { error: jsonError });
      return extractPartialRecipe(content);
    }

    // Validate the structure - allow partial recipes missing some fields
    if (!recipe.title || !recipe.ingredients) {
      logger.error("Invalid recipe structure from API response", {
        hasTitle: !!recipe.title,
        ingredientsLength: recipe.ingredients?.length,
        instructionsLength: recipe.instructions?.length,
      });
      return null;
    }

    // Initialize missing optional fields
    if (!recipe.instructions) recipe.instructions = [];
    if (!recipe.equipment) recipe.equipment = [];

    return recipe as CookingRecipe;
  } catch (error) {
    logger.error("Failed to parse API response as JSON", {
      error: (error instanceof Error ? error.message : String(error)).substring(0, 200),
      contentSizeKB: Math.round(content.length / 1024 * 100) / 100,
    });
    // Try to extract partial data if JSON parsing fails
    return extractPartialRecipe(content);
  }
}

function extractPartialRecipe(content: string): CookingRecipe | null {
  try {
    // Prevent processing of excessively long content for safety
    if (content.length > 20000) { // 20KB limit for partial extraction
      logger.warn("Content too long for partial extraction, truncating", {
        originalSizeKB: Math.round(content.length / 1024),
        truncatedSizeKB: 20,
      });
      content = content.substring(0, 20000);
    }

    // Fallback extraction using regex patterns
    const recipe: CookingRecipe = {
      title: "Recipe from Video",
      ingredients: [],
      equipment: [],
      instructions: [],
    };

    // Try to extract title (with size limit)
    const titleMatch = content.match(/"title"\s*:\s*"([^"]{1,200})"/);
    if (titleMatch) recipe.title = titleMatch[1];

    // Try to extract ingredients (limit the number of ingredients to prevent excessive processing)
    const ingredientsMatch = content.match(
      /"ingredients"\s*:\s*\[([\s\S]{1,5000}?)\]/,
    );
    if (ingredientsMatch) {
      const ingredientItems = ingredientsMatch[1].match(/\{[^}]{1,500}\}/g);
      if (ingredientItems && ingredientItems.length <= 50) { // Limit to 50 ingredients max
        ingredientItems.forEach((item) => {
          const itemMatch = item.match(/"item"\s*:\s*"([^"]{1,100})"/);
          const amountMatch = item.match(/"amount"\s*:\s*"([^"]{1,50})"/);
          if (itemMatch) {
            recipe.ingredients.push({
              item: itemMatch[1],
              amount: amountMatch ? amountMatch[1] : undefined,
            });
          }
        });
      }
    }

    return recipe.ingredients.length > 0 ? recipe : null;
  } catch (error) {
    logger.error("Fallback recipe extraction failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}


/**
 * Validate basic video input requirements
 * @param videoBase64 - Base64 video data
 * @param maxSizeBytes - Maximum allowed size in bytes (for base64 string length)
 * @returns Validation result
 */
export function validateVideoInput(
  videoBase64: string,
  maxSizeBytes: number = 100 * 1024 * 1024, // Increased to 100MB, but validation is primarily handled by the analyzer service
): boolean {
  if (!videoBase64) {
    logger.error("Video validation failed: No video data provided");
    return false;
  }

  // Check if input is valid base64
  const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Pattern.test(videoBase64)) {
    logger.error("Video validation failed: Invalid base64 format");
    return false;
  }

  // Check raw base64 string length (consistent with analyzeVideoWithChutes)
  if (videoBase64.length > maxSizeBytes) {
    logger.error("Video validation failed: Base64 string too large", {
      actualSizeMB: (videoBase64.length / 1024 / 1024).toFixed(2),
      maxSizeMB: (maxSizeBytes / 1024 / 1024).toFixed(2),
    });
    return false;
  }

  logger.debug("Video input validated successfully", {
    base64Length: videoBase64.length,
    sizeMB: (videoBase64.length / 1024 / 1024).toFixed(2),
  });
  return true;
}
