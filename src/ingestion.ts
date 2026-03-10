/**
 * Community ingestion module.
 *
 * Fetches recent posts from configured Moltbook submolts to inject
 * external perspectives into the reflection context window.
 */

import { MoltbookClient } from "./moltbook.js";
import {
  AGENT_NAME,
  CONTENT_PREVIEW_LENGTH,
  getCommunityIngestionEnabled,
  getCommunityIngestionSubmolts,
  getCommunityIngestionLimit,
} from "./config.js";
import logger from "./logger.js";
import type { CommunityPost, MoltbookPost } from "./types.js";

/**
 * Fetch recent community posts from configured submolts.
 *
 * - Filters out posts by the agent's own identity
 * - Deduplicates by post id
 * - Returns sorted by created_at descending
 * - Never throws — returns empty array on error
 */
export async function fetchCommunityPosts(
  submolts?: string[],
  limit?: number
): Promise<CommunityPost[]> {
  if (!getCommunityIngestionEnabled()) {
    return [];
  }

  const targetSubmolts = submolts ?? getCommunityIngestionSubmolts();
  const perSubmoltLimit = limit ?? getCommunityIngestionLimit();

  const client = new MoltbookClient();
  const seen = new Set<string>();
  const posts: CommunityPost[] = [];

  for (const submolt of targetSubmolts) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      let response: Record<string, unknown>;
      try {
        response = await client.getFeed("new", perSubmoltLimit);
      } finally {
        clearTimeout(timeout);
      }

      const rawPosts = extractPosts(response, submolt);

      for (const post of rawPosts) {
        // Filter out own posts
        if (post.author.toLowerCase() === AGENT_NAME.toLowerCase()) {
          continue;
        }
        // Deduplicate
        if (seen.has(post.id)) {
          continue;
        }
        seen.add(post.id);
        posts.push(post);
      }
    } catch (error) {
      logger.warn(`Community ingestion failed for submolt "${submolt}": ${error}`);
    }
  }

  // Sort by created_at descending
  posts.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return posts;
}

/**
 * Extract CommunityPost[] from a Moltbook feed response.
 */
function extractPosts(
  response: Record<string, unknown>,
  submolt: string
): CommunityPost[] {
  const rawPosts =
    (response.posts as MoltbookPost[]) ??
    (response.results as MoltbookPost[]) ??
    (response.data as MoltbookPost[]) ??
    [];

  if (!Array.isArray(rawPosts)) {
    return [];
  }

  return rawPosts
    .filter(
      (p): p is MoltbookPost =>
        typeof p === "object" && p !== null && typeof p.id === "string"
    )
    .map((p) => ({
      id: p.id,
      submolt: (p.submolt as string) || submolt,
      author: p.author || "unknown",
      content: typeof p.content === "string" ? p.content : "",
      created_at:
        typeof (p as Record<string, unknown>).created_at === "string"
          ? ((p as Record<string, unknown>).created_at as string)
          : new Date().toISOString(),
    }));
}

/**
 * Format community posts into a context block for injection into the reflection prompt.
 * Returns empty string if no posts.
 */
export function formatCommunityContext(posts: CommunityPost[]): string {
  if (posts.length === 0) {
    return "";
  }

  const lines = posts.map((p) => {
    const excerpt =
      p.content.length > CONTENT_PREVIEW_LENGTH
        ? p.content.slice(0, CONTENT_PREVIEW_LENGTH) + "..."
        : p.content;
    return `[submolt: ${p.submolt}] @${p.author} — "${excerpt}"`;
  });

  return (
    `COMMUNITY CONTEXT: Recent posts from the broader community (external perspectives to enrich your reflection):\n\n` +
    lines.join("\n") +
    `\n\nDraw on these external perspectives where relevant. You are not obligated to reference them directly.`
  );
}
