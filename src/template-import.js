import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve, join } from 'node:path';
import { deflateSync } from 'node:zlib';

import {
  TEMPLATE_PACK_RELATIVE_PATH,
  TEMPLATE_PACK_SUPPORTED_VERSION,
  parseTemplatePack,
} from './template-pack.js';

const TEMPLATE_PREVIEWS_RELATIVE_DIR = '.slides-grab/template-previews';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);

const DEFAULT_PACK_NAME = 'Imported template pack';

/**
 * Error thrown when a template source cannot be classified or imported.
 * The message always starts with a short, stable prefix so CLI callers and
 * tests can match against it without parsing free-form prose.
 */
export class TemplateImportError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'TemplateImportError';
  }
}

/**
 * Parse a flat argv array into a structured import-template options object.
 *
 * Supports repeated `--input`, a single `--slides-dir`, and an optional
 * `--name`. Unknown flags are ignored so the function stays composable. This
 * is a pure parser: it does not touch the filesystem.
 */
export function parseImportTemplateArgs(argv = []) {
  const inputs = [];
  let slidesDir = null;
  let name = null;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--input') {
      if (!next || next.startsWith('--')) {
        throw new TemplateImportError('Missing value for --input.');
      }
      inputs.push(next);
      i += 1;
    } else if (flag === '--slides-dir') {
      if (!next || next.startsWith('--')) {
        throw new TemplateImportError('Missing value for --slides-dir.');
      }
      slidesDir = next;
      i += 1;
    } else if (flag === '--name') {
      if (!next || next.startsWith('--')) {
        throw new TemplateImportError('Missing value for --name.');
      }
      name = next;
      i += 1;
    }
  }

  return { inputs, slidesDir, name };
}

/**
 * Classify a template source file by extension into one of the supported
 * source types: `pptx`, `pdf`, `html`, or `image`. Unsupported extensions
 * throw a {@link TemplateImportError} whose message includes the stable
 * prefix "Unsupported template source type".
 */
export function detectTemplateSourceType(inputPath) {
  const ext = extname(inputPath).toLowerCase();
  if (ext === '.pptx') return 'pptx';
  if (ext === '.pdf') return 'pdf';
  if (HTML_EXTENSIONS.has(ext)) return 'html';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  throw new TemplateImportError(
    `Unsupported template source type for ${basename(inputPath)} (${ext || 'no extension'}). ` +
      'Supported types: .pptx, .pdf, .html, .htm, .png, .jpg, .jpeg, .gif, .webp, .bmp, .svg, .avif.',
  );
}

// --- Local, deterministic PNG preview generation ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

/**
 * Encode a small solid-color RGB PNG without any native image dependency.
 * Used as a deterministic local preview placeholder. This is intentionally a
 * placeholder render: it does NOT attempt to render the real slide content.
 */
function encodeSolidColorPng(width, height, [r, g, b]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * rowLength;
    raw[offset] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      raw[offset + 1 + x * 3] = r;
      raw[offset + 1 + x * 3 + 1] = g;
      raw[offset + 1 + x * 3 + 2] = b;
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value.slice(0, 6);
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return [200, 200, 200];
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function normalizeHexColor(raw) {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(raw.trim());
  if (!match) return null;
  let value = match[1].toLowerCase();
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  if (value.length === 8) {
    value = value.slice(0, 6);
  }
  return `#${value}`;
}

function unique(value, index, array) {
  return array.indexOf(value) === index;
}

function slugify(input) {
  const base = basename(input, extname(input))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'template';
}

// --- Lightweight local HTML analysis (no network, no DOM dependency) ---

function extractStyleBlocks(html) {
  const blocks = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks.join('\n');
}

function extractHexColors(css) {
  const colors = [];
  const regex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const normalized = normalizeHexColor(match[0]);
    if (normalized) colors.push(normalized);
  }
  return colors.filter(unique);
}

function extractFontFamilies(css) {
  const fonts = [];
  const regex = /font-family\s*:\s*([^;}"']+)/gi;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const first = match[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (first) fonts.push(first);
  }
  return fonts.filter(unique);
}

function extractClassRules(css) {
  const rules = [];
  const ruleRegex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g;
  let match;
  while ((match = ruleRegex.exec(css)) !== null) {
    const cls = match[1];
    const body = match[2];
    const px = (prop) => {
      const re = new RegExp(`${prop}\\s*:\\s*([0-9.]+)px`);
      const m = re.exec(body);
      return m ? Number(m[1]) : null;
    };
    const left = px('left');
    const top = px('top');
    const width = px('width');
    const height = px('height');
    if ([left, top, width, height].every((n) => n !== null)) {
      rules.push({ cls, bbox: { x: left, y: top, width, height } });
    }
  }
  return rules;
}

