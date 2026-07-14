import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { classifyImageSource, extractCssUrls } from './image-contract.js';
import { buildTemplateFidelityMarkdown, templatePackExists } from './template-fidelity.js';

const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
const GATE_DIR_NAME = '.slides-grab';
const GATE_STATE_FILE = 'design-gate.json';
const GATE_REPORT_FILE = 'design-gate-report.md';
const GATE_PREVIEW_DIR = 'gate-preview';
const PROCEED = 'proceed';
const VALID_VERDICTS = new Set([PROCEED, 'revise', 'rethink']);

export function normalizeGateVerdict(value) {
  const verdict = String(value || '').trim().toLowerCase();
  if (!VALID_VERDICTS.has(verdict)) {
    throw new Error(`Unknown design gate verdict "${value}". Expected: proceed, revise, or rethink.`);
  }
  return verdict;
}

export function buildDesignGatePaths(slidesDir) {
  const resolvedSlidesDir = resolve(process.cwd(), slidesDir);
  const gateDir = join(resolvedSlidesDir, GATE_DIR_NAME);
  return {
    slidesDir: resolvedSlidesDir,
    gateDir,
    previewDir: join(gateDir, GATE_PREVIEW_DIR),
    reportPath: join(gateDir, GATE_REPORT_FILE),
    statePath: join(gateDir, GATE_STATE_FILE),
  };
}

