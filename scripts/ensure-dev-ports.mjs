#!/usr/bin/env node
/**
 * Stops stale dev servers for this monorepo on fixed ports before starting npm run dev.
 * Only targets node processes whose cwd/command line references this project.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = [3001, 5173, 5174];

function pidsOnPort(port) {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    return out ? out.split('\n').map((p) => Number(p.trim())).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isProjectProcess(pid) {
  try {
    const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' });
    return cmd.includes(root) || cmd.includes('games-platform') || cmd.includes('@games/');
  } catch {
    return false;
  }
}

for (const port of PORTS) {
  for (const pid of pidsOnPort(port)) {
    if (isProjectProcess(pid)) {
      console.log(`Stopping stale project process ${pid} on port ${port}`);
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }
}

// brief grace period for ports to release
execSync('sleep 1');

for (const port of PORTS) {
  const remaining = pidsOnPort(port).filter(isProjectProcess);
  if (remaining.length > 0) {
    console.error(
      `Port ${port} is still in use by project process(es): ${remaining.join(', ')}. Stop them manually before npm run dev.`,
    );
    process.exit(1);
  }
}

console.log('Dev ports clear: 3001 (API), 5173 (WEB), 5174 (ADMIN)');