function roleFromClass(cls) {
  const name = cls.toLowerCase();
  if (/subtitle|sub/.test(name)) return 'subtitle';
  if (/title|headline|heading/.test(name)) return 'title';
  if (/logo|brand/.test(name)) return 'logo';
  if (/footer/.test(name)) return 'footer';
  if (/body|content|text|paragraph/.test(name)) return 'body';
  return cls;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeHtml(html) {
  const css = extractStyleBlocks(html);
  const colors = extractHexColors(css);
  const fonts = extractFontFamilies(css);
  const classRules = extractClassRules(css);
  const bodyText = stripTags(html);
  const textDensity = bodyText.length;
  const hasH1 = /<h1[\s>]/i.test(html);
  const hasH2 = /<h2[\s>]/i.test(html);
  const hasList = /<[ou]l[\s>]/i.test(html);
  let textKind = 'content';
  if (hasH1) textKind = 'cover-heading';
  else if (hasList) textKind = 'list';
  else if (hasH2) textKind = 'section-heading';

  const fields = classRules.map((rule) => ({
    role: roleFromClass(rule.cls),
    bbox: rule.bbox,
    type: 'text',
  }));

  return { colors, fonts, fields, textDensity, textKind };
}

function buildHtmlLayout({ sourcePath, index, analysis, previewRelativePath }) {
  const slug = slugify(sourcePath);
  const layoutKind = analysis.textKind === 'cover-heading' ? 'cover' : 'content';
  return {
    layoutId: `${slug}-${index + 1}`,
    layoutKind,
    preview: previewRelativePath,
    fields: analysis.fields,
  };
}

function buildImageLayout({ sourcePath, index, previewRelativePath }) {
  const slug = slugify(sourcePath);
  return {
    layoutId: `${slug}-${index + 1}`,
    layoutKind: 'visual-reference',
    preview: previewRelativePath,
  };
}

function buildDocumentLayout({ sourcePath, index, previewRelativePath, sourceType }) {
  const slug = slugify(sourcePath);
  return {
    layoutId: `${slug}-${index + 1}`,
    layoutKind: 'visual-reference',
    preview: previewRelativePath,
    sourceType,
  };
}

function writePreview({ sourcePath, sourceType, analysis, previewPath }) {
  mkdirSync(resolve(previewPath, '..'), { recursive: true });
  if (sourceType === 'image' && extname(sourcePath).toLowerCase() === '.png') {
    // The image itself is the most honest PNG preview we can produce locally.
    copyFileSync(sourcePath, previewPath);
    return;
  }
  const fallbackColor = analysis?.colors?.[0] ?? '#c8c8c8';
  const [r, g, b] = hexToRgb(fallbackColor);
  writeFileSync(previewPath, encodeSolidColorPng(64, 36, [r, g, b]));
}

function expandTemplateInputs(inputs) {
  const expanded = [];
  const warnings = [];

  for (const input of inputs) {
    const absoluteInput = resolve(input);
    if (!existsSync(absoluteInput)) {
      throw new TemplateImportError(`Template source not found: ${absoluteInput}`);
    }
    const stat = statSync(absoluteInput);
    if (!stat.isDirectory()) {
      expanded.push(absoluteInput);
      continue;
    }

    const entries = readdirSync(absoluteInput, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(absoluteInput, entry.name))
      .sort((a, b) => basename(a).localeCompare(basename(b)));

    for (const entryPath of entries) {
      try {
        detectTemplateSourceType(entryPath);
        expanded.push(entryPath);
      } catch (error) {
        if (error instanceof TemplateImportError) {
          warnings.push(`Skipped unsupported template source in directory: ${basename(entryPath)}.`);
        } else {
          throw error;
        }
      }
    }
  }

  if (expanded.length === 0) {
    throw new TemplateImportError('No supported template sources found in the provided input path(s).');
  }

  return { inputs: expanded, warnings };
}

/**
 * Import one or more template source files into a loadable template pack.
 *
 * Writes `<slides-dir>/.slides-grab/template-pack.json` plus deterministic PNG
 * previews under `<slides-dir>/.slides-grab/template-previews/`. HTML and
 * image sources are analyzed locally (no network, no LLM). PPTX/PDF sources
 * are accepted as metadata/visual-reference dispatch only: full rendering is
 * not performed locally and a warning is recorded in the pack.
 *
 * @param {object} options
 * @param {string[]} options.inputs      Absolute or relative source paths.
 * @param {string}  options.slidesDir    Target slides directory.
 * @param {string}  [options.name]        Optional pack display name.
 * @param {() => Date} [options.now]      Deterministic clock for importedAt.
 * @returns {Promise<{ packPath: string, previewPaths: string[] }>}
 */
export async function importTemplatePack({ inputs, slidesDir, name, now = () => new Date() } = {}) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TemplateImportError('At least one --input source is required.');
  }
  if (!slidesDir) {
    throw new TemplateImportError('A --slides-dir is required.');
  }

  const absoluteSlidesDir = resolve(slidesDir);
  const packPath = join(absoluteSlidesDir, TEMPLATE_PACK_RELATIVE_PATH);
  const previewsDir = join(absoluteSlidesDir, TEMPLATE_PREVIEWS_RELATIVE_DIR);
  const previewsRelativeDir = TEMPLATE_PREVIEWS_RELATIVE_DIR;
  mkdirSync(previewsDir, { recursive: true });

  const layouts = [];
  const previewPaths = [];
  const sourceTypes = [];
  const originalFiles = [];
  const warnings = [];
  const expanded = expandTemplateInputs(inputs);
  warnings.push(...expanded.warnings);

  const colors = [];
  const fonts = [];

  const pushUnique = (array, value) => {
    if (value && !array.includes(value)) array.push(value);
  };

  expanded.inputs.forEach((absoluteInput, index) => {
    const sourceType = detectTemplateSourceType(absoluteInput);
    pushUnique(sourceTypes, sourceType);
    originalFiles.push(basename(absoluteInput));

    const slug = slugify(absoluteInput);
    const previewFileName = `${slug}-${index + 1}.png`;
    const previewPath = join(previewsDir, previewFileName);
    const previewRelativePath = `${previewsRelativeDir}/${previewFileName}`;

    let analysis = null;
    if (sourceType === 'html') {
      const html = readFileSync(absoluteInput, 'utf8');
      analysis = analyzeHtml(html);
      analysis.colors.forEach((c) => pushUnique(colors, c));
      analysis.fonts.forEach((f) => pushUnique(fonts, f));
      layouts.push(
        buildHtmlLayout({ sourcePath: absoluteInput, index, analysis, previewRelativePath }),
      );
    } else if (sourceType === 'image') {
      writePreview({ sourcePath: absoluteInput, sourceType, previewPath });
      layouts.push(buildImageLayout({ sourcePath: absoluteInput, index, previewRelativePath }));
    } else if (sourceType === 'pptx' || sourceType === 'pdf') {
      warnings.push(
        `${sourceType.toUpperCase()} rendering is not available locally; preview for ` +
          `${basename(absoluteInput)} is a placeholder, not a real render. Treat the ` +
          `original ${sourceType.toUpperCase()} file as the visual reference.`,
      );
      writePreview({ sourcePath: absoluteInput, sourceType, previewPath });
      layouts.push(
        buildDocumentLayout({ sourcePath: absoluteInput, index, previewRelativePath, sourceType }),
      );
    }

    if (sourceType !== 'image' && sourceType !== 'pptx' && sourceType !== 'pdf') {
      writePreview({ sourcePath: absoluteInput, sourceType, analysis, previewPath });
    }
    previewPaths.push(previewPath);
  });

  const designTokens = {
    colors: colors.map((value) => ({ value, kind: 'brand' })),
    fonts: fonts.map((family) => ({ family })),
  };

  const styleSummary = buildPromptSafeStyleSummary({
    name: name || DEFAULT_PACK_NAME,
    sourceTypes,
    layouts,
    colors,
    fonts,
  });

  const pack = {
    version: TEMPLATE_PACK_SUPPORTED_VERSION,
    name: name || DEFAULT_PACK_NAME,
    sourceMetadata: {
      originalFiles,
      importedAt: now().toISOString(),
      sourceTypes,
      warnings,
    },
    designTokens,
    layouts,
    promptSafeStyleSummary: styleSummary,
  };

  // Validate the built pack round-trips through the loader's parser so the
  // written file is guaranteed loadable by loadTemplatePackFromSlidesDir.
  parseTemplatePack(pack, { path: packPath });

  mkdirSync(resolve(packPath, '..'), { recursive: true });
  writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');

  return { packPath, previewPaths };
}

function buildPromptSafeStyleSummary({ name, sourceTypes, layouts, colors, fonts }) {
  const layoutKinds = layouts.map((layout) => layout.layoutKind).filter(unique);
  const parts = [
    `${name}`,
    `${layouts.length} layout(s) imported from ${sourceTypes.join(', ') || 'unknown sources'}.`,
    `Layout kinds: ${layoutKinds.join(', ') || 'none'}.`,
    `Colors: ${colors.join(', ') || 'none detected'}.`,
    `Fonts: ${fonts.join(', ') || 'none detected'}.`,
  ];
  return parts.join(' ');
}
