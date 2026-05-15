import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('README links to Korean documentation', async () => {
  const readme = await readText('README.md');

  assert.match(readme, /README-ko\.md/);
  assert.match(readme, /한국어|Korean/i);
});

test('Korean README covers core setup and workflow in Korean', async () => {
  const koreanReadme = await readText('README-ko.md');

  assert.match(koreanReadme, /^# slides-grab/m);
  assert.match(koreanReadme, /한국어/);
  assert.match(koreanReadme, /빠른 시작/);
  assert.match(koreanReadme, /설치/);
  assert.match(koreanReadme, /CLI 명령어/);
  assert.match(koreanReadme, /에셋/);
  assert.match(koreanReadme, /라이선스/);

  for (const requiredCommand of [
    'npm ci',
    'npx playwright install chromium',
    'npm install slides-grab',
    'slides-grab edit',
    'slides-grab validate',
    'slides-grab pdf',
    'slides-grab convert',
  ]) {
    assert.match(koreanReadme, new RegExp(requiredCommand.replaceAll(' ', '\\s+')));
  }
});
