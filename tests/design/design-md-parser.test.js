import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  parseDesignMarkdown,
  parseYamlFrontMatter,
  splitFrontMatter,
  extractSections,
  renderDesignStyleForPrompt,
} from '../../src/design-md-parser.js';
import {
  fetchDesignMarkdown,
  formatImportedDesignMarkdown,
  validateDesignUrl,
  DesignImportError,
} from '../../src/design-import.js';
import {
  isDesignMarkdownRef,
  loadDesignStyleRef,
} from '../../src/design-styles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(repoRoot, 'bin', 'ppt-agent.js');

const SAMPLE_DESIGN_MD = `---
version: alpha
name: Sample Brand
description: A clean modernist look for tests.
colors:
  primary: "#FF2D55"
  surface: "#FFFFFF"
---

## Overview
Sample Brand is a bold modernist palette built for demos.

## Colors
- Primary: Hot pink \`#FF2D55\`
- Surface: Pure white \`#FFFFFF\`
- Accent: Lemon \`#F5F500\`

## Typography
- Display: **Pretendard Black**, 48-56pt
- Body: **Pretendard**, 14-16pt

## Layout
- Card-based with 24pt grid
- Maximum two columns

## Signature Elements
- Hard offset shadow (no blur)

## Do's and Don'ts
- Avoid gradients
- Avoid soft shadows
`;

test('parseYamlFrontMatter handles nested mappings and scalars', () => {
  const fm = parseYamlFrontMatter([
    'name: Test',
    'version: alpha',
    'colors:',
    '  primary: "#FF2D55"',
    '  surface: "#FFFFFF"',
  ].join('\n'));
  assert.equal(fm.name, 'Test');
  assert.equal(fm.version, 'alpha');
  assert.deepEqual(fm.colors, { primary: '#FF2D55', surface: '#FFFFFF' });
});

test('splitFrontMatter separates fence from body', () => {
  const { frontMatter, body } = splitFrontMatter(SAMPLE_DESIGN_MD);
  assert.ok(frontMatter.includes('name: Sample Brand'));
  assert.ok(body.trim().startsWith('## Overview'));
});

test('extractSections buckets canonical section headings', () => {
  const { body } = splitFrontMatter(SAMPLE_DESIGN_MD);
  const sections = extractSections(body);
  assert.ok(sections.overview);
  assert.ok(sections.colors);
  assert.ok(sections.fonts);
  assert.ok(sections.layout);
  assert.ok(sections.signature);
  assert.ok(sections.dosdonts || sections.avoid);
});

test('parseDesignMarkdown produces a slides-grab-style design object', () => {
  const style = parseDesignMarkdown(SAMPLE_DESIGN_MD, { idHint: 'sample' });
  assert.equal(style.id, 'sample');
  assert.equal(style.title, 'Sample Brand');
  assert.ok(style.colors.length >= 3);
  const hexes = style.colors.map((c) => c.hex.toUpperCase());
  assert.ok(hexes.includes('#FF2D55'));
  assert.ok(hexes.includes('#FFFFFF'));
  assert.ok(hexes.includes('#F5F500'));
  assert.ok(style.fonts.some((f) => f.toLowerCase().includes('pretendard')));
  assert.ok(style.signature.some((s) => s.toLowerCase().includes('hard offset shadow')));
  assert.ok(style.avoid.some((a) => a.toLowerCase().includes('gradient')));
  assert.equal(style.source.type, 'design-md');
});

