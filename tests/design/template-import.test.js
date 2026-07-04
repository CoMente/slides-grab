import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  TEMPLATE_PACK_RELATIVE_PATH,
  loadTemplatePackFromSlidesDir,
} from '../../src/template-pack.js';
import {
  TemplateImportError,
  detectTemplateSourceType,
  importTemplatePack,
  parseImportTemplateArgs,
} from '../../src/template-import.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(repoRoot, 'bin', 'ppt-agent.js');
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function makeWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'slides-grab-import-template-'));
}

test('parseImportTemplateArgs accepts one or more inputs and slides-dir', () => {
  const parsed = parseImportTemplateArgs([
    '--input', 'brand.html',
    '--input', 'chart.png',
    '--slides-dir', 'slides',
    '--name', 'Brand Pack',
  ]);

  assert.deepEqual(parsed.inputs, ['brand.html', 'chart.png']);
  assert.equal(parsed.slidesDir, 'slides');
  assert.equal(parsed.name, 'Brand Pack');
});

test('detectTemplateSourceType classifies supported source files and rejects unknown types', () => {
  assert.equal(detectTemplateSourceType('deck.pptx'), 'pptx');
  assert.equal(detectTemplateSourceType('deck.pdf'), 'pdf');
  assert.equal(detectTemplateSourceType('slide.html'), 'html');
  assert.equal(detectTemplateSourceType('ref.PNG'), 'image');
  assert.throws(
    () => detectTemplateSourceType('notes.txt'),
    /Unsupported template source type/,
  );
});

test('importTemplatePack writes a template pack and previews for HTML and image fixtures', async () => {
  const workspace = makeWorkspace();
  try {
    const htmlPath = path.join(workspace, 'brand-cover.html');
    const imagePath = path.join(workspace, 'hero.png');
    const slidesDir = path.join(workspace, 'slides');
    writeFileSync(htmlPath, [
      '<!doctype html><html><head><style>',
      'body { font-family: Pretendard; color: #123456; background: #ffffff; }',
      '.title { position: absolute; left: 40px; top: 80px; width: 420px; height: 90px; }',
      '.subtitle { position: absolute; left: 40px; top: 180px; width: 360px; height: 40px; }',
      '</style></head><body><h1 class="title">Quarterly Strategy</h1><p class="subtitle">Three proof points</p></body></html>',
    ].join(''), 'utf8');
    writeFileSync(imagePath, PNG_1X1);

    const result = await importTemplatePack({
      inputs: [htmlPath, imagePath],
      slidesDir,
      name: 'Fixture Brand',
      now: () => new Date('2026-07-04T00:00:00.000Z'),
    });

    assert.equal(result.packPath, path.join(slidesDir, TEMPLATE_PACK_RELATIVE_PATH));
    assert.ok(existsSync(result.packPath));
    assert.ok(result.previewPaths.length >= 2);
    for (const previewPath of result.previewPaths) {
      assert.ok(existsSync(previewPath), `missing preview ${previewPath}`);
    }

    const pack = loadTemplatePackFromSlidesDir(slidesDir);
    assert.equal(pack.name, 'Fixture Brand');
    assert.deepEqual(pack.sourceMetadata.sourceTypes.sort(), ['html', 'image']);
    assert.ok(pack.designTokens.colors.some((color) => color.value === '#123456'));
    assert.ok(pack.designTokens.fonts.some((font) => String(font.family).includes('Pretendard')));
    assert.ok(pack.layouts.some((layout) => layout.layoutKind === 'cover'));
    const coverLayout = pack.layouts.find((layout) => layout.layoutKind === 'cover');
    assert.ok(coverLayout.fields.some((field) => field.role === 'subtitle'));
    assert.ok(pack.layouts.every((layout) => layout.preview?.startsWith('.slides-grab/template-previews/')));
    assert.match(pack.promptSafeStyleSummary, /Fixture Brand/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('importTemplatePack accepts a directory of reference examples', async () => {
  const workspace = makeWorkspace();
  try {
    const examplesDir = path.join(workspace, 'examples');
    const slidesDir = path.join(workspace, 'slides');
    mkdirSync(examplesDir, { recursive: true });
    writeFileSync(path.join(examplesDir, 'cover.html'), '<style>body{color:#112233;font-family:Pretendard}</style><h1>Cover</h1>', 'utf8');
    writeFileSync(path.join(examplesDir, 'hero.png'), PNG_1X1);
    writeFileSync(path.join(examplesDir, 'ignore.txt'), 'not imported', 'utf8');

    const result = await importTemplatePack({
      inputs: [examplesDir],
      slidesDir,
      name: 'Directory Pack',
      now: () => new Date('2026-07-04T00:00:00.000Z'),
    });

    assert.equal(result.previewPaths.length, 2);
    const pack = loadTemplatePackFromSlidesDir(slidesDir);
    assert.equal(pack.name, 'Directory Pack');
    assert.deepEqual(pack.sourceMetadata.sourceTypes.sort(), ['html', 'image']);
    assert.ok(pack.sourceMetadata.originalFiles.includes('cover.html'));
    assert.ok(pack.sourceMetadata.originalFiles.includes('hero.png'));
    assert.ok(pack.sourceMetadata.warnings.some((warning) => warning.includes('ignore.txt')));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('importTemplatePack surfaces useful unsupported source errors', async () => {
  const workspace = makeWorkspace();
  try {
    const slidesDir = path.join(workspace, 'slides');
    const unsupportedPath = path.join(workspace, 'notes.txt');
    writeFileSync(unsupportedPath, 'not a slide source', 'utf8');

    await assert.rejects(
      importTemplatePack({ inputs: [unsupportedPath], slidesDir }),
      (error) => error instanceof TemplateImportError && /Unsupported template source type/.test(error.message),
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab import-template CLI writes a loadable template pack', () => {
  const workspace = makeWorkspace();
  try {
    const htmlPath = path.join(workspace, 'brand.html');
    const slidesDir = path.join(workspace, 'slides');
    writeFileSync(htmlPath, '<html><body><h1 style="color:#445566;font-family:Pretendard">Brand</h1></body></html>', 'utf8');

    const output = execFileSync(process.execPath, [
      cliPath,
      'import-template',
      '--input', htmlPath,
      '--slides-dir', slidesDir,
      '--name', 'CLI Brand',
    ], {
      cwd: workspace,
      encoding: 'utf8',
    });

    assert.match(output, /Saved template pack/);
    assert.match(output, /template-pack\.json/);
    const pack = loadTemplatePackFromSlidesDir(slidesDir);
    assert.equal(pack.name, 'CLI Brand');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab help exposes import-template', () => {
  const output = execFileSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.match(output, /import-template/);
});
