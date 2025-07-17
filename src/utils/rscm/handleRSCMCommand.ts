import { TelegramContext } from "./types";
import { CommandHandler } from "./handlers/CommandHandler";
import { logger } from "./logger";

interface Env {
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
  MAX_RETRIES?: string;
}

/**
 * Handle the /rscm command using the new modular architecture
 */
export async function handleRSCMCommand(
  ctx: TelegramContext,
  env?: Env
): Promise<void> {
  logger.info("Handling RSCM command", {
    chatId: ctx.chat.id,
    messageText: ctx.message.text,
  });

  try {
    const commandHandler = new CommandHandler(env);
    await commandHandler.handleCommand(ctx);
  } catch (error) {
    logger.error("Unhandled error in RSCM command handler", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback error handling
    try {
      await ctx.reply(
        "❌ An unexpected error occurred\\. Please try again later\\.",
        { parse_mode: "MarkdownV2" }
      );
    } catch (replyError) {
      logger.error("Failed to send fallback error message", {
        error: replyError instanceof Error ? replyError.message : String(replyError),
      });
    }
  }
}