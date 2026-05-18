import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const FRONTMATTER_FENCE = /^---\s*$/;
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const LIST_SCAFFOLD_KEY = '__list__';

const SECTION_ALIASES = Object.freeze({
  overview: 'overview',
  'brand & style': 'overview',
  'visual theme & atmosphere': 'overview',
  background: 'background',
  colors: 'colors',
  'color palette & roles': 'colors',
  'color palette': 'colors',
  palette: 'colors',
  typography: 'fonts',
  'typography rules': 'fonts',
  fonts: 'fonts',
  layout: 'layout',
  'layout principles': 'layout',
  'slide layouts': 'layout',
  components: 'components',
  'component stylings': 'components',
  'elevation & depth': 'elevation',
  'depth & elevation': 'elevation',
  shapes: 'shapes',
  'signature elements': 'signature',
  'signature motifs': 'signature',
  signature: 'signature',
  "do's and don'ts": 'dosdonts',
  'dos and donts': 'dosdonts',
  avoid: 'avoid',
  "don't": 'avoid',
  donts: 'avoid',
  'responsive behavior': 'responsive',
  'agent prompt guide': 'agentPrompt',
});

function parseYamlScalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseYamlFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const indentStack = [{ container: root, indent: -1 }];

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;

    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();

    while (indentStack.length > 1 && indentStack[indentStack.length - 1].indent >= indent) {
      indentStack.pop();
    }
    const parent = indentStack[indentStack.length - 1].container;

    if (line.startsWith('- ')) {
      const valuePart = line.slice(2);
      if (!Array.isArray(parent[LIST_SCAFFOLD_KEY])) {
        parent[LIST_SCAFFOLD_KEY] = [];
      }
      const isInlineMapping = valuePart.includes(': ') &&
        !valuePart.startsWith('"') && !valuePart.startsWith("'");
      if (isInlineMapping) {
        const obj = {};
        const colonIdx = valuePart.indexOf(': ');
        obj[valuePart.slice(0, colonIdx).trim()] = parseYamlScalar(valuePart.slice(colonIdx + 2));
        parent[LIST_SCAFFOLD_KEY].push(obj);
      } else {
        parent[LIST_SCAFFOLD_KEY].push(parseYamlScalar(valuePart));
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1);

    if (rest.trim() === '') {
      const child = {};
      parent[key] = child;
      indentStack.push({ container: child, indent });
    } else {
      parent[key] = parseYamlScalar(rest);
    }
  }

  return collapseListScaffolds(root);
}

function collapseListScaffolds(node) {
  if (Array.isArray(node)) return node.map(collapseListScaffolds);
  if (node && typeof node === 'object') {
    const isPureListScaffold = LIST_SCAFFOLD_KEY in node && Object.keys(node).length === 1;
    if (isPureListScaffold) {
      return node[LIST_SCAFFOLD_KEY].map(collapseListScaffolds);
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = collapseListScaffolds(v);
    }
    return out;
  }
  return node;
}

export function splitFrontMatter(markdown) {
  const lines = markdown.split(/\r?\n/);
  const startsWithFence = lines.length > 0 && FRONTMATTER_FENCE.test(lines[0]);
  if (!startsWithFence) {
    return { frontMatter: '', body: markdown };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (FRONTMATTER_FENCE.test(lines[i])) {
      return {
        frontMatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
      };
    }
  }
  return { frontMatter: '', body: markdown };
}

function canonicalSectionBucket(rawTitle) {
  const titleKey = rawTitle.toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
  return SECTION_ALIASES[titleKey] ?? null;
}

export function extractSections(markdownBody) {
  const lines = markdownBody.split(/\r?\n/);
  const sections = {};
  let currentBucket = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    const isLevel2Heading = headingMatch && headingMatch[1].length === 2;
    if (isLevel2Heading) {
      const bucket = canonicalSectionBucket(headingMatch[2].trim());
      if (bucket) {
        currentBucket = bucket;
        if (!sections[bucket]) {
          sections[bucket] = { heading: `## ${headingMatch[2].trim()}`, text: '' };
        }
        continue;
      }
      currentBucket = null;
      continue;
    }
    if (currentBucket) {
      sections[currentBucket].text = (sections[currentBucket].text
        ? sections[currentBucket].text + '\n'
        : '') + line;
    }
  }

  for (const key of Object.keys(sections)) {
    sections[key].text = sections[key].text.replace(/\n+$/g, '').trim();
  }
  return sections;
}

