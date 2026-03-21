/**
 * Structured instrumentation for the dream cycle.
 *
 * Collects phase timings and LLM call metadata so failures
 * can be diagnosed from the log without guesswork.
 */

import { randomUUID } from "node:crypto";
import logger from "./logger.js";
import type { TokenUsage } from "./types.js";

export interface LLMCallRecord {
  phase: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export interface PhaseRecord {
  phase: string;
  status: "ok" | "error" | "skipped";
  duration_ms: number;
  error?: string;
  llm_calls: LLMCallRecord[];
  metadata?: Record<string, unknown>;
}

export interface DreamCycleTrace {
  run_id: string;
  started_at: string;
  ended_at: string;
  total_duration_ms: number;
  phases: PhaseRecord[];
  total_llm_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

/**
 * Lightweight tracer for a single dream cycle run.
 *
 * Usage:
 *   const tracer = new DreamTracer();
 *   tracer.startPhase("load_state");
 *   // ... do work ...
 *   tracer.endPhase("load_state");
 *
 *   // For LLM calls:
 *   tracer.startPhase("generate_dream:first_pass");
 *   const result = await callWithRetry(...);
 *   tracer.recordLLMCall("generate_dream:first_pass", model, result.usage, startTime);
 *   tracer.endPhase("generate_dream:first_pass");
 *
 *   tracer.finish(); // logs the full trace
 */
export class DreamTracer {
  readonly runId: string;
  private readonly startedAt: Date;
  private readonly phases: PhaseRecord[] = [];
  private readonly activePhases = new Map<
    string,
    { start: number; llm_calls: LLMCallRecord[] }
  >();

  constructor(runId?: string) {
    this.runId = runId ?? randomUUID();
    this.startedAt = new Date();
    logger.info(`[trace:${this.runId}] Dream cycle instrumentation started`);
  }

  startPhase(phase: string): void {
    this.activePhases.set(phase, { start: performance.now(), llm_calls: [] });
    logger.debug(`[trace:${this.runId}] phase:${phase} started`);
  }

  recordLLMCall(
    phase: string,
    model: string,
    usage: TokenUsage | undefined,
    startTime: number
  ): void {
    const duration_ms = Math.round(performance.now() - startTime);
    const record: LLMCallRecord = {
      phase,
      model,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      duration_ms,
    };

    const active = this.activePhases.get(phase);
    if (active) {
      active.llm_calls.push(record);
    }

    logger.info(
      `[trace:${this.runId}] llm_call phase=${phase} model=${model} ` +
        `in=${record.input_tokens} out=${record.output_tokens} dur=${duration_ms}ms`
    );
  }

  endPhase(
    phase: string,
    opts?: {
      status?: "ok" | "error" | "skipped";
      error?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const active = this.activePhases.get(phase);
    const duration_ms = active ? Math.round(performance.now() - active.start) : 0;
    const status = opts?.status ?? "ok";

    this.phases.push({
      phase,
      status,
      duration_ms,
      error: opts?.error,
      llm_calls: active?.llm_calls ?? [],
      metadata: opts?.metadata,
    });

    this.activePhases.delete(phase);
    logger.debug(
      `[trace:${this.runId}] phase:${phase} ended status=${status} dur=${duration_ms}ms`
    );
  }

  skipPhase(phase: string, reason?: string): void {
    this.phases.push({
      phase,
      status: "skipped",
      duration_ms: 0,
      llm_calls: [],
      metadata: reason ? { reason } : undefined,
    });
    logger.debug(
      `[trace:${this.runId}] phase:${phase} skipped${reason ? `: ${reason}` : ""}`
    );
  }

  finish(): DreamCycleTrace {
    const ended = new Date();
    const total_duration_ms = ended.getTime() - this.startedAt.getTime();

    let total_llm_calls = 0;
    let total_input_tokens = 0;
    let total_output_tokens = 0;
    for (const p of this.phases) {
      for (const c of p.llm_calls) {
        total_llm_calls++;
        total_input_tokens += c.input_tokens;
        total_output_tokens += c.output_tokens;
      }
    }

    const trace: DreamCycleTrace = {
      run_id: this.runId,
      started_at: this.startedAt.toISOString(),
      ended_at: ended.toISOString(),
      total_duration_ms,
      phases: this.phases,
      total_llm_calls,
      total_input_tokens,
      total_output_tokens,
    };

    logger.info(
      `[trace:${this.runId}] Dream cycle complete: ` +
        `${total_duration_ms}ms, ${this.phases.length} phases, ` +
        `${total_llm_calls} LLM calls, ` +
        `${total_input_tokens} in / ${total_output_tokens} out tokens`
    );
    logger.debug(`[trace:${this.runId}] full_trace=${JSON.stringify(trace)}`);

    return trace;
  }
}