test('renderDesignStyleForPrompt produces a stable agent-facing markdown block', () => {
  const style = parseDesignMarkdown(SAMPLE_DESIGN_MD, { idHint: 'sample' });
  const rendered = renderDesignStyleForPrompt(style);
  assert.match(rendered, /Design System: Sample Brand/);
  assert.match(rendered, /## Colors/);
  assert.match(rendered, /#FF2D55/);
});

test('validateDesignUrl rejects non-https URLs', () => {
  assert.throws(() => validateDesignUrl('http://example.com/DESIGN.md'), DesignImportError);
  assert.throws(() => validateDesignUrl('file:///etc/passwd'), DesignImportError);
  const url = validateDesignUrl('https://example.com/DESIGN.md');
  assert.equal(url.protocol, 'https:');
});

test('fetchDesignMarkdown enforces byte limit', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'text/markdown']]),
    arrayBuffer: async () => new Uint8Array(300).buffer,
  });
  await assert.rejects(
    fetchDesignMarkdown('https://example.com/big.md', { fetchImpl: fakeFetch, maxBytes: 100 }),
    /exceeds max size/,
  );
});

test('fetchDesignMarkdown returns text + metadata on success', async () => {
  const payload = new TextEncoder().encode('# hello\n');
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'text/markdown; charset=utf-8']]),
    arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  });
  const result = await fetchDesignMarkdown('https://example.com/x.md', {
    fetchImpl: fakeFetch,
    maxBytes: 1024,
  });
  assert.equal(result.text, '# hello\n');
  assert.equal(result.bytes, 8);
  assert.ok(result.fetchedAt);
});

