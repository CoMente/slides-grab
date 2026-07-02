const PASS_A_SPEC = {
  label: 'Pass A',
  title: 'Pass A System Contract / Constraint Integrity',
  titlePattern: /\bPass\s*A:?\s*System Contract\s*\/\s*Constraint Integrity\b/i,
  checks: [
    'System consistency',
    'Color discipline',
    'AI slop tropes',
    'Content discipline',
  ],
};

const PASS_B_SPEC = {
  label: 'Pass B',
  title: 'Pass B Audience Impact / Expressive Readability',
  titlePattern: /\bPass\s*B:?\s*Audience Impact\s*\/\s*Expressive Readability\b/i,
  checks: [
    'Composition & hierarchy',
    'Typography & legibility',
    'Korean/CJK word-break integrity',
    'Review Litmus',
  ],
};

const CONFIDENCE_PATTERN = /^Confidence:\s*(High|Medium|Low)\s*$/im;
const EVIDENCE_PATTERN = /^Evidence:\s*.+\.png\b.*$/im;
const VERDICT_PATTERN = /^\s*VERDICT:\s*(\S+)\s*$/gim;
const BLOCKING_FINDINGS_PATTERN = /^\s*Blocking findings:\s*(.+)$/gim;
const UNRESOLVED_CRITICAL_PATTERN = /^\s*Unresolved Critical:\s*(\d+)\s*$/gim;
const SUPPORTED_FINDING_SEVERITIES = new Set(['Major', 'Minor', 'Note']);

export function assertProceedReportsComplete({ passAReport, passBReport, evidenceFiles = [], slideFingerprints = [] }) {
  const validation = validateProceedReportsComplete({
    passAReport,
    passBReport,
    evidenceFiles,
    slideFingerprints,
  });
  if (validation.failures.length > 0) {
    throw new Error(`Design gate cannot proceed: ${validation.failures.join(' ')}`);
  }
  return validation;
}

export function validateProceedReportsComplete({
  passAReport,
  passBReport,
  evidenceFiles = [],
  slideFingerprints = [],
}) {
  const passA = validateProceedReport(passAReport, PASS_A_SPEC, evidenceFiles, slideFingerprints);
  const passB = validateProceedReport(passBReport, PASS_B_SPEC, evidenceFiles, slideFingerprints);
  const failures = [
    ...passA.failures,
    ...passB.failures,
  ];

  return {
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
    passA: passA.summary,
    passB: passB.summary,
  };
}

function validateProceedReport(report, spec, evidenceFiles, slideFingerprints) {
  const failures = [];
  const confidenceMatch = report.match(CONFIDENCE_PATTERN);
  const criticalMatches = [...report.matchAll(UNRESOLVED_CRITICAL_PATTERN)];
  const blockingMatches = [...report.matchAll(BLOCKING_FINDINGS_PATTERN)];
  const verdict = parseVerdict(report);
  const missingChecks = spec.checks.filter((check) => !hasPassedCheck(report, check));

  if (!spec.titlePattern.test(report)) {
    failures.push(`${spec.label} is missing required role title "${spec.title}".`);
  }
  failures.push(...validatePassVerdict(verdict, spec.label));
  if (!CONFIDENCE_PATTERN.test(report)) {
    failures.push(`${spec.label} is missing required Confidence: High|Medium|Low.`);
  }
  if (!EVIDENCE_PATTERN.test(report)) {
    failures.push(`${spec.label} is missing required rendered PNG evidence reference.`);
  }
  failures.push(...validateEvidenceFiles(report, spec.label, evidenceFiles));
  failures.push(...validateSlideFingerprints(report, spec.label, slideFingerprints));
  failures.push(...validateFindingsTable(report, spec.label));

  failures.push(...validateCriticalSummary(criticalMatches, blockingMatches, spec.label));
  failures.push(...validateCriticalFindingRows(report, spec.label));
  failures.push(...missingChecks.map((check) => `${spec.label} missing required passed check: ${check}.`));

  return {
    failures,
    summary: {
      label: spec.label,
      verdict: verdict.values.length === 1 ? verdict.values[0] : '',
      confidence: confidenceMatch?.[1] || '',
      unresolvedCritical: summarizeUnresolvedCritical(criticalMatches),
      blockingFindings: parseBlockingFindings(blockingMatches),
      checks: spec.checks.map((check) => ({
        name: check,
        status: missingChecks.includes(check) ? 'missing' : 'pass',
      })),
      evidenceFiles: evidenceFiles.filter((fileName) => report.includes(fileName)),
      slideFingerprints: slideFingerprints.filter((entry) => report.includes(entry.file) && report.includes(entry.sha256)),
    },
  };
}

