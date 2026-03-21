import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = mkdtempSync(join(tmpdir(), "es-instr-test-"));
process.env.OPENCLAWDREAMS_DATA_DIR = testDir;

const { DreamTracer } = await import("../src/instrumentation.js");

describe("DreamTracer", () => {
  it("generates a run_id", () => {
    const tracer = new DreamTracer();
    assert.ok(tracer.runId);
    assert.ok(tracer.runId.length > 0);
    tracer.finish();
  });

  it("accepts a custom run_id", () => {
    const tracer = new DreamTracer("custom-123");
    assert.equal(tracer.runId, "custom-123");
    tracer.finish();
  });

  it("records phases with timing", () => {
    const tracer = new DreamTracer();
    tracer.startPhase("test_phase");
    tracer.endPhase("test_phase");
    const trace = tracer.finish();

    assert.equal(trace.phases.length, 1);
    assert.equal(trace.phases[0].phase, "test_phase");
    assert.equal(trace.phases[0].status, "ok");
    assert.ok(trace.phases[0].duration_ms >= 0);
  });

  it("records skipped phases", () => {
    const tracer = new DreamTracer();
    tracer.skipPhase("optional_phase", "not needed");
    const trace = tracer.finish();

    assert.equal(trace.phases.length, 1);
    assert.equal(trace.phases[0].status, "skipped");
    assert.equal(trace.phases[0].duration_ms, 0);
    assert.deepEqual(trace.phases[0].metadata, { reason: "not needed" });
  });

  it("records error phases", () => {
    const tracer = new DreamTracer();
    tracer.startPhase("failing");
    tracer.endPhase("failing", { status: "error", error: "boom" });
    const trace = tracer.finish();

    assert.equal(trace.phases[0].status, "error");
    assert.equal(trace.phases[0].error, "boom");
  });

  it("records LLM calls with token counts", () => {
    const tracer = new DreamTracer();
    tracer.startPhase("gen");
    const start = performance.now();
    tracer.recordLLMCall(
      "gen",
      "claude-sonnet-4-5-20250929",
      { input_tokens: 100, output_tokens: 50 },
      start
    );
    tracer.endPhase("gen");
    const trace = tracer.finish();

    assert.equal(trace.total_llm_calls, 1);
    assert.equal(trace.total_input_tokens, 100);
    assert.equal(trace.total_output_tokens, 50);
    assert.equal(trace.phases[0].llm_calls.length, 1);
    assert.equal(trace.phases[0].llm_calls[0].model, "claude-sonnet-4-5-20250929");
  });

  it("handles undefined usage gracefully", () => {
    const tracer = new DreamTracer();
    tracer.startPhase("gen");
    tracer.recordLLMCall("gen", "model", undefined, performance.now());
    tracer.endPhase("gen");
    const trace = tracer.finish();

    assert.equal(trace.total_input_tokens, 0);
    assert.equal(trace.total_output_tokens, 0);
  });

  it("aggregates totals across multiple phases", () => {
    const tracer = new DreamTracer();

    tracer.startPhase("a");
    tracer.recordLLMCall(
      "a",
      "m",
      { input_tokens: 100, output_tokens: 200 },
      performance.now()
    );
    tracer.endPhase("a");

    tracer.startPhase("b");
    tracer.recordLLMCall(
      "b",
      "m",
      { input_tokens: 300, output_tokens: 400 },
      performance.now()
    );
    tracer.endPhase("b");

    const trace = tracer.finish();
    assert.equal(trace.total_llm_calls, 2);
    assert.equal(trace.total_input_tokens, 400);
    assert.equal(trace.total_output_tokens, 600);
    assert.equal(trace.phases.length, 2);
  });

  it("includes timestamps and duration in trace", () => {
    const tracer = new DreamTracer();
    tracer.startPhase("x");
    tracer.endPhase("x");
    const trace = tracer.finish();

    assert.ok(trace.started_at);
    assert.ok(trace.ended_at);
    assert.ok(trace.total_duration_ms >= 0);
    assert.ok(trace.run_id);
  });

  it("records phase metadata", () => {
    const tracer = new DreamTracer();
    tracer.startPhase("load");
    tracer.endPhase("load", { metadata: { count: 42 } });
    const trace = tracer.finish();

    assert.deepEqual(trace.phases[0].metadata, { count: 42 });
  });
});
