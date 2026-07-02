import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESIGN_DIVERSITY_SOURCE, RAW_DESIGN_DIVERSITY_STYLES } from './design-diversity-data.js';
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

export const SLIDES_GRAB_ORIGINAL_STYLES_SOURCE = Object.freeze({
  name: 'slides-grab original styles',
  repo: 'NomaDamas/slides-grab',
  url: 'https://github.com/NomaDamas/slides-grab',
  license: 'MIT',
  citation: 'slides-grab original bundled styles 31–35.',
});

function getStyleSource(style) {
  if (style.source) return style.source;
  if (style.collection === 'design-diversity') return DESIGN_DIVERSITY_SOURCE;
  const styleNumber = Number(style.number);
  if (styleNumber >= 31 && styleNumber <= 35) return SLIDES_GRAB_ORIGINAL_STYLES_SOURCE;
  return DESIGN_STYLES_SOURCE;
}

const DESIGN_DIVERSITY_ALIAS_MAP = {
  'ppt-glassmorphism': 'glassmorphism',
  'ppt-neo-brutalism': 'neo-brutalism',
  'ppt-editorial-magazine': 'editorial-magazine',
};

const DESIGN_DIVERSITY_RELATED_MAP = {
  'ppt-consulting-precision-grid': ['swiss-international-style', 'executive-minimal', 'corporate-blue'],
  'ppt-mckinsey-ghost-deck': ['swiss-international-style', 'executive-minimal'],
  'ppt-bcg-exhibit-deck': ['swiss-international-style', 'corporate-blue'],
  'ppt-bain-results-deck': ['executive-minimal', 'corporate-blue'],
  'ppt-keynote-minimal-fullbleed': ['monochrome-minimal', 'executive-minimal'],
  'ppt-minimal-mono-note': ['monochrome-minimal'],
  'ppt-monochrome-risk': ['monochrome-minimal', 'executive-minimal'],
  'ppt-monochrome-infrastructure-deck': ['monochrome-minimal', 'executive-minimal'],
  'ppt-dark-tech': ['modern-dark', 'cyberpunk-outline'],
  'ppt-engineered-dark-deck': ['modern-dark'],
  'ppt-prismatic-dark-deck': ['modern-dark', 'scifi-holographic-data'],
  'ppt-dark-luxury-keynote': ['modern-dark', 'dark-neon-miami'],
  'ppt-vivid-gradient-future': ['gradient-mesh', 'aurora-neon-glow'],
  'ppt-vivid-gradient-infographic-deck': ['gradient-mesh', 'aurora-neon-glow'],
};

// reverse map: builtin id -> [dd slug] for enrichment
const BUILTIN_ALIAS_SLUGS = Object.entries(DESIGN_DIVERSITY_ALIAS_MAP).reduce((acc, [slug, builtinId]) => {
  (acc[builtinId] = acc[builtinId] || []).push(slug);
  return acc;
}, {});

function classifyStyle(style) {
  if (style.collection === 'design-diversity') {
    const slug = style.id;
    if (DESIGN_DIVERSITY_ALIAS_MAP[slug]) {
      return {
        classification: 'source-alias',
        sourceSlug: slug,
        aliasOf: DESIGN_DIVERSITY_ALIAS_MAP[slug],
        relatedStyleIds: [],
      };
    }
    if (DESIGN_DIVERSITY_RELATED_MAP[slug]) {
      return {
        classification: 'source-variant',
        sourceSlug: slug,
        relatedStyleIds: [...DESIGN_DIVERSITY_RELATED_MAP[slug]],
      };
    }
    return {
      classification: 'source-new',
      sourceSlug: slug,
      relatedStyleIds: [],
    };
  }
  const extra = { classification: 'builtin', relatedStyleIds: [] };
  if (BUILTIN_ALIAS_SLUGS[style.id]) extra.aliases = [...BUILTIN_ALIAS_SLUGS[style.id]];
  return extra;
}

const DESIGN_STYLES = [...RAW_DESIGN_STYLES, ...RAW_DESIGN_DIVERSITY_STYLES].map((style) => Object.freeze({
  ...style,
  source: getStyleSource(style),
  ...classifyStyle(style),
}));

const DESIGN_STYLES_BY_ID = new Map(DESIGN_STYLES.map((style) => [style.id, style]));

export function listDesignStyles() {
  return DESIGN_STYLES;
}

export function listSelectableDesignStyles() {
  return DESIGN_STYLES.filter((style) => style.classification !== 'source-alias');
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
