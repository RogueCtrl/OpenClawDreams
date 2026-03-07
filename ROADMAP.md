# OpenClawDreams — Roadmap

This document tracks the planned evolution of OpenClawDreams. Items are loosely ordered by priority; nothing here is a commitment, and the list will shift as the project matures.

## Status key

- ✅ Shipped
- 🔄 In progress
- 🗓 Planned
- 💭 Exploring

---

## v1.x — Consolidation

### ✅ Core reflection & dream cycle
Daytime reflection (8am/12pm/4pm/8pm) + nighttime dream (2am) + morning journal. AES-256 encrypted memory store. OpenClaw persistent memory integration. Moltbook posting.

### ✅ Token budget kill-switch
Daily token ceiling with environment-variable override. Prevents runaway API spend.

### ✅ Post content filter
LLM-based outbound filter strips private operator context, system internals, and sensitive material before Moltbook publication. Customizable via `Moltbook-filter.md`.

### 🗓 Configurable reflection schedule
Allow operators to set custom reflection times rather than the hardcoded 8/12/4/8 defaults. Useful for agents running in non-standard timezones or with specific workday patterns.

### 🗓 Graceful daemon recovery
Currently, if the OpenClaw daemon crashes mid-cycle, the scheduled reflection/dream is silently lost. Add a startup recovery pass that checks whether a scheduled cycle was missed and runs it on next daemon start.

### 🗓 Dry-run mode
`openclaw openclawdreams reflect --dry-run` — run the full pipeline but print synthesized output instead of encrypting it. Useful for debugging synthesis quality without touching the memory store.

---

## v2.0 — Multi-modal Memory

> **The structural problem:** The current pipeline processes text logs only. Visual artifacts — screenshots, UI state snapshots, image-based interactions, diagram iterations — are silently dropped before synthesis begins. The dream cycle is only as rich as the data it can parse.

This is the primary focus of the next major release.

### 🗓 Visual artifact capture (screenshot hook)
Extend the `agent_end` hook to optionally capture a screenshot or UI snapshot at session end. Configurable capture triggers: session end, on-demand via tool call, or at fixed intervals during a session.

No third-party service required. Capture is local — images are stored in `data/vision/` alongside the encrypted memory store and never leave the machine unless synthesis explicitly processes them.

**Config:**
```json5
visionEnabled: true,
visionCaptureOnSessionEnd: true,  // screenshot at agent_end hook
```

### 🗓 Vision pre-processing pipeline
Before synthesis runs, pass captured images through a vision model (Claude 3 Sonnet/Opus vision is already available via the existing API key). Convert visual artifacts into structured text descriptions that feed directly into the day log.

The pipeline:
```
Image capture → Vision model → Structured description → Day log entry → Reflection synthesis
```

Descriptions are stored as part of the encrypted memory entry alongside the text summary, so the dream cycle sees a unified record: *what happened* (text) + *what it looked like* (structured visual context).

### 🗓 Rich day log format
Move the internal memory entry format from a flat text summary to a structured record with typed fields:

```ts
interface MemoryEntry {
  text_summary: string;
  visual_descriptions?: VisualDescription[];  // from vision pre-processing
  file_diffs?: FileDiff[];                    // changed files in workspace
  tool_calls?: ToolCallSummary[];             // notable tool invocations
  topics?: string[];                          // extracted topics
  timestamp: number;
}
```

This richer format propagates through reflection and into the dream cycle, giving synthesis more signal to work with.

### 🗓 Workspace diff context
At `agent_end`, capture a diff summary of files changed in the workspace during the session. Store as structured context alongside the text summary. The reflection cycle can then surface "what actually changed" rather than only "what was discussed."

### 💭 Audio/voice session context
For agents running on voice-enabled channels, capture session transcripts (already text) and optionally audio duration/sentiment markers. Low priority — most of this is covered by the text pipeline — but worth flagging for voice-primary setups.

---

## v3.0 — Synthesis Quality

### 🗓 Feedback loop: dream rating
After delivering a dream notification, prompt the operator for a simple rating (1–5, thumbs/thumbs-down). Feed ratings back into the synthesis prompt as few-shot examples. Over time, the dream style converges toward what the operator finds useful or interesting.

### 🗓 Topic continuity tracking
Currently each reflection cycle is independent. Add a topic graph that tracks which themes recur across multiple cycles and days. The dream cycle can then weight recurring themes more heavily — the things that keep surfacing are probably the things worth dreaming about.

### 🗓 Configurable synthesis personas
Allow operators to define multiple synthesis modes (e.g., `architect` — structural/analytical, `poet` — surreal/associative, `critic` — adversarial/questioning) and rotate or select them per cycle. Adds texture to dream output that might otherwise converge on a single style.

### 💭 Cross-agent dream merging
Structured format for two agents (with mutual consent from their operators) to share synthesis outputs and co-dream — finding intersections in their respective day logs. Designed as an opt-in, locally-initiated protocol with no central coordination required.

---

## Backlog / No ETA

- **Standalone mode** — run without an active OpenClaw daemon (e.g., triggered by system cron directly)
- **Multiple encryption keys** — support key rotation without losing access to historical memories
- **Dream search** — query across all saved dream journals for recurring themes or specific content
- **Memory pruning controls** — configurable retention windows; automatic archiving of old entries beyond a threshold
- **Web UI for dream journal** — read-only local browser view of dream output and reflection history

---

## Not planned

- **Hosted / cloud sync** — OpenClawDreams is deliberately local-first. The encryption model assumes you control the key and the disk. Cloud sync would require a trust model we're not ready to design properly.
- **Cross-provider memory bridging** — OpenClawDreams binds to OpenClaw's hook system. Supporting other agent frameworks would require a separate abstraction layer that isn't in scope.

---

*Last updated: March 2026*
*To suggest additions or changes, open an issue or discussion on GitHub.*
