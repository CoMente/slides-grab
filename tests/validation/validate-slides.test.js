import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { chromium } from 'playwright';

import {
  DEFAULT_SLIDES_DIR,
  DEFAULT_VALIDATE_FORMAT,
  parseValidateCliArgs,
} from '../../src/validation/cli.js';
import { createValidationResult, findSlideFiles, scanSlides, selectSlideFiles } from '../../src/validation/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDeckDir = path.join(__dirname, 'fixtures', 'sample-deck');
const repoRoot = path.join(__dirname, '..', '..');

function writeCanvasSlide(slidesDir, bodyScript = '') {
  writeFileSync(
    path.join(slidesDir, 'slide-01.html'),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 720pt;
      height: 405pt;
      overflow: hidden;
      background: #ffffff;
      font-family: sans-serif;
    }
    .slide {
      width: 720pt;
      height: 405pt;
      padding: 36pt;
    }
    h1 {
      margin: 0 0 18pt;
      font-size: 26pt;
      line-height: 1.25;
    }
    canvas {
      display: block;
      width: 460pt;
      height: 220pt;
    }
  </style>
</head>
<body>
  <div class="slide">
    <h1>Canvas chart validation</h1>
    <canvas id="chart" width="640" height="320"></canvas>
  </div>
  ${bodyScript}
</body>
</html>`,
    'utf8',
  );
}

test('parseValidateCliArgs applies defaults and reads --slides-dir', () => {
  assert.deepEqual(parseValidateCliArgs([]), {
    slidesDir: DEFAULT_SLIDES_DIR,
    format: DEFAULT_VALIDATE_FORMAT,
    mode: 'presentation',
    help: false,
    slides: [],
  });

  assert.equal(parseValidateCliArgs(['--slides-dir', 'decks/demo']).slidesDir, 'decks/demo');
  assert.equal(parseValidateCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
  assert.equal(parseValidateCliArgs(['--format', 'json']).format, 'json');
  assert.equal(parseValidateCliArgs(['--mode', 'card-news']).mode, 'card-news');
  assert.deepEqual(
    parseValidateCliArgs(['--slide', 'slide-02.html', '--slide=slide-03.html']).slides,
    ['slide-02.html', 'slide-03.html'],
  );
  assert.throws(() => parseValidateCliArgs(['--slides-dir']), /missing value/i);
  assert.throws(() => parseValidateCliArgs(['--mode']), /missing value/i);
  assert.throws(() => parseValidateCliArgs(['--format', 'xml']), /unknown --format value/i);
  assert.throws(() => parseValidateCliArgs(['--mode', 'story']), /unknown --mode value/i);
});

test('findSlideFiles sorts slide fixtures deterministically', async () => {
  const slideFiles = await findSlideFiles(fixtureDeckDir);
  assert.deepEqual(slideFiles, ['slide-01.html', 'slide-02.html', 'slide-03.html', 'slide-04.html']);
});

test('scanSlides returns stable issue codes for regression fixtures', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    const slideFiles = await findSlideFiles(fixtureDeckDir);
    const slides = await scanSlides(page, fixtureDeckDir, slideFiles);
    const result = createValidationResult(slides);

    assert.equal(result.summary.totalSlides, 4);
    assert.equal(result.summary.failedSlides, 2);
    assert.equal(result.summary.passedSlides, 2);
    assert.equal(result.summary.criticalIssues, 3);
    assert.ok(result.summary.warnings >= 1);

    assert.equal(slides[0].status, 'pass');
    assert.deepEqual(slides[0].critical, []);

    assert.deepEqual(
      slides[1].critical.map((issue) => issue.code),
      ['overflow-outside-frame', 'overflow-outside-frame'],
    );

    assert.deepEqual(
      slides[2].critical.map((issue) => issue.code),
      ['text-clipped'],
    );

    assert.deepEqual(
      slides[3].warning.map((issue) => issue.code),
      ['sibling-overlap'],
    );
  } finally {
    await browser.close();
  }
});

test('scanSlides warns when slide metadata exceeds selected template layout schema', async () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-template-density-'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    mkdirSync(path.join(slidesDir, '.slides-grab'), { recursive: true });
    writeFileSync(path.join(slidesDir, '.slides-grab', 'template-pack.json'), JSON.stringify({
      version: 1,
      name: 'Validation Template',
      layouts: [{
        layout_id: 'cover-tight',
        layout_kind: 'cover',
        fields: [{ role: 'title', maxChars: 12 }],
      }],
    }), 'utf8');
    writeFileSync(path.join(slidesDir, 'slide-01.html'), `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 720pt; height: 405pt; overflow: hidden; }
