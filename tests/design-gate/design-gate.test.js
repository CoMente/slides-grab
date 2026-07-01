import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  captureSlidesGrabFailure,
  createSlideHtml,
  designGateArgs,
  recordProceedGate,
  runSlidesGrabCli,
  writeDeck,
} from '../helpers/design-gate-cli.js';
import { createPassAReport, createPassBReport } from '../helpers/design-gate-fixtures.js';

test('slides-grab pdf blocks export when no fresh Proceed design gate exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-block-'));
  const slidesDir = join(root, 'slides');
  const outputPath = join(root, 'deck.pdf');

  try {
    writeDeck(slidesDir);

    const error = captureSlidesGrabFailure(['pdf', '--slides-dir', slidesDir, '--output', outputPath]);

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
    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');

    runSlidesGrabCli(designGateArgs(slidesDir, passAPath, passBPath));

    const statePath = join(slidesDir, '.slides-grab', 'design-gate.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(state.schemaVersion, 2);
    assert.equal(state.verdict, 'proceed');
    assert.equal(state.gateValidation.status, 'passed');
    assert.equal(state.passA.verdict, 'PASS');
    assert.equal(state.passB.verdict, 'PASS');
    assert.equal(state.passA.slideFingerprints.length, 1);
    assert.equal(state.passB.slideFingerprints.length, 1);
    assert.equal(state.slideFingerprints.length, 1);
    assert.equal(state.passReportFingerprints.length, 2);
    assert.equal(state.previewFingerprints.length, 1);
    assert.equal(existsSync(join(slidesDir, '.slides-grab', 'gate-preview', 'slide-01.png')), true);

    runSlidesGrabCli(['pdf', '--slides-dir', slidesDir, '--output', outputPath]);
    assert.equal(existsSync(outputPath), true);

    writeFileSync(join(slidesDir, 'slide-01.html'), createSlideHtml('Changed after gate'), 'utf-8');
    const staleError = captureSlidesGrabFailure(['pdf', '--slides-dir', slidesDir, '--output', join(root, 'stale.pdf')]);
    assert.match(String(staleError.stderr), /stale|changed/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slides-grab design-gate blocks Proceed when slide validation fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-invalid-slide-'));
  const slidesDir = join(root, 'slides');
  const passAPath = join(root, 'pass-a.md');
  const passBPath = join(root, 'pass-b.md');

  try {
    writeDeck(slidesDir);
    writeFileSync(
      join(slidesDir, 'slide-01.html'),
      createInvalidOverflowSlideHtml(),
      'utf-8',
    );
    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');

    const error = captureSlidesGrabFailure(designGateArgs(slidesDir, passAPath, passBPath));

    assert.match(String(error.stderr), /validation|overflow-outside-frame|blocked/i);
    assert.equal(existsSync(join(slidesDir, '.slides-grab', 'design-gate.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slides-grab export blocks when a design-gated local asset changes', { timeout: 90000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-asset-stale-'));
  const slidesDir = join(root, 'slides');
  const assetsDir = join(slidesDir, 'assets');
  const assetPath = join(assetsDir, 'box.svg');
  const passAPath = join(root, 'pass-a.md');
  const passBPath = join(root, 'pass-b.md');

  try {
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(assetPath, createBoxSvg('#FF0000'), 'utf-8');
    writeFileSync(join(slidesDir, 'slide-01.html'), createSlideHtmlWithAsset('Asset Gate Fixture'), 'utf-8');
    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');
    recordProceedGate(slidesDir, passAPath, passBPath);

    writeFileSync(assetPath, createBoxSvg('#0000FF'), 'utf-8');
    const staleError = captureSlidesGrabFailure(['pdf', '--slides-dir', slidesDir, '--output', join(root, 'asset-stale.pdf')]);

    assert.match(String(staleError.stderr), /assets changed|box\.svg|stale/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slides-grab export blocks when design-gate pass reports or rendered evidence change', { timeout: 90000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-evidence-stale-'));
  const slidesDir = join(root, 'slides');
  const passAPath = join(root, 'pass-a.md');
  const passBPath = join(root, 'pass-b.md');

  try {
    writeDeck(slidesDir);
    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');
    recordProceedGate(slidesDir, passAPath, passBPath);

    writeFileSync(passAPath, `${createPassAReport(slidesDir)}\nExtra post-gate edit.\n`, 'utf-8');
    const reportError = captureSlidesGrabFailure(['pdf', '--slides-dir', slidesDir, '--output', join(root, 'report-stale.pdf')]);
    assert.match(String(reportError.stderr), /reports changed|Pass A|Pass B/i);

    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    recordProceedGate(slidesDir, passAPath, passBPath);

    writeFileSync(join(slidesDir, '.slides-grab', 'gate-preview', 'slide-01.png'), 'changed evidence', 'utf-8');
    const previewError = captureSlidesGrabFailure(['pdf', '--slides-dir', slidesDir, '--output', join(root, 'preview-stale.pdf')]);
    assert.match(String(previewError.stderr), /rendered evidence changed/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const rejectScenarios = [
  {
    name: 'stale Pass A and Pass B reports reused after slide edits',
    prepare(slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
      writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');
      writeFileSync(join(slidesDir, 'slide-01.html'), createSlideHtml('Changed before gate record'), 'utf-8');
    },
    stderr: /current slide fingerprint/i,
  },
  {
    name: 'weak Pass A and Pass B reports',
    prepare(_slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, 'Pass A: System Contract / Constraint Integrity says Proceed.', 'utf-8');
      writeFileSync(passBPath, 'Pass B: Audience Impact / Expressive Readability says Proceed.', 'utf-8');
    },
    stderr: /missing|required|criteria|Unresolved Critical/i,
  },
  {
    name: 'proceed verdict with unresolved Critical findings',
    prepare(slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
      writeFileSync(passBPath, createPassBReport(slidesDir, { unresolvedCritical: 1 }), 'utf-8');
    },
    stderr: /blocks proceed|cannot proceed|unresolved/i,
  },
  {
    name: 'reports that list Critical severity findings',
    prepare(slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
      writeFileSync(passBPath, createPassBReport(slidesDir, { criticalRowOnly: true }), 'utf-8');
    },
    stderr: /Critical severity finding/i,
  },
  {
    name: 'contradictory verdicts and unsupported severities',
    prepare(slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, createPassAReport(slidesDir, {
        verdictLines: ['VERDICT: PASS', '  VERDICT: FAIL'],
        findingSeverity: 'Blocker',
      }), 'utf-8');
      writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');
    },
    stderr: /exactly one VERDICT|unsupported finding severity/i,
  },
  {
    name: 'deck-wide Critical findings rows',
    prepare(slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
      writeFileSync(passBPath, createPassBReport(slidesDir, {
        criticalRowOnly: true,
        slideCell: 'deck-wide',
      }), 'utf-8');
    },
    stderr: /Critical severity finding/i,
  },
  {
    name: 'duplicate contradictory Critical summary lines',
    prepare(slidesDir, passAPath, passBPath) {
      writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
      writeFileSync(passBPath, createPassBReport(slidesDir, {
        extraSummaryLines: [
          '  Unresolved Critical: 1',
          '  Blocking findings: slide-01: hidden blocking issue',
        ],
      }), 'utf-8');
    },
    stderr: /exactly one Unresolved Critical|exactly one Blocking findings/i,
  },
];

for (const scenario of rejectScenarios) {
  test(`slides-grab design-gate rejects ${scenario.name}`, { timeout: 90000 }, () => {
    const root = mkdtempSync(join(tmpdir(), 'slides-grab-gate-reject-'));
    const slidesDir = join(root, 'slides');
    const passAPath = join(root, 'pass-a.md');
    const passBPath = join(root, 'pass-b.md');

    try {
      writeDeck(slidesDir);
      scenario.prepare(slidesDir, passAPath, passBPath);
      const error = captureSlidesGrabFailure(designGateArgs(slidesDir, passAPath, passBPath));

      assert.match(String(error.stderr), scenario.stderr);
      assert.equal(existsSync(join(slidesDir, '.slides-grab', 'design-gate.json')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

function createInvalidOverflowSlideHtml() {
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
      font-family: Pretendard, sans-serif;
      overflow: hidden;
    }
    .overflow {
      position: absolute;
      left: 700pt;
      top: 20pt;
      width: 80pt;
      height: 40pt;
      background: #FF0000;
    }
  </style>
</head>
<body>
  <div class="overflow"><p>Outside</p></div>
</body>
</html>`;
}

function createSlideHtmlWithAsset(title) {
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
      display: grid;
      grid-template-columns: 1fr 160pt;
      gap: 24pt;
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
    img {
      width: 120pt;
      height: 120pt;
      align-self: center;
    }
  </style>
</head>
<body>
  <div class="frame">
    <div>
      <h1>${title}</h1>
      <p>Local asset changes must keep the design gate stale.</p>
    </div>
    <img src="./assets/box.svg" alt="Color box">
  </div>
</body>
</html>`;
}

function createBoxSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="${color}"/></svg>`;
}