test('formatImportedDesignMarkdown prepends provenance banner', () => {
  const out = formatImportedDesignMarkdown({
    url: 'https://example.com/d.md',
    content: '# body\n',
    fetchedAt: '2026-05-15T00:00:00Z',
  });
  assert.match(out, /Imported by slides-grab import-design/);
  assert.match(out, /https:\/\/example.com\/d\.md/);
  assert.match(out, /# body/);
});

test('isDesignMarkdownRef detects .md paths', () => {
  assert.equal(isDesignMarkdownRef('./DESIGN.md'), true);
  assert.equal(isDesignMarkdownRef('DESIGN.md'), true);
  assert.equal(isDesignMarkdownRef('/abs/DESIGN.md'), true);
  assert.equal(isDesignMarkdownRef('glassmorphism'), false);
  assert.equal(isDesignMarkdownRef(''), false);
  assert.equal(isDesignMarkdownRef(null), false);
});

test('loadDesignStyleRef parses a local DESIGN.md file', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-designmd-'));
  try {
    const designPath = path.join(workspace, 'DESIGN.md');
    writeFileSync(designPath, SAMPLE_DESIGN_MD, 'utf8');
    const style = loadDesignStyleRef('./DESIGN.md', { baseDir: workspace });
    assert.equal(style.source.type, 'design-md');
    assert.equal(style.title, 'Sample Brand');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('loadDesignStyleRef falls back to bundled style id', () => {
  const style = loadDesignStyleRef('glassmorphism');
  assert.equal(style.id, 'glassmorphism');
});

test('slides-grab CLI exposes import-design and show-design commands', () => {
  const output = execFileSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  assert.match(output, /import-design/);
  assert.match(output, /show-design/);
});

test('slides-grab show-design prints parsed DESIGN.md sections', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-cli-designmd-'));
  try {
    const designPath = path.join(workspace, 'DESIGN.md');
    writeFileSync(designPath, SAMPLE_DESIGN_MD, 'utf8');
    const output = execFileSync(process.execPath, [cliPath, 'show-design', './DESIGN.md'], {
      cwd: workspace,
      encoding: 'utf-8',
    });
    assert.match(output, /Sample Brand/);
    assert.match(output, /#FF2D55/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildCodexEditPrompt injects DESIGN.md when present in baseDir, with web-flavored warning header', async () => {
  const { buildCodexEditPrompt } = await import('../../src/editor/codex-edit.js');
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-prompt-designmd-'));
  try {
    writeFileSync(path.join(workspace, 'DESIGN.md'), SAMPLE_DESIGN_MD, 'utf8');
    const prompt = buildCodexEditPrompt({
      slideFile: 'slide-01.html',
      userPrompt: 'tweak headline',
      selections: [{ bbox: { x: 0, y: 0, width: 100, height: 50 }, targets: [] }],
      designBaseDir: workspace,
    });
    assert.match(prompt, /DESIGN\.md, web-flavored/);
    assert.match(prompt, /DO NOT carry over web-only patterns/);
    assert.match(prompt, /Sample Brand/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('buildCodexEditPrompt prefers DESIGN.slides.md over DESIGN.md when both exist', async () => {
  const { buildCodexEditPrompt } = await import('../../src/editor/codex-edit.js');
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-prompt-slides-md-'));
  try {
    const SLIDES_FLAVORED_MD = SAMPLE_DESIGN_MD
      .replace('name: Sample Brand', 'name: Slide Flavored Brand')
      .replace('Sample Brand is a bold', 'Slide Flavored Brand is a bold');
    writeFileSync(path.join(workspace, 'DESIGN.md'), SAMPLE_DESIGN_MD, 'utf8');
    writeFileSync(path.join(workspace, 'DESIGN.slides.md'), SLIDES_FLAVORED_MD, 'utf8');
    const prompt = buildCodexEditPrompt({
      slideFile: 'slide-01.html',
      userPrompt: 'tweak headline',
      selections: [{ bbox: { x: 0, y: 0, width: 100, height: 50 }, targets: [] }],
      designBaseDir: workspace,
    });
    assert.match(prompt, /DESIGN\.slides\.md, slide-flavored/);
    assert.match(prompt, /Slide Flavored Brand/);
    assert.doesNotMatch(prompt, /Sample Brand/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('detectLocalDesignMarkdown reports kind and shadowed sibling', async () => {
  const { detectLocalDesignMarkdown } = await import('../../src/design-styles.js');
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-detect-'));
  try {
    assert.equal(detectLocalDesignMarkdown({ baseDir: workspace }).kind, null);

    writeFileSync(path.join(workspace, 'DESIGN.md'), SAMPLE_DESIGN_MD, 'utf8');
    const webOnly = detectLocalDesignMarkdown({ baseDir: workspace });
    assert.equal(webOnly.kind, 'web');
    assert.ok(webOnly.path.endsWith('DESIGN.md'));
    assert.equal(webOnly.slidePath, null);

    writeFileSync(path.join(workspace, 'DESIGN.slides.md'), SAMPLE_DESIGN_MD, 'utf8');
    const bothPresent = detectLocalDesignMarkdown({ baseDir: workspace });
    assert.equal(bothPresent.kind, 'slides');
    assert.ok(bothPresent.path.endsWith('DESIGN.slides.md'));
    assert.ok(bothPresent.webPath && bothPresent.webPath.endsWith('DESIGN.md'));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab show-design <directory> picks DESIGN.slides.md and notes shadowed DESIGN.md', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-cli-precedence-'));
  try {
    const SLIDES_FLAVORED_MD = SAMPLE_DESIGN_MD.replace('name: Sample Brand', 'name: Slide Flavored Brand');
    writeFileSync(path.join(workspace, 'DESIGN.md'), SAMPLE_DESIGN_MD, 'utf8');
    writeFileSync(path.join(workspace, 'DESIGN.slides.md'), SLIDES_FLAVORED_MD, 'utf8');
    const output = execFileSync(process.execPath, [cliPath, 'show-design', workspace], {
      cwd: workspace,
      encoding: 'utf-8',
    });
    assert.match(output, /Active file: DESIGN\.slides\.md/);
    assert.match(output, /DESIGN\.md is also present.*shadowed/);
    assert.match(output, /Slide Flavored Brand/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab show-design <directory> with only DESIGN.md suggests conversion', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'slides-grab-cli-webonly-'));
  try {
    writeFileSync(path.join(workspace, 'DESIGN.md'), SAMPLE_DESIGN_MD, 'utf8');
    const output = execFileSync(process.execPath, [cliPath, 'show-design', workspace], {
      cwd: workspace,
      encoding: 'utf-8',
    });
    assert.match(output, /Active file: DESIGN\.md/);
    assert.match(output, /Consider converting it to DESIGN\.slides\.md/);
    assert.match(output, /Sample Brand/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
