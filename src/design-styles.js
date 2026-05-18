import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAW_DESIGN_STYLES } from './design-styles-data.js';
import { parseDesignMarkdownFile } from './design-md-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DESIGN_STYLES_SOURCE = Object.freeze({
  name: 'PPT Design Collections',
  repo: 'corazzon/pptx-design-styles',
  url: 'https://github.com/corazzon/pptx-design-styles',
  previewUrl: 'https://corazzon.github.io/pptx-design-styles/preview/modern-pptx-designs-30.html',
  references: [
    'README.md',
    'preview/modern-pptx-designs-30.html',
    'references/styles.md',
  ],
  license: 'MIT',
  citation: 'Design collections derived from corazzon/pptx-design-styles. Styles 31–35 are slides-grab originals.',
});

const DESIGN_STYLES = RAW_DESIGN_STYLES.map((style) => Object.freeze({
  ...style,
  source: DESIGN_STYLES_SOURCE,
}));

const DESIGN_STYLES_BY_ID = new Map(DESIGN_STYLES.map((style) => [style.id, style]));

export function listDesignStyles() {
  return DESIGN_STYLES;
}

export function getDesignStyle(styleId) {
  if (!styleId) {
    return null;
  }
  return DESIGN_STYLES_BY_ID.get(styleId) ?? null;
}

export function requireDesignStyle(styleId) {
  const style = getDesignStyle(styleId);
  if (!style) {
    throw new Error(`Unknown style "${styleId}". Run "slides-grab list-styles" to inspect the bundled collection.`);
  }
  return style;
}

export function getPreviewHtmlPath() {
  return resolve(__dirname, '..', 'templates', 'design-styles', 'preview.html');
}

export function buildStylePreviewHtml() {
  return readFileSync(getPreviewHtmlPath(), 'utf-8');
}

export const SLIDE_DESIGN_FILENAME = 'DESIGN.slides.md';
export const WEB_DESIGN_FILENAME = 'DESIGN.md';

export function isDesignMarkdownRef(styleRef) {
  if (typeof styleRef !== 'string') return false;
  const trimmed = styleRef.trim();
  if (trimmed === '') return false;
  if (trimmed.toLowerCase().endsWith('.md')) return true;
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) return true;
  if (isAbsolute(trimmed)) return true;
  return false;
}

export function resolveDesignMarkdownPath(styleRef, { baseDir = process.cwd() } = {}) {
  if (!isDesignMarkdownRef(styleRef)) return null;
  const candidate = isAbsolute(styleRef) ? styleRef : resolve(baseDir, styleRef);
  if (!existsSync(candidate)) {
    throw new Error(`DESIGN.md reference not found at ${candidate}`);
  }
  if (basename(candidate) === WEB_DESIGN_FILENAME) {
    const siblingSlideDesign = resolve(dirname(candidate), SLIDE_DESIGN_FILENAME);
    if (existsSync(siblingSlideDesign)) return siblingSlideDesign;
  }
  return candidate;
}

export function loadDesignStyleRef(styleRef, options = {}) {
  if (!styleRef) return null;
  if (isDesignMarkdownRef(styleRef)) {
    const path = resolveDesignMarkdownPath(styleRef, options);
    return parseDesignMarkdownFile(path);
  }
  return requireDesignStyle(styleRef);
}

export function findLocalDesignMarkdown({ baseDir = process.cwd() } = {}) {
  const detection = detectLocalDesignMarkdown({ baseDir });
  return detection.path;
}

export function detectLocalDesignMarkdown({ baseDir = process.cwd() } = {}) {
  const slideCandidate = resolve(baseDir, SLIDE_DESIGN_FILENAME);
  const webCandidate = resolve(baseDir, WEB_DESIGN_FILENAME);
  const slideExists = existsSync(slideCandidate);
  const webExists = existsSync(webCandidate);
  if (slideExists) {
    return {
      path: slideCandidate,
      kind: 'slides',
      slidePath: slideCandidate,
      webPath: webExists ? webCandidate : null,
    };
  }
  if (webExists) {
    return {
      path: webCandidate,
      kind: 'web',
      slidePath: null,
      webPath: webCandidate,
    };
  }
  return { path: null, kind: null, slidePath: null, webPath: null };
}
