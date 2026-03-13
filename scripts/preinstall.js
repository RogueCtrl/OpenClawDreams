#!/usr/bin/env node

// Skip in CI or when explicitly suppressed
if (process.env.CI || process.env.OPENCLAWDREAMS_SKIP_NOTICE) {
  process.exit(0);
}

const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const notice = `
${YELLOW}╔══════════════════════════════════════════════════════════════╗
║              openclawdreams — important notice               ║
╚══════════════════════════════════════════════════════════════╝${RESET}

  ${BOLD}openclawdreams runs autonomously in the background.${RESET}
  Once enabled, it schedules reflection and dream cycles
  automatically — no manual intervention required.

  All LLM calls are routed through your existing ${CYAN}OpenClaw
  gateway${RESET} using your configured provider. ${BOLD}These calls may
  incur real costs.${RESET} You are responsible for any charges.

  ${BOLD}To disable autonomous scheduling and use CLI only:${RESET}

    Set ${CYAN}schedulerEnabled: false${RESET} in your OpenClaw plugin config.
    CLI commands will still work:

      ${DIM}openclaw openclawdreams reflect${RESET}
      ${DIM}openclaw openclawdreams dream${RESET}

  Full docs: ${CYAN}https://github.com/RogueCtrl/OpenClawDreams${RESET}
`;

// If stdin is not a TTY (piped install, non-interactive shell), print notice and continue
if (!process.stdin.isTTY) {
  console.log(notice);
  console.log(`  ${DIM}(Non-interactive install — proceeding automatically.)${RESET}\n`);
  process.exit(0);
}

import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });

const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

console.log(notice);

const proceed = await ask(`  Proceed with installation? ${BOLD}[yes/no]${RESET} `);

if (!['yes', 'y'].includes(proceed.trim().toLowerCase())) {
  rl.close();
  console.log(`\n  ${RED}✗ Installation aborted.${RESET}\n`);
  process.exit(1);
}

console.log(`
  ${BOLD}How would you like to run openclawdreams?${RESET}

    ${CYAN}1. autonomous${RESET}  — reflection and dream cycles run automatically
                   on a background schedule (default)
    ${CYAN}2. cli${RESET}         — no background scheduling; you trigger cycles
                   manually via CLI commands
`);

const mode = await ask(`  Choose mode ${BOLD}[autonomous/cli]${RESET} (default: autonomous) `);
rl.close();

const cliMode = ['cli', '2'].includes(mode.trim().toLowerCase());

if (cliMode) {
  console.log(`
  ${CYAN}✓ CLI mode selected.${RESET} Add this to your OpenClaw plugin config:

    ${DIM}"openclawdreams": {
      "enabled": true,
      "config": {
        "schedulerEnabled": false
      }
    }${RESET}

  Then trigger cycles manually:

    ${DIM}openclaw openclawdreams reflect
    openclaw openclawdreams dream${RESET}

  Full docs: ${CYAN}https://github.com/RogueCtrl/OpenClawDreams${RESET}
`);
} else {
  console.log(`\n  ${CYAN}✓ Autonomous mode selected. Installing...${RESET}\n`);
}

process.exit(0);