export async function findGateSlideFiles(slidesDir) {
  const entries = await readdir(slidesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(sortSlideFiles);

  if (files.length === 0) {
    throw new Error(`No slide-*.html files found in ${slidesDir}.`);
  }
  return files;
}

export async function collectSlideFingerprints(slidesDir) {
  const resolvedSlidesDir = resolve(process.cwd(), slidesDir);
  const files = await findGateSlideFiles(resolvedSlidesDir);
  return Promise.all(files.map(async (fileName) => {
    return {
      file: fileName,
      sha256: await hashFile(join(resolvedSlidesDir, fileName)),
    };
  }));
}

export async function collectLocalAssetFingerprints(slidesDir) {
  const resolvedSlidesDir = resolve(process.cwd(), slidesDir);
  const slideFiles = await findGateSlideFiles(resolvedSlidesDir);
  const localAssets = new Set();

  for (const fileName of slideFiles) {
    const html = await readFile(join(resolvedSlidesDir, fileName), 'utf-8');
    for (const source of extractLocalAssetSources(html)) {
      localAssets.add(source);
    }
  }

  return collectFileFingerprints(resolvedSlidesDir, Array.from(localAssets).sort(sortSlideFiles));
}

export async function collectFileFingerprints(baseDir, files) {
  const resolvedBaseDir = resolve(process.cwd(), baseDir);
  return Promise.all(files.map(async (fileName) => ({
    file: fileName,
    sha256: await hashFile(join(resolvedBaseDir, fileName)),
  })));
}

export async function readDesignGateState(slidesDir) {
  const { statePath } = buildDesignGatePaths(slidesDir);
  if (!existsSync(statePath)) return null;

  try {
    return JSON.parse(await readFile(statePath, 'utf-8'));
  } catch (error) {
    throw new Error(`Design gate state is unreadable: ${statePath}. ${error.message}`);
  }
}

export async function writeDesignGateState(slidesDir, state, reportMarkdown = '') {
  const paths = buildDesignGatePaths(slidesDir);
  await mkdir(paths.gateDir, { recursive: true });
  await writeFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  if (reportMarkdown) {
    await writeFile(paths.reportPath, reportMarkdown, 'utf-8');
  }
  return paths;
}

export async function createDesignGateState(options) {
  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const verdict = normalizeGateVerdict(options.verdict);
  const slideFingerprints = await collectSlideFingerprints(slidesDir);

  return {
    schemaVersion: 2,
    verdict,
    generatedAt: new Date().toISOString(),
    slideMode: options.slideMode,
    resolution: options.resolution,
    previewDir: options.previewDir ? relative(slidesDir, options.previewDir) : join(GATE_DIR_NAME, GATE_PREVIEW_DIR),
    reportPath: options.reportPath ? relative(slidesDir, options.reportPath) : join(GATE_DIR_NAME, GATE_REPORT_FILE),
    passA: normalizeEvidence(options.passA),
    passB: normalizeEvidence(options.passB),
    gateValidation: options.gateValidation || { status: verdict === PROCEED ? 'passed' : 'not-run' },
    slideFingerprints,
    localAssetFingerprints: options.localAssetFingerprints || await collectLocalAssetFingerprints(slidesDir),
    passReportFingerprints: options.passReportFingerprints || [],
    previewFingerprints: options.previewFingerprints || [],
    templateFidelity: normalizeTemplateFidelity(options.templateFidelity),
  };
}

export async function assertDesignGateReady(slidesDir, options = {}) {
  const label = options.label || 'export';
  const paths = buildDesignGatePaths(slidesDir);
  const state = await readDesignGateState(paths.slidesDir);
  if (!state) {
    throw new Error(`${label} blocked: run slides-grab design-gate and record a Proceed verdict before exporting.`);
  }

  if (normalizeGateVerdict(state.verdict) !== PROCEED) {
    throw new Error(`${label} blocked: latest design gate verdict is "${state.verdict}", not "proceed".`);
  }

  if (state.schemaVersion !== 2) {
    throw new Error(`${label} blocked: design gate receipt is from a legacy unenforced schema; rerun slides-grab design-gate.`);
  }

  if (state.gateValidation?.status !== 'passed') {
    throw new Error(`${label} blocked: design gate report validation did not pass.`);
  }

  if (!state.passA?.reportPath || !state.passB?.reportPath) {
    throw new Error(`${label} blocked: design gate state is missing dual-oracle Pass A/Pass B evidence.`);
  }

  assertPassReady(state.passA, 'Pass A', label);
  assertPassReady(state.passB, 'Pass B', label);

  const currentFingerprints = await collectSlideFingerprints(paths.slidesDir);
  const previousFingerprints = Array.isArray(state.slideFingerprints) ? state.slideFingerprints : [];
  const staleFiles = diffFingerprints(previousFingerprints, currentFingerprints);
  if (staleFiles.length > 0) {
    throw new Error(`${label} blocked: design gate is stale because slides changed: ${staleFiles.join(', ')}.`);
  }

  const localAssetFingerprints = Array.isArray(state.localAssetFingerprints) ? state.localAssetFingerprints : null;
  if (!localAssetFingerprints) {
    throw new Error(`${label} blocked: design gate receipt is missing local asset fingerprints; rerun slides-grab design-gate.`);
  }
  let currentAssetFingerprints = [];
  try {
    currentAssetFingerprints = await collectLocalAssetFingerprints(paths.slidesDir);
  } catch (error) {
    throw new Error(`${label} blocked: design gate is stale because local assets changed. ${error.message}`);
  }
  const staleAssets = diffFingerprints(localAssetFingerprints, currentAssetFingerprints);
  if (staleAssets.length > 0) {
    throw new Error(`${label} blocked: design gate is stale because local assets changed: ${staleAssets.join(', ')}.`);
  }

  const passReportFingerprints = Array.isArray(state.passReportFingerprints) ? state.passReportFingerprints : [];
  if (passReportFingerprints.length < 2) {
    throw new Error(`${label} blocked: design gate receipt is missing Pass A/Pass B report fingerprints.`);
  }
  const currentReportFingerprints = await collectFileFingerprints(paths.slidesDir, passReportFingerprints.map((entry) => entry.file));
  const staleReports = diffFingerprints(passReportFingerprints, currentReportFingerprints);
  if (staleReports.length > 0) {
    throw new Error(`${label} blocked: design gate is stale because Pass A/Pass B reports changed: ${staleReports.join(', ')}.`);
  }

  const previewFingerprints = Array.isArray(state.previewFingerprints) ? state.previewFingerprints : [];
  if (previewFingerprints.length === 0) {
    throw new Error(`${label} blocked: design gate receipt is missing rendered evidence fingerprints.`);
  }
  const currentPreviewFingerprints = await collectFileFingerprints(paths.slidesDir, previewFingerprints.map((entry) => entry.file));
  const stalePreviewFiles = diffFingerprints(previewFingerprints, currentPreviewFingerprints);
  if (stalePreviewFiles.length > 0) {
    throw new Error(`${label} blocked: design gate is stale because rendered evidence changed: ${stalePreviewFiles.join(', ')}.`);
  }

  const templateFidelity = state.templateFidelity || null;
  if (templatePackExists(paths.slidesDir)) {
    if (!templateFidelity || templateFidelity.status === 'not-applicable') {
      throw new Error(`${label} blocked: template pack is active but the design gate is missing template fidelity evidence; rerun slides-grab design-gate.`);
    }
    if (templateFidelity.status !== 'passed') {
      throw new Error(`${label} blocked: template fidelity did not pass.`);
    }
    const referencePreviewFingerprints = Array.isArray(templateFidelity.referencePreviewFingerprints)
      ? templateFidelity.referencePreviewFingerprints
      : [];
    const currentReferencePreviewFingerprints = await collectFileFingerprints(
      paths.slidesDir,
      referencePreviewFingerprints.map((entry) => entry.file),
    );
    const staleReferencePreviews = diffFingerprints(referencePreviewFingerprints, currentReferencePreviewFingerprints);
    if (staleReferencePreviews.length > 0) {
      throw new Error(`${label} blocked: design gate is stale because template reference previews changed: ${staleReferencePreviews.join(', ')}.`);
    }
  }

  return state;
}

export function buildDesignGateReport(state, passAReport, passBReport) {
  return [
    '# slides-grab Design Gate Report',
    '',
    `Verdict: ${state.verdict}`,
    `Generated: ${state.generatedAt}`,
    `Slide mode: ${state.slideMode}`,
    `Resolution: ${state.resolution}`,
    '',
    '## Pass A: System Contract / Constraint Integrity',
    '',
    passAReport.trim(),
    '',
    '## Pass B: Audience Impact / Expressive Readability',
    '',
    passBReport.trim(),
    buildTemplateFidelityMarkdown(state.templateFidelity).trim() || '## Template Fidelity Report\n\nStatus: not-applicable',
    '',
    '## Slide Fingerprints',
    '',
    ...state.slideFingerprints.map((entry) => `- ${entry.file}: ${entry.sha256}`),
    '',
  ].join('\n');
}

function normalizeEvidence(value = {}) {
  return {
    reportPath: value.reportPath || '',
    summary: value.summary || '',
    verdict: value.verdict || '',
    unresolvedCritical: value.unresolvedCritical ?? null,
    blockingFindings: Array.isArray(value.blockingFindings) ? value.blockingFindings : [],
    checks: Array.isArray(value.checks) ? value.checks : [],
    evidenceFiles: Array.isArray(value.evidenceFiles) ? value.evidenceFiles : [],
    slideFingerprints: Array.isArray(value.slideFingerprints) ? value.slideFingerprints : [],
  };
}

function normalizeTemplateFidelity(value = {}) {
  return {
    status: value.status || 'not-applicable',
    slides: Array.isArray(value.slides) ? value.slides : [],
    findings: Array.isArray(value.findings) ? value.findings : [],
    referencePreviewFingerprints: Array.isArray(value.referencePreviewFingerprints)
      ? value.referencePreviewFingerprints
      : [],
  };
}

function extractLocalAssetSources(html) {
  const sources = new Set();
  const attributePattern = /\b(?:src|poster)\s*=\s*(['"])(.*?)\1/gi;
  let match;

  while ((match = attributePattern.exec(html)) !== null) {
    addLocalAssetSource(sources, match[2]);
  }

  for (const source of extractCssUrls(html)) {
    addLocalAssetSource(sources, source);
  }

  return Array.from(sources);
}

function addLocalAssetSource(sources, source) {
  const value = String(source || '').trim();
  if (classifyImageSource(value).kind === 'local-asset-path') {
    sources.add(value);
  }
}

async function hashFile(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

function assertPassReady(pass, passLabel, exportLabel) {
  if (pass.verdict !== 'PASS') {
    throw new Error(`${exportLabel} blocked: ${passLabel} did not record VERDICT: PASS.`);
  }
  if (pass.unresolvedCritical !== 0) {
    throw new Error(`${exportLabel} blocked: ${passLabel} has unresolved Critical findings.`);
  }
  if (pass.blockingFindings.length > 0) {
    throw new Error(`${exportLabel} blocked: ${passLabel} has blocking findings.`);
  }
}

function toSlideOrder(fileName) {
  const match = basename(fileName).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function sortSlideFiles(left, right) {
  const leftOrder = toSlideOrder(left);
  const rightOrder = toSlideOrder(right);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.localeCompare(right);
}

function diffFingerprints(previous, current) {
  const previousByFile = new Map(previous.map((entry) => [entry.file, entry.sha256]));
  const currentByFile = new Map(current.map((entry) => [entry.file, entry.sha256]));
  const files = new Set([...previousByFile.keys(), ...currentByFile.keys()]);
  return Array.from(files)
    .filter((file) => previousByFile.get(file) !== currentByFile.get(file))
    .sort(sortSlideFiles);
}