h1 { font-size: 32pt; margin: 40pt; }
</style></head><body>
<!-- slides-grab-template: {"layoutId":"cover-tight","layoutKind":"cover"} -->
<h1>Long title beyond schema</h1>
</body></html>`, 'utf8');

    const slides = await scanSlides(page, slidesDir, ['slide-01.html']);
    assert.equal(slides[0].status, 'pass');
    assert.ok(slides[0].warning.some((issue) => issue.code === 'template-field-overflow'));
  } finally {
    await browser.close();
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('scanSlides checks density for custom template roles from metadata-bearing slides', async () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-template-custom-role-'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    mkdirSync(path.join(slidesDir, '.slides-grab'), { recursive: true });
    writeFileSync(path.join(slidesDir, '.slides-grab', 'template-pack.json'), JSON.stringify({
      version: 1,
      name: 'Custom Role Template',
      layouts: [{
        layout_id: 'body-tight',
        layout_kind: 'content',
        fields: [{ role: 'body', maxChars: 10 }],
      }],
    }), 'utf8');
    writeFileSync(path.join(slidesDir, 'slide-01.html'), `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 720pt; height: 405pt; overflow: hidden; }
p { font-size: 18pt; margin: 40pt; }
</style></head><body>
<!-- slides-grab-template: {"layoutId":"body-tight","layoutKind":"content"} -->
<p data-template-role="body">Body copy exceeds the imported layout schema.</p>
</body></html>`, 'utf8');

    const slides = await scanSlides(page, slidesDir, ['slide-01.html']);
    assert.equal(slides[0].status, 'pass');
    assert.ok(slides[0].warning.some((issue) => issue.code === 'template-field-overflow' && issue.role === 'body'));
  } finally {
    await browser.close();
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('scanSlides keeps legacy slides without template metadata unchanged', async () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-template-legacy-'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    mkdirSync(path.join(slidesDir, '.slides-grab'), { recursive: true });
    writeFileSync(path.join(slidesDir, '.slides-grab', 'template-pack.json'), JSON.stringify({
      version: 1,
      name: 'Validation Template',
      layouts: [{ layout_id: 'cover-tight', layout_kind: 'cover', fields: [{ role: 'title', maxChars: 4 }] }],
    }), 'utf8');
    writeFileSync(path.join(slidesDir, 'slide-01.html'), `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 720pt; height: 405pt; overflow: hidden; }
h1 { font-size: 32pt; margin: 40pt; }
</style></head><body><h1>Legacy slide title is not checked</h1></body></html>`, 'utf8');

    const slides = await scanSlides(page, slidesDir, ['slide-01.html']);
    assert.equal(slides[0].status, 'pass');
    assert.equal(slides[0].warning.some((issue) => issue.code === 'template-field-overflow'), false);
  } finally {
    await browser.close();
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('scanSlides warns but does not fail when template metadata references a malformed pack', async () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-template-malformed-'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    mkdirSync(path.join(slidesDir, '.slides-grab'), { recursive: true });
    writeFileSync(path.join(slidesDir, '.slides-grab', 'template-pack.json'), '{not-json', 'utf8');
    writeFileSync(path.join(slidesDir, 'slide-01.html'), `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 720pt; height: 405pt; overflow: hidden; }
