#!/usr/bin/env node
import { spawn } from 'node:child_process';
import net from 'node:net';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(child, port, timeoutMs = 8_000) {
  const started = Date.now();
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`server exited before smoke checks ran\n${logs}`));
        return;
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) {
          clearInterval(timer);
          resolve(logs);
          return;
        }
      } catch {
        // keep waiting
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`server did not answer /api/health within ${timeoutMs}ms\n${logs}`));
      }
    }, 120);
  });
}

async function main() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), GITHUB_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child, port);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
    if (!health.ok || health.service !== 'git-up' || !Array.isArray(health.features)) {
      throw new Error(`unexpected health payload: ${JSON.stringify(health)}`);
    }

    const html = await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text());
    if (!html.includes('<div id="app"></div>') || !html.includes('/app.js')) {
      throw new Error('index.html did not include the application mount point and module script');
    }

    const logo = await fetch(`http://127.0.0.1:${port}/assets/logo/icon_Dark_mode.png`);
    if (logo.status !== 200 || !String(logo.headers.get('content-type')).includes('image/png')) {
      throw new Error(`logo route returned ${logo.status} ${logo.headers.get('content-type')}`);
    }

    const mascot = await fetch(`http://127.0.0.1:${port}/assets/mascot/oreo-route-bot.svg`);
    if (mascot.status !== 200 || !String(mascot.headers.get('content-type')).includes('image/svg+xml')) {
      throw new Error(`mascot route returned ${mascot.status} ${mascot.headers.get('content-type')}`);
    }

    console.log(`Smoke check passed on http://127.0.0.1:${port}`);
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