function validateEvidenceFiles(report, label, evidenceFiles) {
  return evidenceFiles
    .filter((fileName) => !report.includes(fileName))
    .map((fileName) => `${label} is missing rendered evidence file: ${fileName}.`);
}

function validateSlideFingerprints(report, label, slideFingerprints) {
  return slideFingerprints
    .filter((entry) => !report.includes(entry.file) || !report.includes(entry.sha256))
    .map((entry) => `${label} is missing current slide fingerprint: ${entry.file}: ${entry.sha256}.`);
}

function validateFindingsTable(report, label) {
  const headerPattern = /^\|\s*Slide\s*\|\s*Finding\s*\|\s*Severity\s*\|\s*Fix\s*\|\s*Status\s*\|/im;
  const separatorPattern = /^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|/im;
  const dataRows = parseFindingRows(report);
  const failures = [];

  if (!headerPattern.test(report)) {
    failures.push(`${label} is missing required findings table columns: Slide | Finding | Severity | Fix | Status.`);
  }
  if (!separatorPattern.test(report)) {
    failures.push(`${label} is missing required findings table separator row.`);
  }
  if (dataRows.length === 0) {
    failures.push(`${label} is missing at least one findings table data row with a supported severity.`);
  }
  failures.push(...validateFindingRowSeverities(dataRows, label));

  return failures;
}

function validateCriticalFindingRows(report, label) {
  return parseFindingRows(report)
    .filter((row) => row.severity.toLowerCase() === 'critical')
    .map(() => `${label} lists a Critical severity finding and cannot proceed.`);
}

function validateFindingRowSeverities(rows, label) {
  return rows
    .filter((row) => !SUPPORTED_FINDING_SEVERITIES.has(row.severity))
    .map((row) => `${label} lists unsupported finding severity "${row.severity}".`);
}

function validatePassVerdict(verdict, label) {
  if (verdict.values.length === 0) {
    return [`${label} is missing required "VERDICT: PASS".`];
  }
  if (verdict.values.length > 1) {
    return [`${label} must include exactly one VERDICT line.`];
  }
  if (verdict.values[0] !== 'PASS') {
    return [`${label} must use "VERDICT: PASS".`];
  }
  return [];
}

function parseVerdict(report) {
  return {
    values: [...report.matchAll(VERDICT_PATTERN)].map((match) => match[1].trim().toUpperCase()),
  };
}

function parseFindingRows(report) {
  const lines = report.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => (
    /^\|\s*Slide\s*\|\s*Finding\s*\|\s*Severity\s*\|\s*Fix\s*\|\s*Status\s*\|/i.test(line.trim())
  ));
  if (headerIndex === -1) return [];

  const rows = [];
  for (const rawLine of lines.slice(headerIndex + 1)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      if (line) break;
      if (rows.length > 0) break;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5) continue;
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    if (/^slide$/i.test(cells[0]) && /^finding$/i.test(cells[1])) continue;
    rows.push({
      slide: cells[0],
      finding: cells[1],
      severity: cells[2],
      fix: cells[3],
      status: cells[4],
    });
  }
  return rows;
}

function validateCriticalSummary(criticalMatches, blockingMatches, label) {
  const failures = [];

  if (criticalMatches.length === 0) {
    failures.push(`${label} is missing required Unresolved Critical: 0.`);
  } else if (criticalMatches.length > 1) {
    failures.push(`${label} must include exactly one Unresolved Critical line.`);
  } else if (criticalMatches[0][1] !== '0') {
    failures.push(`${label} has unresolved Critical findings and blocks proceed.`);
  }

  if (blockingMatches.length === 0) {
    failures.push(`${label} is missing required Blocking findings: None.`);
  } else if (blockingMatches.length > 1) {
    failures.push(`${label} must include exactly one Blocking findings line.`);
  } else if (blockingMatches[0][1].trim().toLowerCase() !== 'none') {
    failures.push(`${label} has blocking findings and cannot proceed.`);
  }

  return failures;
}

function hasPassedCheck(report, check) {
  const checkPattern = new RegExp(`^\\s*-\\s*\\[[xX]\\]\\s*${escapeRegex(check)}\\s*:\\s*PASS\\b`, 'im');
  return checkPattern.test(report);
}

function summarizeUnresolvedCritical(matches) {
  if (matches.length !== 1) return null;
  return Number.parseInt(matches[0][1], 10);
}

function parseBlockingFindings(matches) {
  if (matches.length !== 1) return null;
  const value = matches[0][1].trim();
  if (value.toLowerCase() === 'none') return [];
  return [value];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
