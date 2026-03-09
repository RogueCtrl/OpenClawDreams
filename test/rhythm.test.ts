import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = mkdtempSync(join(tmpdir(), "es-rhythm-test-"));
process.env.OPENCLAWDREAMS_DATA_DIR = testDir;

const { generateRhythmReport, formatReportNotification } =
  await import("../src/rhythm.js");
const { closeLogger } = await import("../src/logger.js");
const { saveState } = await import("../src/state.js");

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("Cognitive Rhythm Report", () => {
  it("returns correct period (7 days back)", () => {
    const report = generateRhythmReport(testDir);
    assert.equal(report.period_end, todayStr());
    assert.equal(report.period_start, daysAgoStr(7));
  });

  it("returns zeroed report with no dream files and tone_trajectory unknown", () => {
    const report = generateRhythmReport(testDir);
    assert.equal(report.total_dreams, 0);
    assert.equal(report.total_nightmares, 0);
    assert.equal(report.tone_trajectory, "unknown");
    assert.equal(report.insight_density, 0);
    assert.deepEqual(report.dominant_themes, []);
  });

  it("counts dream files correctly", () => {
    const dreamsDir = join(testDir, "data", "dreams");
    mkdirSync(dreamsDir, { recursive: true });

    const today = todayStr();
    writeFileSync(
      join(dreamsDir, `${today}_test-dream.md`),
      "# A Dream\nFloating through clouds of memory and light."
    );
    writeFileSync(
      join(dreamsDir, `${today}_another-dream.md`),
      "# Another Dream\nWalking through fields of golden wheat."
    );
    // Old dream outside window
    writeFileSync(
      join(dreamsDir, "2020-01-01_old-dream.md"),
      "# Old Dream\nAncient memory."
    );

    const report = generateRhythmReport(testDir);
    assert.equal(report.total_dreams, 2);
  });

  it("returns top 5 dominant themes (or fewer if less data)", () => {
    const report = generateRhythmReport(testDir);
    assert.ok(report.dominant_themes.length <= 5);
    assert.ok(report.dominant_themes.length > 0);
  });

  it("calculates insight_density correctly", () => {
    const report = generateRhythmReport(testDir);
    assert.ok(report.insight_density > 0);
    assert.equal(typeof report.insight_density, "number");
  });

  it("returns stable tone_trajectory with only one dream file", () => {
    // Clean up extra dream
    const dreamsDir = join(testDir, "data", "dreams");
    const today = todayStr();
    rmSync(join(dreamsDir, `${today}_another-dream.md`), { force: true });

    const report = generateRhythmReport(testDir);
    // With only 1 dream content, not enough data for trajectory
    assert.equal(report.tone_trajectory, "unknown");
  });

  it("counts nightmare files correctly", () => {
    const nightmaresDir = join(testDir, "data", "nightmares");
    mkdirSync(nightmaresDir, { recursive: true });

    const yesterday = daysAgoStr(1);
    writeFileSync(
      join(nightmaresDir, `${yesterday}_scary.md`),
      "# Nightmare\nDark shadows creeping through the corridors."
    );

    const report = generateRhythmReport(testDir);
    assert.equal(report.total_nightmares, 1);
  });

  it("reads entropy_reprompts and meta_loop_depth from state", () => {
    saveState({
      entropy_reprompt_count: 3,
      meta_loop_depth: 2,
      checks_today: 5,
    } as Record<string, unknown>);

    const report = generateRhythmReport(testDir);
    assert.equal(report.entropy_reprompts, 3);
    assert.equal(report.meta_loop_depth_peak, 2);
    assert.equal(report.total_reflections, 5);
  });

  it("notification string contains all expected fields", () => {
    const report = generateRhythmReport(testDir);
    const notification = formatReportNotification(report);

    assert.ok(notification.includes("Weekly Rhythm Report"));
    assert.ok(notification.includes(report.period_start));
    assert.ok(notification.includes(report.period_end));
    assert.ok(notification.includes(`Dreams: ${report.total_dreams}`));
    assert.ok(notification.includes(`Nightmares: ${report.total_nightmares}`));
    assert.ok(notification.includes("Dominant themes:"));
    assert.ok(notification.includes(`Tone: ${report.tone_trajectory}`));
    assert.ok(notification.includes(`Insight density: ${report.insight_density}`));
    assert.ok(notification.includes(`Entropy re-prompts: ${report.entropy_reprompts}`));
    assert.ok(notification.includes(`Meta-loop depth: ${report.meta_loop_depth_peak}`));
    assert.ok(notification.includes(report.raw_summary));
  });
});

after(async () => {
  await closeLogger();
  rmSync(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});
