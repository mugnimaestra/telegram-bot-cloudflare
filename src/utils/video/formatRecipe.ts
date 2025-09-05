/**
 * Recipe formatting utilities for converting CookingRecipe objects to Telegram MarkdownV2 messages
 */

import type { CookingRecipe } from "@/types/video";
import { escapeMarkdown } from "@/utils/telegram/escapeMarkdown";
import { logger } from "@/utils/logger";

/** Maximum characters per Telegram message (with some buffer for formatting) */
const MAX_MESSAGE_LENGTH = 3500;

// Modified to match PLAN.md structure exactly
export function formatRecipeMessage(recipe: CookingRecipe): string {
  logger.debug("Formatting recipe message", { title: recipe.title });

  // Boundary checks
  if (!recipe || (!recipe.title && (!recipe.ingredients || recipe.ingredients.length === 0) && (!recipe.equipment || recipe.equipment.length === 0) && (!recipe.instructions || recipe.instructions.length === 0))) {
    logger.error("Recipe formatting failed: No recipe object provided or empty recipe");
    return "❌ Unable to format recipe: Invalid recipe data";
  }

  try {
    let message = `🍳 *${escapeMarkdown(recipe.title || "Recipe from Video")}*\n\n`;

    // Basic info section with enhanced emojis
    const infoItems = [];
    if (recipe.servings) infoItems.push(`👥 *Serves:* ${recipe.servings}`);
    if (recipe.prepTime)
      infoItems.push(`⏱️ *Prep:* ${escapeMarkdown(recipe.prepTime)}`);
    if (recipe.cookTime)
      infoItems.push(`🔥 *Cook:* ${escapeMarkdown(recipe.cookTime)}`);
    if (recipe.totalTime)
      infoItems.push(`⏰ *Total:* ${escapeMarkdown(recipe.totalTime)}`);
    if (recipe.difficulty)
      infoItems.push(`📊 *Difficulty:* ${escapeMarkdown(recipe.difficulty)}`);

    if (infoItems.length > 0) {
      message += infoItems.join(" \\| ") + "\n\n";
    }

    // Ingredients
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      message += `🛒 *Shopping List:*\n`;
      recipe.ingredients.forEach((ing, index) => {
        // Safety check for undefined ingredient object
        if (!ing) {
          logger.warn(`Undefined ingredient at index ${index}, skipping`);
          return;
        }
        
        // Only add ingredients that have meaningful content
        if (!ing.item && !ing.amount && !ing.name) return;

        const item = escapeMarkdown(ing.item || ing.name || "");
        const amount = ing.amount ? `${escapeMarkdown(ing.amount)} ` : "";
        const unit = ing.unit ? `${escapeMarkdown(ing.unit)} ` : "";
        const prep = ing.preparation || ing.notes
          ? ` (${escapeMarkdown(ing.preparation || ing.notes || "")})`
          : "";
        const optional = ing.optional ? " *(optional)*" : "";
        
        message += `• ${amount}${unit}${item}${prep}${optional}\n`;
      });
    }

    // Equipment
    if (recipe.equipment && recipe.equipment.length > 0) {
      message += `\n🔧 *Equipment:*\n`;
      message +=
        recipe.equipment.map((item, index) => {
          if (!item) {
            logger.warn(`Undefined equipment item at index ${index}, skipping`);
            return "";
          }
          return `• ${escapeMarkdown(item)}`;
        }).filter(Boolean).join("\n") +
        "\n";
    }

    // Instructions
    if (recipe.instructions && recipe.instructions.length > 0) {
      message += `\n👩‍🍳 *Cooking Instructions:*\n`;
      recipe.instructions.forEach((inst, index) => {
        // Safety check for undefined instruction object
        if (!inst) {
          logger.warn(`Undefined instruction at index ${index}, skipping`);
          return;
        }

        const stepNum = inst.step || inst.step_number || index + 1;
        const description = escapeMarkdown(inst.description || inst.action || "");
        const duration = inst.duration || inst.time
          ? ` ⏱️ ${escapeMarkdown(inst.duration || inst.time || "")}`
          : "";
        const temperature = inst.temperature
          ? ` 🌡️ ${escapeMarkdown(inst.temperature)}`
          : "";
        
        message += `\n*Step ${stepNum}*${duration}${temperature}\n`;
        message += `${description}\n`;
        
        if (inst.tips) {
          message += `💡 _${escapeMarkdown(inst.tips)}_\n`;
        }
        
        if (inst.visual_cues) {
          message += `👁️ _${escapeMarkdown(inst.visual_cues)}_\n`;
        }
      });
    }

    // Techniques
    if (recipe.techniques && recipe.techniques.length > 0) {
      message += `\n🎯 *Techniques Used:*\n`;
      message +=
        recipe.techniques
          .map((tech) => `• ${escapeMarkdown(tech || "")}`)
          .join("\n") + "\n";
    }

    // Tips
    if (recipe.tips && recipe.tips.length > 0) {
      message += `\n💡 *Tips & Tricks:*\n`;
      recipe.tips.forEach((tip, index) => {
        if (tip) {
          message += `• ${escapeMarkdown(tip)}\n`;
        } else {
          logger.warn(`Undefined tip at index ${index}, skipping`);
        }
      });
    }

    // Notes
    if (recipe.notes) {
      message += `\n📌 *Notes:* ${escapeMarkdown(recipe.notes)}\n\n`;
    }

    // Footer
    message += `_Recipe extracted from video using AI analysis_`;

    logger.debug("Recipe message formatted successfully", {
      messageLength: message.length,
    });
    return message;
  } catch (error) {
    logger.error("Recipe message formatting failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return `❌ Unable to format recipe: Formatting error occurred`;
  }
}

