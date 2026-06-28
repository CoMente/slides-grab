import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

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
    const filePath = join(resolvedSlidesDir, fileName);
    const bytes = await readFile(filePath);
    return {
      file: fileName,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }));
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
    schemaVersion: 1,
    verdict,
    generatedAt: new Date().toISOString(),
    slideMode: options.slideMode,
    resolution: options.resolution,
    previewDir: options.previewDir ? relative(slidesDir, options.previewDir) : join(GATE_DIR_NAME, GATE_PREVIEW_DIR),
    reportPath: options.reportPath ? relative(slidesDir, options.reportPath) : join(GATE_DIR_NAME, GATE_REPORT_FILE),
    passA: normalizeEvidence(options.passA),
    passB: normalizeEvidence(options.passB),
    slideFingerprints,
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

  if (!state.passA?.reportPath || !state.passB?.reportPath) {
    throw new Error(`${label} blocked: design gate state is missing dual-oracle Pass A/Pass B evidence.`);
  }

  const currentFingerprints = await collectSlideFingerprints(paths.slidesDir);
  const previousFingerprints = Array.isArray(state.slideFingerprints) ? state.slideFingerprints : [];
  const staleFiles = diffFingerprints(previousFingerprints, currentFingerprints);
  if (staleFiles.length > 0) {
    throw new Error(`${label} blocked: design gate is stale because slides changed: ${staleFiles.join(', ')}.`);
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
  };
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
