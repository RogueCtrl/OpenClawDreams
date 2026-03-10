/**
 * Operator notification module.
 *
 * Sends notifications to the operator via OpenClaw system events
 * when dreams are generated.
 */

import { getNotifyOperatorOnDream } from "./config.js";
import { callWithRetry, WAKING_RETRY_OPTS } from "./llm.js";
import { DREAM_NOTIFICATION_PROMPT, renderTemplate } from "./persona.js";
import { getAgentIdentityBlock } from "./identity.js";
import logger from "./logger.js";
import type { LLMClient, OpenClawAPI, Dream } from "./types.js";

/** Session key used for system events originating from OpenClawDreams. */
const SYSTEM_EVENT_SESSION_KEY = "openclawdreams";

/**
 * Generate a conversational message to notify the operator about a dream.
 *
 * Uses LLM to craft a message in the agent's voice that invites the
 * operator to discuss the dream.
 */
async function generateDreamNotification(
  client: LLMClient,
  dream: Dream
): Promise<string> {
  // Extract a brief excerpt from the dream for context
  const dreamExcerpt = dream.markdown.slice(0, 500);

  const system = renderTemplate(DREAM_NOTIFICATION_PROMPT, {
    agent_identity: getAgentIdentityBlock(),
  });

  try {
    const { text } = await callWithRetry(
      client,
      {
        maxTokens: 300,
        system,
        messages: [
          {
            role: "user",
            content:
              `I had this dream last night:\n\n${dreamExcerpt}${dream.markdown.length > 500 ? "..." : ""}\n\n` +
              `Write a brief, conversational message to my operator letting them know I had a dream ` +
              `and inviting them to talk about it. Keep it natural and in my voice.`,
          },
        ],
      },
      WAKING_RETRY_OPTS
    );

    return text.trim();
  } catch (error) {
    logger.error(`Failed to generate dream notification: ${error}`);
    // Fallback to a simple message
    return "I had an interesting dream last night. Would you like to hear about it?";
  }
}

/**
 * Notify the operator about a dream via OpenClaw system events.
 *
 * Returns true if notification was enqueued successfully, false otherwise.
 */
export async function notifyOperatorOfDream(
  client: LLMClient,
  api: OpenClawAPI,
  dream: Dream,
  title: string,
  insight: string | null
): Promise<boolean> {
  if (!getNotifyOperatorOnDream()) {
    logger.debug("Dream notifications disabled by configuration");
    return false;
  }

  // Generate the notification message
  const message = await generateDreamNotification(client, dream);

  try {
    api.runtime.system.enqueueSystemEvent(message, {
      sessionKey: SYSTEM_EVENT_SESSION_KEY,
    });
    logger.info(`Enqueued dream notification as system event: ${title}`);
    return true;
  } catch (error) {
    logger.warn(
      `Failed to enqueue system event, logging as fallback: ${error}\n` +
        `Title: ${title}\nInsight: ${insight || "No insight"}\nMessage: ${message}`
    );
    return false;
  }
}
