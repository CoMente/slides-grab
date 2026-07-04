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
import { buildTemplateFidelityReport } from '../../src/template-fidelity.js';

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

test('slides-grab design-gate records template fidelity evidence when a template pack is active', { timeout: 90000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-template-fidelity-'));
  const slidesDir = join(root, 'slides');
  const passAPath = join(root, 'pass-a.md');
  const passBPath = join(root, 'pass-b.md');

  try {
    writeTemplateDeck(slidesDir);
    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');

    runSlidesGrabCli(designGateArgs(slidesDir, passAPath, passBPath));

    const state = JSON.parse(readFileSync(join(slidesDir, '.slides-grab', 'design-gate.json'), 'utf-8'));
    assert.equal(state.templateFidelity.status, 'passed');
    assert.equal(state.templateFidelity.slides[0].layoutId, 'cover-tight');
    assert.match(state.templateFidelity.slides[0].generatedPreview, /gate-preview\/slide-01\.png$/);
    assert.equal(state.templateFidelity.slides[0].referencePreview, '.slides-grab/template-previews/cover-tight.png');

    const report = readFileSync(join(slidesDir, '.slides-grab', 'design-gate-report.md'), 'utf-8');
    assert.match(report, /## Template Fidelity Report/);
    assert.match(report, /cover-tight/);
    assert.match(report, /gate-preview\/slide-01\.png/);
    assert.match(report, /template-previews\/cover-tight\.png/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slides-grab design-gate blocks proceed when template fidelity reference previews are missing', { timeout: 90000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-template-fidelity-missing-'));
  const slidesDir = join(root, 'slides');
  const passAPath = join(root, 'pass-a.md');
  const passBPath = join(root, 'pass-b.md');

  try {
    writeTemplateDeck(slidesDir, { writePreview: false });
    writeFileSync(passAPath, createPassAReport(slidesDir), 'utf-8');
    writeFileSync(passBPath, createPassBReport(slidesDir), 'utf-8');

    const error = captureSlidesGrabFailure(designGateArgs(slidesDir, passAPath, passBPath));

    assert.match(String(error.stderr), /template fidelity|reference preview|cover-tight/i);
    assert.equal(existsSync(join(slidesDir, '.slides-grab', 'design-gate.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('template fidelity report keeps mixed template and legacy slides non-blocking', async () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-template-fidelity-mixed-'));
  const slidesDir = join(root, 'slides');

  try {
    writeTemplateDeck(slidesDir);
    writeFileSync(join(slidesDir, 'slide-02.html'), createSlideHtml('Legacy slide without template metadata'), 'utf-8');
    const previewDir = join(slidesDir, '.slides-grab', 'gate-preview');
    mkdirSync(previewDir, { recursive: true });
    writeFileSync(join(previewDir, 'slide-01.png'), 'generated preview 1', 'utf-8');
    writeFileSync(join(previewDir, 'slide-02.png'), 'generated preview 2', 'utf-8');

    const report = await buildTemplateFidelityReport({
      slidesDir,
      slideFiles: ['slide-01.html', 'slide-02.html'],
      previewRelativeDir: '.slides-grab/gate-preview',
    });

    assert.equal(report.status, 'passed');
    assert.equal(report.findings.some((finding) => finding.code === 'template-metadata-missing'), false);
    assert.equal(report.slides[1].layoutId, null);
    assert.match(report.slides[1].notes.join(' '), /not template-governed/i);
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

function writeTemplateDeck(slidesDir, { writePreview = true } = {}) {
  const gateDir = join(slidesDir, '.slides-grab');
  const previewDir = join(gateDir, 'template-previews');
  mkdirSync(previewDir, { recursive: true });
  if (writePreview) {
    writeFileSync(join(previewDir, 'cover-tight.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5GczwAAAABJRU5ErkJggg==',
      'base64',
    ));
  }
  writeFileSync(join(gateDir, 'template-pack.json'), JSON.stringify({
    version: 1,
    name: 'Template Fidelity Fixture',
    designTokens: {
      colors: [{ value: '#ffffff', kind: 'background' }, { value: '#111111', kind: 'text' }],
      fonts: [{ family: 'Pretendard' }],
    },
    layouts: [{
      layout_id: 'cover-tight',
      layout_kind: 'cover',
      preview: '.slides-grab/template-previews/cover-tight.png',
      fields: [{ role: 'title', maxChars: 64 }],
    }],
  }, null, 2), 'utf-8');
  writeFileSync(join(slidesDir, 'slide-01.html'), `<!DOCTYPE html>
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
    h1 { margin: 0 0 12pt; font-size: 24pt; }
    p { margin: 0; font-size: 14pt; line-height: 1.4; }
  </style>
</head>
<body>
  <!-- slides-grab-template: {"layoutId":"cover-tight","layoutKind":"cover"} -->
  <h1 data-template-role="title">Template fidelity fixture</h1>
  <p>All text is in semantic tags and the slide fits the required frame.</p>
</body>
</html>`, 'utf-8');
}