function bulletsFromMarkdown(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const bullets = [];
  let buffer = [];
  const flushBuffer = () => {
    const joined = buffer.join(' ').trim();
    if (joined) bullets.push(joined);
    buffer = [];
  };
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const orderedMatch = /^\s*\d+\.\s+/.test(line);
    if (bulletMatch) {
      flushBuffer();
      buffer.push(bulletMatch[1].trim());
    } else if (orderedMatch) {
      flushBuffer();
      buffer.push(line.replace(/^\s*\d+\.\s+/, '').trim());
    } else if (line.trim() === '') {
      flushBuffer();
    } else if (buffer.length > 0) {
      buffer.push(line.trim());
    } else {
      bullets.push(line.trim());
    }
  }
  flushBuffer();
  return bullets.filter((b) => b.length > 0);
}

function colorEntriesFromFrontMatter(frontMatterColors) {
  if (!frontMatterColors || typeof frontMatterColors !== 'object' || Array.isArray(frontMatterColors)) {
    return [];
  }
  const entries = [];
  for (const [role, value] of Object.entries(frontMatterColors)) {
    if (typeof value === 'string') {
      const hexMatch = value.match(HEX_PATTERN);
      entries.push({
        role,
        label: role.replace(/[-_]/g, ' '),
        hex: hexMatch ? hexMatch[0] : value,
      });
    } else if (value && typeof value === 'object' && 'value' in value) {
      entries.push({
        role,
        label: value.label ?? role.replace(/[-_]/g, ' '),
        hex: String(value.value),
      });
    }
  }
  return entries;
}

function colorEntriesFromTableRows(sectionText) {
  const entries = [];
  const tableRows = sectionText.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  for (const row of tableRows) {
    if (/^\|[-:\s|]+\|\s*$/.test(row)) continue;
    const cells = row.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    if (/^role$/i.test(cells[0]) && /^(label|name)$/i.test(cells[1])) continue;
    const hexInRow = (row.match(HEX_PATTERN) || [])[0];
    if (!hexInRow) continue;
    const role = cells[0];
    const label = cells.length >= 2 ? cells[1].replace(HEX_PATTERN, '').replace(/`/g, '').trim() : role;
    entries.push({ role, label: label || role, hex: hexInRow });
  }
  return entries;
}

function colorEntriesFromBullets(sectionText, existing) {
  const entries = [];
  const bulletEntries = bulletsFromMarkdown(sectionText);
  for (const bullet of bulletEntries) {
    const hexes = bullet.match(HEX_PATTERN);
    if (!hexes) continue;
    for (const hex of hexes) {
      const isDuplicate = existing.some((e) => e.hex.toLowerCase() === hex.toLowerCase()) ||
        entries.some((e) => e.hex.toLowerCase() === hex.toLowerCase());
      if (isDuplicate) continue;
      const cleaned = bullet.replace(HEX_PATTERN, '').replace(/`/g, '').replace(/[:|]/g, ' ').trim();
      const [role, ...labelParts] = cleaned.split(/\s+-\s+|\s+—\s+|\s{2,}/);
      entries.push({
        role: role || 'Color',
        label: (labelParts.join(' ') || cleaned || role || 'Color').slice(0, 80),
        hex,
      });
    }
  }
  return entries;
}

function colorsFromSection(sectionText, frontMatterColors) {
  const fromFrontMatter = colorEntriesFromFrontMatter(frontMatterColors);
  if (!sectionText) return fromFrontMatter;
  const fromTable = colorEntriesFromTableRows(sectionText);
  const merged = [...fromFrontMatter, ...fromTable];
  const fromBullets = colorEntriesFromBullets(sectionText, merged);
  return [...merged, ...fromBullets];
}

function sanitizeStyleId(raw) {
  if (!raw) return 'imported-design';
  return String(raw)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'imported-design';
}

