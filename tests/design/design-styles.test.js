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
  listSelectableDesignStyles,
} from '../../src/design-styles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(repoRoot, 'bin', 'ppt-agent.js');

function makeWorkspace(prefix = 'slides-grab-style-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test('bundled design styles preserve upstream citation metadata', () => {
  const styles = listDesignStyles();

  assert.equal(styles.length, 95);
  const selectable = listSelectableDesignStyles();
  assert.equal(selectable.length, 92);
  assert.ok(!selectable.some((s) => s.classification === 'source-alias'));
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
    /mesh-gradient/i,
    /full-bleed\s+[^\n]*mesh gradient/i,
    /gradient vertical fill/i,
    /gradient arcs/i,
    /gradient fade area/i,
    /gradient(?:[-\w\s]{0,40})\b(?:fill|fills|border|borders|arrow|arrows|beam|base line|dot|dots|text|arc|arcs|line|stroke|bar|chip|badge|bubble|number|pill|progress bar|glowing left bar)/i,
    /(?:prism-)?gradient-text/i,
    /gradient_a(?! asset)/i,
    /gradients? allowed/i,
    /gradient\s+\d+% alpha/i,
    /(?:radial|vertical) gradient/i,
    /vertical gradient sequence/i,
    /그라디언트\s*(?:채움|fill|화살표|테두리|라인|텍스트)/i,
    /그라데이션\s*(?:채움|fill|화살표|테두리|라인|텍스트)/i,
    /그라디언트(?:를|로)?\s*[^\n]*(?:깔|발광|스트로크|커넥터|윤곽선|주인공)/i,
    /그라데이션(?:을|으로)?\s*[^\n]*(?:깔|발광|스트로크|커넥터|윤곽선|주인공)/i,
    /그라디언트(?:가)?\s*[^\n]*(?:채우|안개)/i,
    /그라데이션(?:이)?\s*[^\n]*(?:채우|안개)/i,
    /(?:다색|배경)[^\n]{0,30}그라디언트/i,
    /(?:다색|배경)[^\n]{0,30}그라데이션/i,
  ];
  const assetOrFallbackQualifierPatterns = [
    /\b(?:rasterized(?:\/svg|(?: png)?)?|png\/sharp|png|sharp|svg\/local[- ]asset|svg[- ]local[- ]asset|local[- ]asset|image asset)\b[\w\s\/-]{0,40}\b(?:gradient|duotone|prism|radial|mesh|vertical|fill|border|arrow|beam|line|dot|text|arc|bar|chip|badge|bubble|pill|progress|mesh-gradient)\b[\w\s\/-]{0,40}\b(?:asset|image|effect|fallback)\b/i,
    /\b(?:gradient|duotone|prism|radial|mesh|vertical|fill|border|arrow|beam|line|dot|text|arc|bar|chip|badge|bubble|pill|progress)\b[^;,]{0,80}\b(?:as|uses?|using|render(?:ed)? as|with)\b[^;,]{0,40}\b(?:rasterized|png\/sharp|png|sharp|svg\/local[- ]asset|svg[- ]local[- ]asset|local[- ]asset|flat[- ]token fallback|solid fallback)\b/i,
    /\b(?:flat[- ]token fallback|flat token|solid fallback)\b[^;,]{0,80}\b(?:gradient|duotone|prism|radial|mesh|vertical|fill|border|arrow|beam|line|dot|text|arc|bar|chip|badge|bubble|pill|progress)\b/i,
  ];

  const qualifiedExamples = [
    'gradient fill as rasterized PNG asset with flat-token fallback',
    'gradient arrows as SVG/local asset; no CSS gradients',
    'radial gradient as rasterized PNG asset with solid fallback',
  ];
  const unqualifiedExamples = [
    'gradient fill; no CSS gradients',
    'mesh-gradient',
    'gradient_a',
    'gradient 20% alpha',
    '그라디언트 화살표',
    'gradient fill; decorative icon should be SVG',
    'gradient fill and decorative SVG icon',
    'gradient fill and decorative PNG icon',
    'gradient fill and decorative Sharp icon',
    'SVG icon before gradient fill',
    'PNG icon before gradient fill',
    'Sharp icon before gradient fill',
    '그라디언트 화살표; 장식 아이콘은 SVG 사용',
    '그라디언트 fill 및 SVG 아이콘',
    '배경은 항상 다색 그라디언트',
  ];

  const hasQualifiedGradientGuidance = (entry) => {
    for (const pattern of directGradientPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(entry);
      if (!match) continue;

      const windowStart = Math.max(0, match.index - 48);
      const nextSeparator = entry.slice(match.index).search(/[;,]|\s[-–—]\s/);
      const phraseEnd = nextSeparator >= 0 ? match.index + nextSeparator : entry.length;
      const windowEnd = Math.min(phraseEnd, match.index + match[0].length + 96);
      const localGradientPhrase = entry.slice(windowStart, windowEnd);

      if (!assetOrFallbackQualifierPatterns.some((qualifierPattern) => qualifierPattern.test(localGradientPhrase))) {
        return false;
      }
    }

    return true;
  };

  for (const entry of qualifiedExamples) {
    assert.ok(
      directGradientPatterns.some((pattern) => pattern.test(entry)) && hasQualifiedGradientGuidance(entry),
      `${entry} should be treated as qualified gradient guidance`,
    );
  }

  for (const entry of unqualifiedExamples) {
    assert.ok(
      directGradientPatterns.some((pattern) => pattern.test(entry)) && !hasQualifiedGradientGuidance(entry),
      `${entry} should be treated as unqualified gradient guidance`,
    );
  }

  for (const style of listDesignStyles().filter((entry) => entry.collection === 'design-diversity')) {
    const prescriptiveEntries = [
      ...style.background,
      ...style.layout,
      ...style.signature,
      ...style.avoid,
    ];
    for (const entry of prescriptiveEntries) {
      for (const pattern of directGradientPatterns) {
        if (!pattern.test(entry)) continue;

        assert.ok(
          hasQualifiedGradientGuidance(entry),
          `${style.id} has unqualified prescriptive gradient guidance: ${entry}`,
        );
      }
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
    assert.match(output, /Total: 92 selectable styles/);
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
test('design-diversity direct duplicates are classified as source-alias and hidden from selectable', () => {
  const aliases = [
    ['ppt-glassmorphism', 'glassmorphism'],
    ['ppt-neo-brutalism', 'neo-brutalism'],
    ['ppt-editorial-magazine', 'editorial-magazine'],
  ];

  for (const [slug, builtin] of aliases) {
    const alias = listDesignStyles().find((s) => s.id === slug);
    assert.ok(alias);
    assert.equal(alias.classification, 'source-alias');
    assert.equal(alias.aliasOf, builtin);

    const resolved = getDesignStyle(slug);
    assert.ok(resolved);
    assert.equal(resolved.id, builtin);
    assert.equal(resolved.classification, 'builtin');

    const b = getDesignStyle(builtin);
    assert.ok(b);
    assert.ok(Array.isArray(b.aliases) && b.aliases.includes(slug));

    assert.ok(!listSelectableDesignStyles().some((s) => s.id === slug));
  }
});

test('design-diversity near-duplicates are source-variant with relatedStyleIds referencing existing builtins', () => {
  for (const style of listDesignStyles().filter((s) => s.classification === 'source-variant')) {
    assert.ok(style.relatedStyleIds.length > 0);
    for (const id of style.relatedStyleIds) {
      const t = getDesignStyle(id);
      assert.ok(t, `related ${id} must exist`);
      assert.equal(t.classification, 'builtin');
    }
  }
  assert.equal(getDesignStyle('ppt-consulting-precision-grid').classification, 'source-variant');
  const expectedVariants = [
    'ppt-memphis-retro-90s',
    'ppt-botanical-organic',
    'ppt-print-first-newspaper',
    'ppt-expressive-soundwave-deck',
    'ppt-cinematic-keynote-deck',
  ];
  for (const id of expectedVariants) {
    assert.equal(getDesignStyle(id).classification, 'source-variant');
  }
});

test('every design-diversity pack has a classification and no web-track packs are bundled', () => {
  for (const style of listDesignStyles()) {
    assert.ok(['builtin', 'source-alias', 'source-variant', 'source-new'].includes(style.classification));
    assert.ok(!style.id.startsWith('web-'));
  }
});

test('net-new design-diversity packs are classified source-new', () => {
  assert.equal(getDesignStyle('ppt-altezza-ultramodern-keynote').classification, 'source-new');
});

test('slides-grab list-styles --all shows all resolvable styles including aliases', () => {
  const workspace = makeWorkspace();

  try {
    const output = execFileSync(process.execPath, [cliPath, 'list-styles', '--all'], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    assert.match(output, /Total: 95 resolvable styles/);
    assert.match(output, /ppt-glassmorphism/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
