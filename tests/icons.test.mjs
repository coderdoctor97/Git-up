import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ICON_IDS, icon } from '../public/icons.js';

const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const iconSource = await readFile(new URL('../public/icons.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const notices = await readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

const sha256 = async (relativeUrl) => createHash('sha256')
  .update(await readFile(new URL(relativeUrl, import.meta.url)))
  .digest('hex');

test('the UI uses one complete local Tabler/Iconify registry', () => {
  assert.equal(Object.keys(ICON_IDS).length, 50);
  assert.equal(new Set(Object.values(ICON_IDS)).size, 50, 'each semantic role has a deliberate glyph');
  assert.ok(Object.values(ICON_IDS).every((id) => /^tabler:[a-z0-9-]+$/.test(id)));

  assert.equal(ICON_IDS.dashboard, 'tabler:layout-dashboard');
  assert.equal(ICON_IDS.graph, 'tabler:git-branch');
  assert.equal(ICON_IDS.command, 'tabler:command');
  assert.equal(ICON_IDS.search, 'tabler:search');
  assert.equal(ICON_IDS.history, 'tabler:history');
  assert.equal(ICON_IDS.clock, 'tabler:clock');
  assert.equal(ICON_IDS.loader, 'tabler:loader-2');
  assert.equal(ICON_IDS.refresh, 'tabler:refresh');
  assert.equal(ICON_IDS.restore, 'tabler:restore');
  assert.equal(ICON_IDS.aiSettings, 'tabler:settings-ai');
  assert.equal(ICON_IDS.requirements, 'tabler:clipboard-list');
  assert.equal(ICON_IDS.fileSearch, 'tabler:file-search');
  assert.equal(ICON_IDS.health, 'tabler:activity-heartbeat');
  assert.equal(ICON_IDS.shieldLock, 'tabler:shield-lock');

  assert.match(appSource, /import \{ icon \} from '\.\/icons\.js';/);
  assert.doesNotMatch(appSource, /const icons\s*=\s*\{/);
  assert.doesNotMatch(iconSource, /fetch\s*\(|from\s+['"]https?:|src=['"]https?:/i, 'icons must not need runtime network access');
  assert.match(notices, /Tabler Icons 3\.46\.0/);
  assert.match(notices, /MIT License/);
});

test('every static, dynamic, mobile, and palette icon reference resolves with no stale glyphs', () => {
  const staticNames = [...appSource.matchAll(/icon\(\s*'([^']+)'/g)].map((match) => match[1]);
  const dataNames = [...appSource.matchAll(/\bicon:\s*'([^']+)'/g)].map((match) => match[1]);
  const dynamicNames = ['sun', 'moon', 'eye', 'eyeOff'];
  const referenced = new Set([...staticNames, ...dataNames, ...dynamicNames]);
  const registered = new Set(Object.keys(ICON_IDS));

  assert.deepEqual([...referenced].filter((name) => !registered.has(name)), []);
  assert.deepEqual([...registered].filter((name) => !referenced.has(name)), [], 'registry should contain no stale icons');

  for (const stale of ['mark', 'settings', 'plus', 'grid', 'pencil', 'spark', 'layers', 'download', 'bulb']) {
    assert.equal(referenced.has(stale), false, `legacy ${stale} role should be gone`);
  }
  assert.match(appSource, /icon\(toLight \? 'sun' : 'moon'/);
  assert.match(appSource, /icon\(state\.secretVisible \? 'eyeOff' : 'eye'/);
  assert.match(appSource, /icon\(state\.toast\.type === 'error' \? 'warning' : 'checkCircle'/);
  assert.match(appSource, /icon\(alert\.tone === 'warn' \? 'warning' : 'info'/);
  assert.match(appSource, /icon\(item\.icon, 18\)/);
  assert.match(appSource, /icon\(action\.icon, 15\)/);
});

test('rendered icons are aligned, decorative, currentColor-safe, and sanitized', () => {
  for (const [name, id] of Object.entries(ICON_IDS)) {
    const svg = icon(name, 16);
    assert.match(svg, /^<svg class="ui-icon"/);
    assert.match(svg, /width="16" height="16" viewBox="0 0 24 24"/);
    assert.match(svg, /aria-hidden="true" focusable="false"/);
    assert.match(svg, new RegExp(`data-icon="${id}"`));
    assert.match(svg, /currentColor/);
    assert.match(svg, /stroke-width="2"/, `${name} should use the shared Tabler stroke weight`);
    assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+\s*=|javascript:|url\s*\(/i);
  }

  assert.match(icon('loader', 13, 'spinner'), /class="ui-icon spinner"/);
  assert.doesNotMatch(icon('loader', 13, 'spinner onclick=bad'), /onclick/);
  assert.match(icon('missing-role'), /data-icon="tabler:info-circle"/);
  assert.match(styles, /\.ui-icon \{[^}]*display: block;[^}]*flex: 0 0 auto;[^}]*pointer-events: none;/s);
  assert.match(styles, /\.spinner \{ animation: spin 1s linear infinite; \}/);
});

test('the protected Git-Up logo and Oreo mascot remain outside the icon redesign', async () => {
  for (const relativeUrl of [
    '../assets/logo/icon_Dark_mode.png',
    '../public/assets/logo/icon_Dark_mode.png',
  ]) {
    assert.equal(
      await sha256(relativeUrl),
      '10cd816671f9258f2c0f19e8cc95202ac1c7e461c5897768068b1a026388cec6',
    );
  }
  for (const relativeUrl of [
    '../assets/logo/icon_light_mode.png',
    '../public/assets/logo/icon_light_mode.png',
  ]) {
    assert.equal(
      await sha256(relativeUrl),
      '11a848e2a4bba058e9a0d8fd449a44b4641c5d5ae8753cfefc9014436428e6df',
    );
  }
  assert.equal(
    await sha256('../assets/mascot/oreo-route-bot.svg'),
    'b06061246432ab12c014f43e697318363d6a238fc3d78f3d6ce3fb63901e3417',
  );
  assert.match(appSource, /assets\/logo\/icon_Dark_mode\.png/);
  assert.match(appSource, /assets\/logo\/icon_light_mode\.png/);
  assert.match(appSource, /const OREO_LOTTIE = 'https:\/\/assets-v2\.lottiefiles\.com\/[^']+\.lottie';/);
  assert.match(appSource, /<dotlottie-player class="oreo-mascot"/);
  assert.doesNotMatch(iconSource, /icon_Dark_mode|icon_light_mode|OREO_LOTTIE|dotlottie-player|oreo-mascot/);
});
