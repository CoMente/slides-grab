import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TemplatePackError, TEMPLATE_PACK_RELATIVE_PATH, loadTemplatePackFromSlidesDir } from './template-pack.js';

const METADATA_RE = /<!--\s*slides-grab-template:\s*(\{[\s\S]*?\})\s*-->/i;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FONT_RE = /font-family\s*:\s*([^;}"'<]+)/gi;

export function templatePackExists(slidesDir) {
  return existsSync(join(slidesDir, TEMPLATE_PACK_RELATIVE_PATH));
}

export function parseTemplateMetadata(html) {
  const match = METADATA_RE.exec(html || '');
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      layoutId: parsed.layoutId ?? parsed.layout_id ?? null,
      layoutKind: parsed.layoutKind ?? parsed.layout_kind ?? null,
    };
  } catch {
    return null;
  }
}

export async function buildTemplateFidelityReport({ slidesDir, slideFiles, previewRelativeDir }) {
  if (!templatePackExists(slidesDir)) {
    return {
      status: 'not-applicable',
      slides: [],
      findings: [],
      referencePreviewFiles: [],
      markdown: '',
    };
  }

  let pack;
  try {
    pack = loadTemplatePackFromSlidesDir(slidesDir, { optional: true });
  } catch (error) {
    if (error instanceof TemplatePackError) {
      return buildFailedReport({
        findings: [{
          severity: 'critical',
          code: 'template-pack-invalid',
          message: `Template fidelity cannot run because ${error.message}`,
        }],
      });
    }
    throw error;
  }

  if (!pack) {
    return {
      status: 'not-applicable',
      slides: [],
      findings: [],
      referencePreviewFiles: [],
      markdown: '',
    };
  }

  const slides = [];
  const findings = [];
  const referencePreviewFiles = [];
  const layouts = Array.isArray(pack.layouts) ? pack.layouts : [];

  for (const slideFile of slideFiles) {
    const html = await readFile(join(slidesDir, slideFile), 'utf-8');
    const metadata = parseTemplateMetadata(html);
    const generatedPreview = join(previewRelativeDir, slideFile.replace(/\.html$/i, '.png'));
    const slideEntry = {
      slide: slideFile,
      layoutId: metadata?.layoutId ?? null,
      layoutKind: metadata?.layoutKind ?? null,
      generatedPreview,
      referencePreview: '',
      notes: [],
    };

    if (!metadata?.layoutId) {
      slideEntry.notes.push('not template-governed: no slides-grab-template metadata');
      slides.push(slideEntry);
      continue;
    }

    const layout = layouts.find((candidate) => candidate?.layoutId === metadata.layoutId);
    if (!layout) {
      findings.push({
        severity: 'critical',
        code: 'template-layout-missing',
        slide: slideFile,
        layoutId: metadata.layoutId,
        message: `${slideFile} references missing template layout ${metadata.layoutId}.`,
      });
      slides.push(slideEntry);
      continue;
    }

    slideEntry.layoutKind = slideEntry.layoutKind ?? layout.layoutKind ?? null;
    slideEntry.referencePreview = layout.preview || '';
    if (!slideEntry.referencePreview) {
      findings.push({
        severity: 'critical',
        code: 'template-reference-preview-missing',
        slide: slideFile,
        layoutId: layout.layoutId,
        message: `${slideFile} selected template layout ${layout.layoutId}, but that layout has no reference preview.`,
      });
    } else if (!existsSync(join(slidesDir, slideEntry.referencePreview))) {
      findings.push({
        severity: 'critical',
        code: 'template-reference-preview-missing',
        slide: slideFile,
        layoutId: layout.layoutId,
        message: `${slideFile} selected template layout ${layout.layoutId}, but reference preview ${slideEntry.referencePreview} is missing.`,
      });
    } else {
      referencePreviewFiles.push(slideEntry.referencePreview);
    }

    if (!existsSync(join(slidesDir, generatedPreview))) {
      findings.push({
        severity: 'critical',
        code: 'template-generated-preview-missing',
        slide: slideFile,
        layoutId: layout.layoutId,
        message: `${slideFile} generated preview ${generatedPreview} is missing.`,
      });
    }

    slideEntry.notes.push(...buildDeviationNotes({ html, layout, pack }));
    slides.push(slideEntry);
  }

  return buildReport({ slides, findings, referencePreviewFiles });
}

