// Helpers for the end-to-end and load tests: start the game server and the web preview as child processes.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));

function startProcess(name, cmd, args, { cwd = root, env = {}, ready }) {
  // detached: the child leads its own process group, so stop() also ends what `npx` started.
  const child = spawn(cmd, args, { cwd, env: { ...process.env, NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const log = [];
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not start in 60 s\n${log.join('')}`)), 60_000);
    const onData = (d) => {
      // Strip ANSI colour codes: CI forces colour, which splits text such as "127.0.0.1:" from the port.
      log.push(d.toString().replace(/\x1b\[[0-9;]*m/g, ''));
      if (ready.test(log.join(''))) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`${name} exited with ${code}\n${log.join('')}`)); });
  });
  return {
    ready: started,
    log,
    stop: () => {
      child.removeAllListeners('exit');
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    },
  };
}

/**
 * The Cloudflare Worker (web client + Durable Object rooms) under `wrangler dev`, with the test-only
 * metrics reset enabled. Serves apps/web/dist, so build the web app first.
 */
export function startWorker(port) {
  const proc = startProcess('wrangler dev', 'npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--var', 'CN_TEST:1'], {
    ready: /Ready on|ready on/i,
  });
  // Also wait until the Worker answers, which is the real readiness signal.
  proc.ready = proc.ready.then(async () => {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* not yet */ }
      await sleep(500);
    }
    throw new Error(`Worker on port ${port} did not answer /api/health\n${proc.log.join('')}`);
  });
  return proc;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function writeReport(name, data) {
  const dir = `${root}tests/reports`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}`, JSON.stringify(data, null, 2) + '\n');
}