/**
 * Split long messages to comply with Telegram limits
 * @param message - Full message to split
 * @param maxLength - Maximum length per message
 * @returns Array of message chunks
 */
export function splitMessage(
  message: string,
  maxLength: number = MAX_MESSAGE_LENGTH,
): string[] {
  if (message.length <= maxLength) {
    return [message];
  }



  const sections = message.split("\n\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const section of sections) {
    // Check if section itself needs splitting
    if (section.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      // Split the long section
      chunks.push(...splitLongSection(section, maxLength));
    } else {
      const potentialChunk =
        currentChunk + (currentChunk ? "\n\n" : "") + section;

      if (potentialChunk.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = section;
        } else {
          // This shouldn't happen now due to section length check
          chunks.push(...splitLongSection(section, maxLength));
          currentChunk = "";
        }
      } else {
        currentChunk = potentialChunk;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Split a long section that exceeds message limits
 * @param section - Section text to split
 * @param maxLength - Maximum length per chunk
 * @returns Array of split chunks
 */
function splitLongSection(section: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = section;

  while (remaining.length > maxLength) {
    // Force split at maxLength to ensure compliance
    let splitPoint = Math.max(maxLength - 3, 1); // Reserve 3 chars for "..."

    // Always try to find a nearby space for cleaner breaks
    const chunk = remaining.substring(0, maxLength + 10); // Look a bit ahead
    const lastSpace = chunk.lastIndexOf(" ");
    const nextSpace = remaining.indexOf(" ", maxLength);

    // Use space if it's reasonably positioned
    if (nextSpace > 0 && nextSpace < maxLength + 20) {
      splitPoint = nextSpace;
    } else if (lastSpace > maxLength - 30 && lastSpace > 0) {
      splitPoint = lastSpace;
    }

    const chunkContent = remaining.substring(0, splitPoint).trim();
    chunks.push(chunkContent + "...");

    remaining = remaining.substring(splitPoint).trim();

    // Safety check: ensure we don't create infinite loops
    if (chunks.length > 50) {
      chunks.push(remaining);
      break;
    }
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Format recipe with automatic length handling and chunking
 * @param recipe - CookingRecipe object
 * @returns Array of formatted message chunks
 */
export function formatRecipeWithChunking(recipe: CookingRecipe): string[] {
  const fullMessage = formatRecipeMessage(recipe);
  const chunks = splitMessage(fullMessage);

  // Add title to each chunk (except first)
  if (chunks.length > 1 && recipe.title && fullMessage.includes(recipe.title)) {
    const titleLine = fullMessage.split('\n')[0]; // First line contains the title
    for (let i = 1; i < chunks.length; i++) {
      chunks[i] = titleLine + '\n\n(Continued...)' + '\n\n' + chunks[i];
    }
  }

  return chunks;
}