export function assertTemplateFidelityPass(report) {
  if (!report || report.status !== 'failed') return report;
  const details = report.findings
    .filter((finding) => finding.severity === 'critical')
    .map((finding) => `${finding.code}: ${finding.message}`)
    .join(' ');
  throw new Error(`Template fidelity blocked proceed: ${details || 'critical template fidelity finding'}`);
}

export function buildTemplateFidelityMarkdown(report) {
  if (!report || report.status === 'not-applicable') return '';
  const lines = [
    '## Template Fidelity Report',
    '',
    `Status: ${report.status}`,
    '',
    '| Slide | Template layout | Generated preview | Reference preview | Notes |',
    '|---|---|---|---|---|',
  ];

  for (const slide of report.slides) {
    lines.push(`| ${slide.slide} | ${slide.layoutId || 'missing'} | ${slide.generatedPreview || 'missing'} | ${slide.referencePreview || 'missing'} | ${formatNotes(slide.notes)} |`);
  }

  if (report.findings.length > 0) {
    lines.push('', '### Findings', '');
    for (const finding of report.findings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}${finding.slide ? ` (${finding.slide})` : ''}: ${finding.message}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function buildFailedReport({ findings }) {
  return buildReport({ slides: [], findings, referencePreviewFiles: [] });
}

function buildReport({ slides = [], findings = [], referencePreviewFiles = [] }) {
  const status = findings.some((finding) => finding.severity === 'critical') ? 'failed' : 'passed';
  const report = {
    status,
    slides,
    findings,
    referencePreviewFiles: Array.from(new Set(referencePreviewFiles)),
  };
  report.markdown = buildTemplateFidelityMarkdown(report);
  return report;
}

function buildDeviationNotes({ html, layout, pack }) {
  const notes = [];
  const expectedColors = Array.isArray(pack.designTokens?.colors)
    ? pack.designTokens.colors.map((entry) => normalizeColor(entry.value)).filter(Boolean)
    : [];
  const actualColors = extractColors(html);
  const missingColors = expectedColors.filter((color) => !actualColors.includes(color));
  if (missingColors.length > 0) {
    notes.push(`palette deviation: missing ${missingColors.slice(0, 3).join(', ')}`);
  }

  const expectedFonts = Array.isArray(pack.designTokens?.fonts)
    ? pack.designTokens.fonts.map((entry) => normalizeFont(entry.family)).filter(Boolean)
    : [];
  const actualFonts = extractFonts(html);
  const missingFonts = expectedFonts.filter((font) => !actualFonts.includes(font));
  if (missingFonts.length > 0) {
    notes.push(`font deviation: missing ${missingFonts.slice(0, 3).join(', ')}`);
  }

  const fieldRoles = Array.isArray(layout.fields)
    ? layout.fields.map((field) => field.role).filter(Boolean)
    : [];
  const missingRoles = fieldRoles.filter((role) => !hasTemplateRole(html, role));
  if (missingRoles.length > 0) {
    notes.push(`layout schema roles not explicitly marked: ${missingRoles.slice(0, 3).join(', ')}`);
  }

  if (notes.length === 0) notes.push('no lightweight palette/font/layout drift detected');
  return notes;
}

function extractColors(html) {
  return Array.from(new Set((html.match(COLOR_RE) || []).map(normalizeColor).filter(Boolean)));
}

function normalizeColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
  if (!match) return null;
  let color = match[1].toLowerCase();
  if (color.length === 3) color = color.split('').map((char) => char + char).join('');
  if (color.length === 8) color = color.slice(0, 6);
  return `#${color}`;
}

function extractFonts(html) {
  const fonts = [];
  FONT_RE.lastIndex = 0;
  let match;
  while ((match = FONT_RE.exec(html)) !== null) {
    const font = normalizeFont(match[1].split(',')[0]);
    if (font && !fonts.includes(font)) fonts.push(font);
  }
  return fonts;
}

function normalizeFont(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
}

function hasTemplateRole(html, role) {
  const escaped = escapeRegExp(role);
  return new RegExp(`data-template-role=["']${escaped}["']`, 'i').test(html)
    || new RegExp(`class=["'][^"']*\\b${escaped}\\b`, 'i').test(html);
}

function formatNotes(notes) {
  return Array.isArray(notes) && notes.length > 0 ? notes.join('<br>') : 'none';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
