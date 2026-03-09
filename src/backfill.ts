import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getDreamsDir,
  getNightmaresDir,
  getMoltbookEnabled,
  getMoltbookBackfillEnabled,
  AGENT_NAME,
} from "./config.js";
import { storeDeepMemory, registerDream, getDreamRemembrances } from "./memory.js";
import { loadState, saveState } from "./state.js";
import logger from "./logger.js";
import { MoltbookClient } from "./moltbook.js";

function parseFilename(filename: string): { date: string; title: string } | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.md$/);
  if (!match) return null;
  return { date: match[1], title: match[2].replace(/_/g, " ") };
}

export async function ensureBackfilled(): Promise<void> {
  const state = loadState();
  if (state.dreams_backfilled) {
    return;
  }

  logger.info("Starting initial dream remembrance backfill...");
  let backfillCount = 0;
  const existing = new Set(getDreamRemembrances().map((r) => r.filename));

  // 1. Backfill from local disk (Dreams)
  if (existsSync(getDreamsDir())) {
    const files = readdirSync(getDreamsDir()).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      if (existing.has(f)) continue;
      const parsed = parseFilename(f);
      if (!parsed) continue;

      const content = readFileSync(resolve(getDreamsDir(), f), "utf-8");
      const deepMemoryId = storeDeepMemory(
        { text_summary: parsed.title, markdown: content, isNightmare: false },
        "dream"
      );
      registerDream(f, parsed.title, parsed.date, {
        isNightmare: false,
        deepMemoryId,
      });
      existing.add(f);
      backfillCount++;
    }
  }

  // 2. Backfill from local disk (Nightmares)
  if (existsSync(getNightmaresDir())) {
    const files = readdirSync(getNightmaresDir()).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      if (existing.has(f)) continue;
      const parsed = parseFilename(f);
      if (!parsed) continue;

      const content = readFileSync(resolve(getNightmaresDir(), f), "utf-8");
      const deepMemoryId = storeDeepMemory(
        { text_summary: parsed.title, markdown: content, isNightmare: true },
        "nightmare"
      );
      registerDream(f, parsed.title, parsed.date, {
        isNightmare: true,
        deepMemoryId,
      });
      existing.add(f);
      backfillCount++;
    }
  }

  // 3. Backfill from Moltbook
  if (getMoltbookEnabled() && getMoltbookBackfillEnabled()) {
    try {
      const client = new MoltbookClient();
      logger.info("Fetching agent posts from Moltbook for backfill...");
      // In MoltbookClient, getFeed might not allow filtering by author directly in the query,
      // or we can fetch a specific submolt. Let's fetch /posts?submolt=dreams.
      // Wait, we can fetch all posts and filter. Or search? We can fetch agent's own feed or profile?
      // Since we don't have a getMyPosts, let's just use status or getFeed.
      // Let's check moltbook feed:
      const feed = await client.getFeed("new", 50);
      const posts = (feed.posts || []) as Array<{
        id: string;
        title: string;
        content: string;
        author: string;
        created_at?: string;
      }>;

      for (const post of posts) {
        if (post.author !== AGENT_NAME) continue;

        // Try to derive a filename to see if we already have it.
        // title might be "Morning Reflection: The_Room_That_Remembers_Itself"
        const cleanTitle = post.title.replace(/^Morning Reflection:\s*/i, "").trim();
        const dateStr = post.created_at
          ? post.created_at.slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        // The slug usually replaces spaces with underscores
        const slug = cleanTitle.replace(/ /g, "_");
        const filename = `${dateStr}_${slug}.md`;

        if (existing.has(filename)) continue;

        const deepMemoryId = storeDeepMemory(
          {
            text_summary: cleanTitle,
            markdown: post.content,
            isNightmare: false,
            moltbookId: post.id,
          },
          "dream"
        );
        registerDream(filename, cleanTitle, dateStr, {
          isNightmare: false,
          deepMemoryId,
        });
        existing.add(filename);
        backfillCount++;
      }
    } catch (e) {
      logger.warn(`Failed to backfill from Moltbook: ${e}`);
    }
  }

  logger.info(`Dream backfill complete. Recovered ${backfillCount} dreams.`);
  state.dreams_backfilled = true;
  saveState(state);
}
