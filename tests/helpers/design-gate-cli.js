import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function runSlidesGrabCli(args) {
  return execFileSync(process.execPath, ['bin/ppt-agent.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
}

export function captureSlidesGrabFailure(args) {
  try {
    runSlidesGrabCli(args);
  } catch (error) {
    return {
      stderr: error.stderr || error.message,
      stdout: error.stdout || '',
    };
  }
  assert.fail(`Expected slides-grab ${args.join(' ')} to fail`);
}

export function recordProceedGate(slidesDir, passAPath, passBPath) {
  runSlidesGrabCli(designGateArgs(slidesDir, passAPath, passBPath));
}

export function designGateArgs(slidesDir, passAPath, passBPath) {
  return [
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
  ];
}

export function writeDeck(slidesDir, title = 'Design Gate Fixture') {
  mkdirSync(slidesDir, { recursive: true });
  writeFileSync(join(slidesDir, 'slide-01.html'), createSlideHtml(title), 'utf-8');
}

export function createSlideHtml(title) {
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
