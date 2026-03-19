/**
 * Daily token budget tracker and kill switch.
 *
 * Tracks cumulative token usage per day in state.json.
 * When the daily limit is reached, all LLM calls are refused
 * until the next calendar day (UTC).
 */

import { loadState, saveState } from "./state.js";
import { getMaxDailyTokens } from "./config.js";
import logger from "./logger.js";
import type { LLMClient, TokenUsage } from "./types.js";

export class BudgetExceededError extends Error {
  constructor(used: number, limit: number) {
    super(
      `Daily token budget exceeded: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens used. ` +
        `Resets at midnight UTC. Override with MAX_DAILY_TOKENS env var (0 to disable).`
    );
    this.name = "BudgetExceededError";
  }
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTokensUsedToday(): number {
  const state = loadState();
  const today = getTodayUTC();
  if (state.budget_date !== today) return 0;
  return (state.budget_tokens_used as number) ?? 0;
}

export function getTokensRemaining(): number {
  const limit = getMaxDailyTokens();
  if (limit <= 0) return Infinity;
  return Math.max(0, limit - getTokensUsedToday());
}

export function getBudgetStatus(): {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  date: string;
} {
  const used = getTokensUsedToday();
  const limit = getMaxDailyTokens();
  const remaining = getTokensRemaining();
  return {
    enabled: limit > 0,
    limit,
    used,
    remaining: limit <= 0 ? -1 : remaining,
    date: getTodayUTC(),
  };
}

export function recordUsage(usage: TokenUsage): void {
  const state = loadState();
  const today = getTodayUTC();

  if (state.budget_date !== today) {
    state.budget_date = today;
    state.budget_tokens_used = 0;
  }

  const total = usage.input_tokens + usage.output_tokens;
  state.budget_tokens_used = ((state.budget_tokens_used as number) ?? 0) + total;
  saveState(state);
}

function checkBudget(): void {
  const limit = getMaxDailyTokens();
  if (limit <= 0) return;
  const used = getTokensUsedToday();
  if (used >= limit) {
    throw new BudgetExceededError(used, limit);
  }
}

/**
 * Wraps an LLMClient with daily token budget enforcement.
 * Checks budget before each call, records usage after.
 * Returns the client unchanged if MAX_DAILY_TOKENS is 0 (disabled).
 */
export function withBudget(client: LLMClient): LLMClient {
  // Note: we check getMaxDailyTokens() at call time, not at wrap time,
  // so runtime config changes via applyPluginConfig() take effect immediately.
  return {
    async createMessage(params) {
      const limit = getMaxDailyTokens();
      if (limit <= 0) {
        // Budget disabled — still log usage for observability
        const result = await client.createMessage(params);
        if (result.usage) {
          const total = result.usage.input_tokens + result.usage.output_tokens;
          recordUsage(result.usage);
          logger.debug(
            `Token usage (budget disabled): ${total.toLocaleString()} tokens ` +
              `(in: ${result.usage.input_tokens.toLocaleString()}, out: ${result.usage.output_tokens.toLocaleString()}) — ` +
              `cumulative today: ${getTokensUsedToday().toLocaleString()}`
          );
          if (total > 50_000) {
            logger.warn(
              `High token usage detected: ${total.toLocaleString()} tokens in a single call ` +
                `(in: ${result.usage.input_tokens.toLocaleString()}, out: ${result.usage.output_tokens.toLocaleString()}). ` +
                `This may indicate reasoning model token inflation.`
            );
          }
        }
        return result;
      }

      // Budget enabled — enforce limits
      checkBudget();
      const result = await client.createMessage(params);
      if (result.usage) {
        recordUsage(result.usage);
        const remaining = getTokensRemaining();
        const total = result.usage.input_tokens + result.usage.output_tokens;
        logger.debug(
          `Token budget: ${total.toLocaleString()} tokens this call ` +
            `(in: ${result.usage.input_tokens.toLocaleString()}, out: ${result.usage.output_tokens.toLocaleString()}) — ` +
            `${remaining.toLocaleString()} remaining today`
        );
        if (total > 50_000) {
          logger.warn(
            `High token usage detected: ${total.toLocaleString()} tokens in a single call ` +
              `(in: ${result.usage.input_tokens.toLocaleString()}, out: ${result.usage.output_tokens.toLocaleString()}). ` +
              `This may indicate reasoning model token inflation.`
          );
        }
      } else {
        logger.debug("Token budget: no usage data returned from LLM call");
      }
      return result;
    },
  };
}
