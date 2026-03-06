/**
 * ElectricSheep CLI.
 *
 * Provides utility commands for inspecting agent state.
 * Core agent behavior (check, dream, journal) runs via OpenClaw.
 *
 * Usage:
 *   electricsheep register --name "Name" --description "Bio"
 *   electricsheep status       # show agent status and memory stats
 *   electricsheep dreams       # list saved dream journals
 */

import { Command } from "commander";
import chalk from "chalk";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setVerbose } from "./logger.js";
import { DREAMS_DIR } from "./config.js";
import type { AgentState, DeepMemoryStats } from "./types.js";

/**
 * Register all ElectricSheep subcommands onto a parent Command.
 * Used both by the standalone bin and by api.registerCli().
 */
export function registerCommands(parent: Command): void {
  parent
    .option("-v, --verbose", "Enable verbose logging")
    .hook("preAction", (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.verbose) setVerbose(true);
    });

  parent
    .command("register")
    .description("Register a new agent on Moltbook")
    .requiredOption("--name <name>", "Agent name on Moltbook")
    .requiredOption("--description <desc>", "Agent description")
    .action(async (opts: { name: string; description: string }) => {
      const { MoltbookClient } = await import("./moltbook.js");
      const client = new MoltbookClient();
      const result = await client.register(opts.name, opts.description);

      const agent = (result.agent ?? result) as Record<string, string>;
      console.log(chalk.green.bold("\nRegistered!\n"));
      console.log(`${chalk.bold("API Key:")} ${agent.api_key ?? "?"}`);
      console.log(`${chalk.bold("Claim URL:")} ${agent.claim_url ?? "?"}`);
      console.log(`${chalk.bold("Verification:")} ${agent.verification_code ?? "?"}`);
      console.log(
        chalk.yellow("\nYour API key has been saved to credentials.json automatically")
      );
      console.log(chalk.yellow("Visit the claim URL and post the verification tweet"));
    });

  parent
    .command("status")
    .description("Show agent status, memory stats, and recent state")
    .action(async () => {
      const { deepMemoryStats } = await import("./memory.js");
      const { loadState } = await import("./state.js");
      const { MoltbookClient } = await import("./moltbook.js");
      const { getBudgetStatus } = await import("./budget.js");

      const state: AgentState = loadState();
      const memStats: DeepMemoryStats = deepMemoryStats();
      const budget = getBudgetStatus();

      console.log(chalk.cyan.bold("\nElectricSheep Status\n"));

      // Token budget
      if (budget.enabled) {
        const pct = Math.round((budget.used / budget.limit) * 100);
        const color = pct >= 90 ? chalk.red : pct >= 70 ? chalk.yellow : chalk.green;
        console.log(chalk.bold("Token Budget:"));
        console.log(
          `  ${color(`${budget.used.toLocaleString()} / ${budget.limit.toLocaleString()} tokens (${pct}%)`)}` +
            `  ${chalk.dim(`remaining: ${budget.remaining.toLocaleString()}`)}`
        );
        console.log(`  ${chalk.dim(`date: ${budget.date} UTC`)}`);
      } else {
        console.log(chalk.bold("Token Budget:") + chalk.dim(" disabled"));
      }

      // State
      console.log(`\n${chalk.bold("Agent State:")}`);
      for (const [k, v] of Object.entries(state)) {
        if (k.startsWith("budget_")) continue;
        console.log(`  ${chalk.bold(k)}: ${String(v)}`);
      }

      // Memory stats
      console.log(
        `${chalk.bold("Deep Memory:")} ${memStats.total_memories} total, ${memStats.undreamed} undreamed`
      );
      if (Object.keys(memStats.categories).length > 0) {
        console.log(
          `${chalk.bold("Categories:")} ${JSON.stringify(memStats.categories)}`
        );
      }

      // Moltbook status
      try {
        const client = new MoltbookClient();
        const moltbookStatus = await client.status();
        console.log(
          `\n${chalk.bold("Moltbook:")} ${(moltbookStatus as Record<string, unknown>).status ?? "?"}`
        );
        const profile = await client.me();
        const agent = (profile.agent ?? profile) as Record<string, unknown>;
        console.log(`${chalk.bold("Karma:")} ${agent.karma ?? 0}`);
      } catch {
        console.log(chalk.yellow("\nMoltbook: not connected"));
      }
    });

  parent
    .command("dreams")
    .description("List saved dream journals")
    .action(() => {
      let dreamFiles: string[];
      try {
        dreamFiles = readdirSync(DREAMS_DIR)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse();
      } catch {
        dreamFiles = [];
      }

      if (dreamFiles.length === 0) {
        console.log(
          chalk.dim(
            "No dreams yet. The dream cycle runs automatically via OpenClaw cron."
          )
        );
        return;
      }

      console.log(chalk.magenta.bold(`\nDream Archive (${dreamFiles.length} dreams)\n`));

      for (const f of dreamFiles.slice(0, 20)) {
        const content = readFileSync(resolve(DREAMS_DIR, f), "utf-8");
        const firstLine = content.split("\n")[0].replace(/^#\s*/, "");
        const stem = f.replace(/\.md$/, "").slice(0, 10);
        console.log(`  ${chalk.dim(stem)} ${firstLine}`);
      }
    });

  parent
    .command("reflect")
    .description("Manually trigger the reflection and synthesis cycle")
    .action(async () => {
      console.log(chalk.cyan.bold("\nTriggering reflection cycle...\n"));
      const { runReflectionCycle } = await import("./waking.js");
      const { withBudget } = await import("./budget.js");
      const { AGENT_MODEL } = await import("./config.js");

      // Resolve API key: read OpenClaw's auth-profiles.json directly, then fallback to env
      let apiKey: string | undefined;
      try {
        const { readFileSync } = await import("fs");
        const { join } = await import("path");
        const { homedir } = await import("os");

        // Search common auth-profiles.json locations
        const candidates = [
          join(homedir(), ".openclaw", "agents", "main", "agent", "auth-profiles.json"),
          join(homedir(), ".openclaw", "agents", "default", "auth-profiles.json"),
          join(homedir(), ".openclaw", "auth-profiles.json"),
        ];

        for (const path of candidates) {
          try {
            const raw = JSON.parse(readFileSync(path, "utf-8"));
            const profiles = raw.profiles || {};
            // Find any anthropic profile with a key or token
            for (const profile of Object.values(profiles) as any[]) {
              if (profile.provider === "anthropic") {
                apiKey = profile.key || profile.token || profile.apiKey;
                if (apiKey) break;
              }
            }
            if (apiKey) break;
          } catch {
            // try next candidate
          }
        }
      } catch {
        // ignore file read errors
      }

      // Fallback to env var
      if (!apiKey) {
        apiKey = process.env.ANTHROPIC_API_KEY;
      }

      if (!apiKey) {
        console.error(
          chalk.red(
            "No Anthropic API key found. Set ANTHROPIC_API_KEY or configure via openclaw."
          )
        );
        process.exit(1);
      }

      // Create a lightweight LLM client using direct Anthropic API calls
      const directClient = withBudget({
        async createMessage(params) {
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey!,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: params.model || AGENT_MODEL,
              max_tokens: params.maxTokens,
              system: params.system,
              messages: params.messages,
            }),
          });
          if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`Anthropic API error ${resp.status}: ${body}`);
          }
          const data = (await resp.json()) as any;
          const text =
            data.content?.[0]?.text ??
            data.content?.map((c: any) => c.text).join("") ??
            "";
          return {
            text,
            usage: data.usage
              ? {
                  input_tokens: data.usage.input_tokens ?? 0,
                  output_tokens: data.usage.output_tokens ?? 0,
                }
              : undefined,
          };
        },
      });

      // Build a minimal API object for the reflection cycle
      const minimalApi = {
        registerTool: () => {},
        registerCli: () => {},
        registerHook: () => {},
        registerService: () => {},
        registerGatewayMethod: () => {},
        runtime: { subagent: {} } as any,
        memory: undefined,
        logger: {
          info: (msg: string) => console.log(chalk.dim(msg)),
          warn: (msg: string) => console.log(chalk.yellow(msg)),
          error: (msg: string) => console.error(chalk.red(msg)),
        },
      };

      try {
        await runReflectionCycle(directClient, minimalApi as any);
        console.log(chalk.green.bold("\nReflection cycle complete.\n"));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\nReflection failed: ${msg}\n`));
        process.exit(1);
      }
    });
} // end registerCommands

// Standalone bin entry point
export const program = new Command();
program.name("electricsheep").description("ElectricSheep — an AI agent that dreams.");
registerCommands(program);
