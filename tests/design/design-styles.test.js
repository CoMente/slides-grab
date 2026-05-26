import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DESIGN_STYLES_SOURCE,
  buildStylePreviewHtml,
  getDesignStyle,
  getPreviewHtmlPath,
  listDesignStyles,
} from '../../src/design-styles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(repoRoot, 'bin', 'ppt-agent.js');

function makeWorkspace(prefix = 'slides-grab-style-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test('bundled design styles preserve upstream citation metadata', () => {
  const styles = listDesignStyles();

  assert.equal(styles.length, 95);
  assert.equal(styles[0].id, 'glassmorphism');
  assert.equal(styles[0].source.repo, 'corazzon/pptx-design-styles');
  assert.equal(DESIGN_STYLES_SOURCE.repo, 'corazzon/pptx-design-styles');
  assert.match(DESIGN_STYLES_SOURCE.url, /corazzon\/pptx-design-styles/);
});

test('design-diversity PPT packs are bundled as selectable slide design styles', () => {
  const styles = listDesignStyles();
  const pack = getDesignStyle('ppt-consulting-precision-grid');

  assert.ok(pack);
  assert.equal(pack.title, '컨설팅 정밀그리드');
  assert.equal(pack.source.repo, 'epoko77-ai/design-diversity');
  assert.equal(pack.source.license, 'MIT');
  assert.match(pack.source.url, /epoko77-ai\/design-diversity/);
  assert.match(pack.mood, /mono/);
  assert.match(pack.bestFor, /consulting-grid/);
  assert.ok(pack.background.some((entry) => entry.includes('#FFFFFF')));
  assert.ok(pack.colors.some((color) => color.hex === '#0B5FFF'));
  assert.ok(pack.fonts.some((font) => font.includes('Arial')));
  assert.ok(pack.layout.some((entry) => entry.includes('grid_columns: 12')));
  assert.ok(pack.signature.some((entry) => entry.includes('액션 타이틀')));
  assert.ok(pack.avoid.some((entry) => entry.includes('무지개')));
  assert.ok(styles.some((style) => style.id === 'ppt-altezza-ultramodern-keynote'));
});

test('legacy themes are included as styles 31–35', () => {
  const originalStyles = listDesignStyles().filter((style) => Number(style.number) >= 31 && Number(style.number) <= 35);
  const ids = originalStyles.map((s) => s.id);

  assert.ok(ids.includes('executive-minimal'));
  assert.ok(ids.includes('sage-professional'));
  assert.ok(ids.includes('modern-dark'));
  assert.ok(ids.includes('corporate-blue'));
  assert.ok(ids.includes('warm-neutral'));
  for (const style of originalStyles) {
    assert.equal(style.source.repo, 'NomaDamas/slides-grab');
    assert.match(style.source.citation, /slides-grab original/i);
  }
});

test('bundled preview html file exists and identifies the expanded style catalog', () => {
  const previewPath = getPreviewHtmlPath();
  assert.ok(existsSync(previewPath));

  const html = buildStylePreviewHtml();
  assert.match(html, /95/);
  assert.match(html, /GLASSMORPHISM/i);
  assert.match(html, /EXECUTIVE MINIMAL/i);
  assert.match(html, /CORPORATE BLUE/i);
  assert.match(html, /design-diversity/i);
  assert.match(html, /corazzon\/pptx-design-styles/);
});

test('bundled preview html maps every runtime style by exact id or title', () => {
  const html = buildStylePreviewHtml();

  for (const style of listDesignStyles()) {
    assert.ok(
      html.includes(style.id) || html.includes(style.title),
      `preview.html should include exact id or title for ${style.id} (${style.title})`,
    );
  }
});

test('design-diversity style guidance avoids direct gradient implementation instructions', () => {
  const directGradientPatterns = [
    /linear-gradient/i,
    /full-bleed\s+[^\n]*mesh gradient/i,
    /gradient vertical fill/i,
    /gradient arcs/i,
    /gradient fade area/i,
  ];

  for (const style of listDesignStyles().filter((entry) => entry.collection === 'design-diversity')) {
    const guidance = [
      ...style.background,
      ...style.layout,
      ...style.signature,
      ...style.avoid,
    ].join('\n');

    for (const pattern of directGradientPatterns) {
      assert.doesNotMatch(
        guidance,
        pattern,
        `${style.id} should describe rasterized gradient assets or flat tokens instead of direct gradient implementation guidance`,
      );
    }
  }
});

test('design-diversity style specs include required agent-facing guidance arrays', () => {
  const requiredGuidanceFields = ['background', 'colors', 'fonts', 'layout', 'signature', 'avoid'];

  for (const style of listDesignStyles().filter((entry) => entry.collection === 'design-diversity')) {
    for (const field of requiredGuidanceFields) {
      assert.ok(
        Array.isArray(style[field]) && style[field].length > 0,
        `${style.id} should include non-empty ${field} guidance`,
      );
    }
  }
});

test('slides-grab help exposes style discovery commands', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  assert.match(output, /list-styles/);
  assert.match(output, /preview-styles/);
});

test('slides-grab preview-styles prints the bundled preview path', () => {
  const output = execFileSync(
    process.execPath,
    [cliPath, 'preview-styles'],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
    },
  );

  assert.match(output, /preview\.html/);
});

test('slides-grab list-styles shows all bundled styles including design-diversity packs', () => {
  const workspace = makeWorkspace();

  try {
    const output = execFileSync(process.execPath, [cliPath, 'list-styles'], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    assert.match(output, /glassmorphism/);
    assert.match(output, /ppt-consulting-precision-grid/);
    assert.match(output, /ppt-altezza-ultramodern-keynote/);
    assert.match(output, /modern-dark/);
    assert.match(output, /Total: 95 styles/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab show-design prints a design-diversity pack summary', () => {
  const output = execFileSync(
    process.execPath,
    [cliPath, 'show-design', 'ppt-consulting-precision-grid'],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
    },
  );

  assert.match(output, /Bundled style: 컨설팅 정밀그리드/);
  assert.match(output, /epoko77-ai\/design-diversity/);
  assert.match(output, /#0B5FFF/);
  assert.match(output, /grid_columns: 12/);
  assert.match(output, /## Signature/);
  assert.match(output, /액션 타이틀/);
  assert.match(output, /## Avoid/);
  assert.match(output, /무지개/);
});

test('slides-grab show-design reports slides-grab original source metadata', () => {
  const output = execFileSync(
    process.execPath,
    [cliPath, 'show-design', 'executive-minimal'],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
    },
  );

  assert.match(output, /Bundled style: Executive Minimal/);
  assert.match(output, /Source: NomaDamas\/slides-grab/);
  assert.doesNotMatch(output, /Source: corazzon\/pptx-design-styles/);
});