h1 { font-size: 32pt; margin: 40pt; }
</style></head><body>
<!-- slides-grab-template: {"layoutId":"cover-tight","layoutKind":"cover"} -->
<h1>Template metadata remains non-blocking</h1>
</body></html>`, 'utf8');

    const slides = await scanSlides(page, slidesDir, ['slide-01.html']);
    assert.equal(slides[0].status, 'pass');
    assert.ok(slides[0].warning.some((issue) => issue.code === 'template-pack-invalid'));
    assert.equal(slides[0].critical.some((issue) => issue.code === 'slide-validation-error'), false);
  } finally {
    await browser.close();
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('validate CLI fails a visible canvas with an empty drawing buffer', () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-empty-canvas-'));

  try {
    writeCanvasSlide(slidesDir);

    const command = spawnSync(
      process.execPath,
      ['scripts/validate-slides.js', '--slides-dir', slidesDir],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );

    assert.equal(command.status, 1);
    assert.equal(command.stderr, '');
    assert.match(command.stdout, /^slide-01\.html:error\[empty-canvas\]/m);
    assert.match(command.stdout, /summary: 1 slide\(s\) checked, 0 passed, 1 failed, 1 error\(s\), 0 warning\(s\)/);
  } finally {
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('validate CLI fails a visible canvas with a zero-size drawing buffer', () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-zero-canvas-'));

  try {
    writeFileSync(
      path.join(slidesDir, 'slide-01.html'),
      `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 720pt; height: 405pt; background: #fff; }
  canvas { display: block; width: 460pt; height: 220pt; }
</style></head>
<body>
  <div><canvas id="chart" width="0" height="0"></canvas></div>