function slugToTitle(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function truncateString(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function buildStyleObject({ frontMatter, sections, sourceMeta }) {
  const fmName = frontMatter?.name ?? frontMatter?.title ?? null;
  const fmDescription = frontMatter?.description ?? null;
  const id = sanitizeStyleId(sourceMeta?.idHint ?? fmName ?? 'imported-design');

  const background = bulletsFromMarkdown(sections.background?.text ?? '');
  const fonts = bulletsFromMarkdown(sections.fonts?.text ?? '');
  const layoutBullets = bulletsFromMarkdown(sections.layout?.text ?? '');
  const componentBullets = bulletsFromMarkdown(sections.components?.text ?? '');
  const signature = bulletsFromMarkdown(sections.signature?.text ?? '');
  const avoidBullets = bulletsFromMarkdown(sections.avoid?.text ?? sections.dosdonts?.text ?? '');
  const colors = colorsFromSection(sections.colors?.text ?? '', frontMatter?.colors);
  const overview = sections.overview?.text ?? '';

  return Object.freeze({
    id,
    title: fmName ?? slugToTitle(id),
    mood: fmDescription ? truncateString(fmDescription, 80) : 'Imported DESIGN.md',
    bestFor: 'Custom DESIGN.md-driven decks',
    background,
    colors,
    fonts,
    layout: [...layoutBullets, ...componentBullets],
    signature,
    avoid: avoidBullets,
    overview,
    source: Object.freeze({
      type: 'design-md',
      path: sourceMeta?.path ?? null,
      url: sourceMeta?.url ?? null,
      fetchedAt: sourceMeta?.fetchedAt ?? null,
    }),
    raw: Object.freeze({
      frontMatter: frontMatter ?? {},
      markdown: sourceMeta?.markdown ?? '',
      sections,
    }),
  });
}

export function parseDesignMarkdown(markdown, sourceMeta = {}) {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    throw new Error('DESIGN.md content is empty.');
  }
  const { frontMatter: fmRaw, body } = splitFrontMatter(markdown);
  const frontMatter = fmRaw ? parseYamlFrontMatter(fmRaw) : {};
  const sections = extractSections(body);
  return buildStyleObject({
    frontMatter,
    sections,
    sourceMeta: { ...sourceMeta, markdown },
  });
}

export function parseDesignMarkdownFile(filePath, extraMeta = {}) {
  const absolutePath = resolve(filePath);
  const text = readFileSync(absolutePath, 'utf8');
  const idHint = basename(absolutePath, '.md');
  return parseDesignMarkdown(text, {
    path: absolutePath,
    idHint,
    ...extraMeta,
  });
}

export function renderDesignStyleForPrompt(style, options = {}) {
  const { maxColors = 12 } = options;
  if (!style) return '';
  const lines = [];
  lines.push(`# Design System: ${style.title}`);
  if (style.mood) lines.push(`Mood: ${style.mood}`);
  if (style.source?.url) lines.push(`Source: ${style.source.url}`);
  else if (style.source?.path) lines.push(`Source: ${style.source.path}`);
  lines.push('');
  if (style.overview) {
    lines.push('## Overview');
    lines.push(style.overview.trim());
    lines.push('');
  }
  if (style.background?.length) {
    lines.push('## Background');
    for (const b of style.background) lines.push(`- ${b}`);
    lines.push('');
  }
  if (style.colors?.length) {
    lines.push('## Colors');
    for (const c of style.colors.slice(0, maxColors)) {
      lines.push(`- ${c.role}: ${c.label} (${c.hex})`);
    }
    lines.push('');
  }
  if (style.fonts?.length) {
    lines.push('## Typography');
    for (const f of style.fonts) lines.push(`- ${f}`);
    lines.push('');
  }
  if (style.layout?.length) {
    lines.push('## Layout');
    for (const l of style.layout) lines.push(`- ${l}`);
    lines.push('');
  }
  if (style.signature?.length) {
    lines.push('## Signature Elements');
    for (const s of style.signature) lines.push(`- ${s}`);
    lines.push('');
  }
  if (style.avoid?.length) {
    lines.push('## Avoid');
    for (const a of style.avoid) lines.push(`- ${a}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export { sanitizeStyleId as _sanitizeStyleId };
