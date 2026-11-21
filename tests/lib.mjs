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

/** Game server (apps/server) on a test port, with the test-only metrics reset route enabled. */
export function startServer(port) {
  return startProcess('server', 'npx', ['tsx', 'apps/server/src/index.ts'], {
    env: { PORT: String(port), CN_TEST: '1' },
    ready: /"ev":"listening"/,
  });
}

/** Built web app (apps/web/dist) served by `vite preview`. Run `npm run build` first. */
export function startPreview(port) {
  return startProcess('web preview', 'npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: `${root}apps/web`,
    ready: new RegExp(`127\\.0\\.0\\.1:${port}`),
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function writeReport(name, data) {
  const dir = `${root}tests/reports`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${name}`, JSON.stringify(data, null, 2) + '\n');
}