</body>
</html>`,
      'utf8',
    );

    const command = spawnSync(
      process.execPath,
      ['scripts/validate-slides.js', '--slides-dir', slidesDir],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    assert.equal(command.status, 1);
    assert.equal(command.stderr, '');
    assert.match(command.stdout, /^slide-01\.html:error\[empty-canvas\]/m);
  } finally {
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('validate CLI passes a painted canvas chart', () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-painted-canvas-'));

  try {
    writeCanvasSlide(
      slidesDir,
      `<script>
        const context = document.getElementById('chart').getContext('2d');
        context.fillStyle = '#2563EB';
        context.fillRect(40, 40, 180, 220);
      </script>`,
    );

    const command = spawnSync(
      process.execPath,
      ['scripts/validate-slides.js', '--slides-dir', slidesDir],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );

    assert.equal(command.status, 0);
    assert.equal(command.stderr, '');
    assert.match(command.stdout, /summary: 1 slide\(s\) checked, 1 passed, 0 failed, 0 error\(s\), 0 warning\(s\)/);
  } finally {
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('validate CLI passes a sparse painted canvas line chart', () => {
  const slidesDir = mkdtempSync(path.join(tmpdir(), 'slides-grab-sparse-canvas-'));

  try {
    writeCanvasSlide(
      slidesDir,
      `<script>
        const context = document.getElementById('chart').getContext('2d');
        context.fillStyle = '#111827';
        context.fillRect(639, 319, 1, 1);
      </script>`,
    );

    const command = spawnSync(
      process.execPath,
      ['scripts/validate-slides.js', '--slides-dir', slidesDir],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );

    assert.equal(command.status, 0);
    assert.equal(command.stderr, '');
    assert.match(command.stdout, /summary: 1 slide\(s\) checked, 1 passed, 0 failed, 0 error\(s\), 0 warning\(s\)/);
  } finally {
    rmSync(slidesDir, { recursive: true, force: true });
  }
});

test('selectSlideFiles narrows validation to requested slide names', async () => {
  const slideFiles = await findSlideFiles(fixtureDeckDir);
  assert.deepEqual(selectSlideFiles(slideFiles, ['slide-03.html']), ['slide-03.html']);
  assert.deepEqual(selectSlideFiles(slideFiles, ['nested/slide-04.html']), ['slide-04.html']);
  assert.throws(() => selectSlideFiles(slideFiles, ['slide-99.html'], fixtureDeckDir), /not found/i);
});

test('validate CLI defaults to concise output', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');
  assert.match(command.stdout, /^slide-02\.html:error\[overflow-outside-frame\]/m);
  assert.match(command.stdout, /^slide-03\.html:error\[text-clipped\]/m);
  assert.match(command.stdout, /^slide-04\.html:warning\[sibling-overlap\]/m);
  assert.match(command.stdout, /^summary: 4 slide\(s\) checked, 2 passed, 2 failed, 3 error\(s\), 1 warning\(s\)$/m);
  assert.doesNotMatch(command.stdout, /^\s*\{/);
});

test('validate CLI json-full reports square frame metadata in card-news mode', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir, '--mode', 'card-news', '--format', 'json-full'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.deepEqual(payload.frame, {
    widthPt: 720,
    heightPt: 720,
    widthPx: 960,
    heightPx: 960,
  });
});

test('validate CLI json-full preserves legacy detailed result shape', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir, '--format', 'json-full'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(typeof payload.generatedAt, 'string');
  assert.deepEqual(payload.frame, {
    widthPt: 720,
    heightPt: 405,
    widthPx: 960,
    heightPx: 540,
  });
  assert.equal(payload.summary.totalSlides, 4);
  assert.equal(payload.summary.failedSlides, 2);
  assert.equal(payload.slides.length, 4);
});

test('validate CLI json emits flattened diagnostics', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir, '--format', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.summary.totalSlides, 4);
  assert.equal(payload.summary.errors, 3);
  assert.equal(payload.summary.warnings, 1);
  assert.equal(Array.isArray(payload.diagnostics), true);
  assert.equal(payload.diagnostics.length, 4);
  assert.equal('slides' in payload, false);
  assert.equal(payload.diagnostics[0].slide, 'slide-02.html');
  assert.equal(payload.diagnostics[0].severity, 'error');
});

test('validate CLI can target a single slide', () => {
  const command = spawnSync(
    process.execPath,
    [
      'scripts/validate-slides.js',
      '--slides-dir',
      fixtureDeckDir,
      '--slide',
      'slide-03.html',
      '--format',
      'json-full',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(payload.summary.totalSlides, 1);
  assert.equal(payload.summary.failedSlides, 1);
  assert.equal(payload.summary.criticalIssues, 1);
  assert.deepEqual(payload.slides.map((slide) => slide.slide), ['slide-03.html']);
});

test('slides-grab lint aliases validate output and exit code', () => {
  const command = spawnSync(
    process.execPath,
    ['bin/ppt-agent.js', 'lint', '--slides-dir', fixtureDeckDir, '--format', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(payload.summary.totalSlides, 4);
  assert.equal(payload.summary.failedSlides, 2);
  assert.equal(payload.summary.errors, 3);
});

test('slides-grab mode-aware help covers card-news CLI entrypoints', () => {
  const helpCommands = [
    ['build-viewer', /Slide mode: presentation or card-news/],
    ['validate', /Slide mode: presentation or card-news/],
    ['convert', /Slide mode: presentation or card-news/],
    ['pdf', /Slide mode: presentation or card-news/],
    ['figma', /Slide mode: presentation or card-news/],
    ['edit', /Slide mode: presentation or card-news/],
  ];

  for (const [subcommand, expectedModeLine] of helpCommands) {
    const command = spawnSync(process.execPath, ['bin/ppt-agent.js', subcommand, '--help'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(command.status, 0, `${subcommand} --help should exit cleanly`);
    assert.equal(command.stderr, '');
    assert.match(command.stdout, new RegExp(`slides-grab ${subcommand}`));
    assert.match(command.stdout, expectedModeLine);
    assert.match(command.stdout, /card-news/);
  }
});
