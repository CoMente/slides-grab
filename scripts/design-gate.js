#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ensureSlidesPassValidation } from './validate-slides.js';
import { assertProceedReportsComplete } from '../src/design-gate-report.js';
import {
  buildDesignGatePaths,
  buildDesignGateReport,
  collectFileFingerprints,
  collectSlideFingerprints,
  createDesignGateState,
  findGateSlideFiles,
  normalizeGateVerdict,
  writeDesignGateState,
} from '../src/design-gate-state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const DEFAULT_SLIDES_DIR = 'slides';
const DEFAULT_SLIDE_MODE = 'presentation';
const DEFAULT_RESOLUTION = '2160p';

function printUsage() {
  process.stdout.write(
    [
      'Usage: slides-grab design-gate [options]',
      '',
      'Options:',
      `  --slides-dir <path>       Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
      `  --slide-mode <mode>       Slide mode: presentation|card-news (default: ${DEFAULT_SLIDE_MODE})`,
      `  --resolution <preset>     PNG evidence resolution preset (default: ${DEFAULT_RESOLUTION})`,
      '  --verdict <verdict>       Gate verdict: proceed|revise|rethink',
      '  --pass-a-report <path>    Pass A review report file',
      '  --pass-b-report <path>    Pass B review report file',
      '  --output-dir <path>       PNG evidence directory (default: <slides-dir>/.slides-grab/gate-preview)',
      '  -h, --help                Show this help message',
    ].join('\n'),
  );
  process.stdout.write('\n');
}

function parseArgs(args) {
  const options = {
    slidesDir: DEFAULT_SLIDES_DIR,
    slideMode: DEFAULT_SLIDE_MODE,
    resolution: DEFAULT_RESOLUTION,
    verdict: '',
    passAReport: '',
    passBReport: '',
    outputDir: '',
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (ARGUMENT_READERS.has(arg)) {
      options[ARGUMENT_READERS.get(arg)] = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    const equalSignIndex = arg.indexOf('=');
    if (equalSignIndex > -1) {
      const name = arg.slice(0, equalSignIndex);
      const value = arg.slice(equalSignIndex + 1);
      if (ARGUMENT_READERS.has(name)) {
        options[ARGUMENT_READERS.get(name)] = value;
        continue;
      }
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.help) return options;

  options.slidesDir = requireNonEmpty(options.slidesDir, '--slides-dir');
  options.slideMode = requireNonEmpty(options.slideMode, '--slide-mode');
  options.resolution = requireNonEmpty(options.resolution, '--resolution');
  options.verdict = normalizeGateVerdict(requireNonEmpty(options.verdict, '--verdict'));
  options.passAReport = requireNonEmpty(options.passAReport, '--pass-a-report');
  options.passBReport = requireNonEmpty(options.passBReport, '--pass-b-report');
  if (options.outputDir) options.outputDir = options.outputDir.trim();
  return options;
}

const ARGUMENT_READERS = new Map([
  ['--slides-dir', 'slidesDir'],
  ['--slide-mode', 'slideMode'],
  ['--resolution', 'resolution'],
  ['--verdict', 'verdict'],
  ['--pass-a-report', 'passAReport'],
  ['--pass-b-report', 'passBReport'],
  ['--output-dir', 'outputDir'],
]);

function readOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return value;
}

function requireNonEmpty(value, optionName) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${optionName} must be a non-empty string.`);
  return trimmed;
}

async function renderGateEvidence(options, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const scriptPath = resolve(packageRoot, 'scripts/html2png.js');
  const args = [
    scriptPath,
    '--slides-dir',
    options.slidesDir,
    '--output-dir',
    outputDir,
    '--slide-mode',
    options.slideMode,
    '--resolution',
    options.resolution,
  ];

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, PPT_AGENT_PACKAGE_ROOT: packageRoot },
    });
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`PNG evidence render terminated by signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(`PNG evidence render failed with exit code ${code}.`));
        return;
      }
      resolvePromise();
    });
  });
}

async function readEvidenceReport(filePath, label) {
  const resolvedPath = resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`${label} report not found: ${resolvedPath}`);
  }
  const report = (await readFile(resolvedPath, 'utf-8')).trim();
  if (!report) {
    throw new Error(`${label} report is empty: ${resolvedPath}`);
  }
  return { resolvedPath, report };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return;
  }

  const paths = buildDesignGatePaths(options.slidesDir);
  const previewDir = options.outputDir ? resolve(process.cwd(), options.outputDir) : paths.previewDir;
  await ensureSlidesPassValidation(paths.slidesDir, {
    exportLabel: 'design gate',
    slideMode: options.slideMode,
    shouldBlockIssue: () => true,
  });
  await renderGateEvidence(options, previewDir);

  const passA = await readEvidenceReport(options.passAReport, 'Pass A');
  const passB = await readEvidenceReport(options.passBReport, 'Pass B');
  let gateValidation = { status: options.verdict === 'proceed' ? 'passed' : 'not-run' };
  const slideFiles = await findGateSlideFiles(paths.slidesDir);
  const slideFingerprints = await collectSlideFingerprints(paths.slidesDir);
  const evidenceFiles = slideFiles.map((fileName) => fileName.replace(/\.html$/i, '.png'));
  const previewRelativeDir = relative(paths.slidesDir, previewDir);
  const previewFingerprintFiles = evidenceFiles.map((fileName) => join(previewRelativeDir, fileName));
  const passReportFingerprintFiles = [
    relative(paths.slidesDir, passA.resolvedPath),
    relative(paths.slidesDir, passB.resolvedPath),
  ];

  if (options.verdict === 'proceed') {
    gateValidation = assertProceedReportsComplete({
      passAReport: passA.report,
      passBReport: passB.report,
      evidenceFiles,
      slideFingerprints,
    });
  }
  const state = await createDesignGateState({
    slidesDir: paths.slidesDir,
    slideMode: options.slideMode,
    resolution: options.resolution,
    verdict: options.verdict,
    previewDir,
    reportPath: paths.reportPath,
    passA: { reportPath: passA.resolvedPath, summary: firstLine(passA.report), ...gateValidation.passA },
    passB: { reportPath: passB.resolvedPath, summary: firstLine(passB.report), ...gateValidation.passB },
    gateValidation,
    passReportFingerprints: await collectFileFingerprints(paths.slidesDir, passReportFingerprintFiles),
    previewFingerprints: await collectFileFingerprints(paths.slidesDir, previewFingerprintFiles),
  });
  const report = buildDesignGateReport(state, passA.report, passB.report);
  await writeDesignGateState(paths.slidesDir, state, report);

  process.stdout.write(`Design gate recorded: ${state.verdict}\n`);
  process.stdout.write(`Evidence PNGs: ${previewDir}\n`);
  process.stdout.write(`Gate report: ${paths.reportPath}\n`);
  process.stdout.write(`Gate state: ${paths.statePath}\n`);

  if (state.verdict !== 'proceed') {
    process.exitCode = 1;
  }
}

function firstLine(value) {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() || '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
