import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

test('slides-grab pdf blocks export when no fresh Proceed design gate exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-block-'));
  const slidesDir = join(root, 'slides');
  const outputPath = join(root, 'deck.pdf');

  try {
    writeDeck(slidesDir);

    const error = captureCliFailure(['pdf', '--slides-dir', slidesDir, '--output', outputPath]);

    assert.match(String(error.stderr), /design[- ]gate/i);
    assert.equal(existsSync(outputPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slides-grab design-gate records Proceed evidence, unblocks export, and turns stale after slide edits', { timeout: 90000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-pass-'));
  const slidesDir = join(root, 'slides');
  const outputPath = join(root, 'deck.pdf');
  const passAPath = join(root, 'pass-a.md');
  const passBPath = join(root, 'pass-b.md');

  try {
    writeDeck(slidesDir);
    writeFileSync(passAPath, 'Pass A: System Contract / Constraint Integrity says Proceed.', 'utf-8');
    writeFileSync(passBPath, 'Pass B: Audience Impact / Expressive Readability says Proceed.', 'utf-8');

    runCli([
      'design-gate',
      '--slides-dir',
      slidesDir,
      '--verdict',
      'proceed',
      '--pass-a-report',
      passAPath,
      '--pass-b-report',
      passBPath,
      '--resolution',
      '720p',
    ]);

    const statePath = join(slidesDir, '.slides-grab', 'design-gate.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(state.verdict, 'proceed');
    assert.equal(state.slideFingerprints.length, 1);
    assert.equal(existsSync(join(slidesDir, '.slides-grab', 'gate-preview', 'slide-01.png')), true);

    runCli(['pdf', '--slides-dir', slidesDir, '--output', outputPath]);
    assert.equal(existsSync(outputPath), true);

    writeFileSync(join(slidesDir, 'slide-01.html'), createSlideHtml('Changed after gate'), 'utf-8');
    const staleError = captureCliFailure(['pdf', '--slides-dir', slidesDir, '--output', join(root, 'stale.pdf')]);
    assert.match(String(staleError.stderr), /stale|changed/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runCli(args) {
  return execFileSync(process.execPath, ['bin/ppt-agent.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
}

function captureCliFailure(args) {
  try {
    runCli(args);
  } catch (error) {
    return {
      stderr: error.stderr || error.message,
      stdout: error.stdout || '',
    };
  }
  assert.fail(`Expected slides-grab ${args.join(' ')} to fail`);
}

function writeDeck(slidesDir) {
  mkdirSync(slidesDir, { recursive: true });
  writeFileSync(join(slidesDir, 'slide-01.html'), createSlideHtml('Design Gate Fixture'), 'utf-8');
}

function createSlideHtml(title) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      width: 720pt;
      height: 405pt;
      margin: 0;
      padding: 36pt;
      font-family: Pretendard, sans-serif;
      background: #ffffff;
      color: #111111;
      overflow: hidden;
    }
    .frame {
      width: 100%;
      height: 100%;
      border: 1pt solid #222222;
      padding: 24pt;
    }
    h1 {
      margin: 0 0 12pt;
      font-size: 24pt;
    }
    p {
      margin: 0;
      font-size: 14pt;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="frame">
    <h1>${title}</h1>
    <p>All text is in semantic tags and the slide fits the required frame.</p>
  </div>
</body>
</html>`;
}
