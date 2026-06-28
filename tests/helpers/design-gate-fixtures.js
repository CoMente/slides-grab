import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createPassAReport(slidesDir, options = {}) {
  const fingerprint = getSlideFingerprint(slidesDir);
  const verdictLines = options.verdictLines || ['VERDICT: PASS'];
  const findingSeverity = options.findingSeverity || 'Note';

  return `# Pass A: System Contract / Constraint Integrity

${verdictLines.join('\n')}
Confidence: High
Evidence: slides/.slides-grab/gate-preview/slide-01.png
Slide fingerprints: ${fingerprint.file}: ${fingerprint.sha256}
Unresolved Critical: 0
Blocking findings: None

## Checks
- [x] System consistency: PASS - declared system is coherent.
- [x] Color discipline: PASS - colors trace to the approved palette.
- [x] AI slop tropes: PASS - no slop trope is the primary treatment.
- [x] Content discipline: PASS - no invented data or filler copy.

## Findings
| Slide | Finding | Severity | Fix | Status |
|-------|---------|----------|-----|--------|
| slide-01 | No blocking findings | ${findingSeverity} | None | tracked |
`;
}

export function createPassBReport(
  slidesDir,
  {
    unresolvedCritical = 0,
    criticalRowOnly = false,
    verdictLines,
    extraSummaryLines = [],
    slideCell = 'slide-01',
  } = {},
) {
  const fingerprint = getSlideFingerprint(slidesDir);
  const blocking = unresolvedCritical > 0
    ? 'slide-01: Critical unreadable hierarchy remains unresolved'
    : 'None';
  const findingSeverity = unresolvedCritical > 0 || criticalRowOnly ? 'Critical' : 'Note';
  const findingStatus = unresolvedCritical > 0 ? 'unresolved' : 'tracked';

  return `# Pass B: Audience Impact / Expressive Readability

${(verdictLines || ['VERDICT: PASS']).join('\n')}
Confidence: High
Evidence: slides/.slides-grab/gate-preview/slide-01.png
Slide fingerprints: ${fingerprint.file}: ${fingerprint.sha256}
Unresolved Critical: ${unresolvedCritical}
Blocking findings: ${blocking}
${extraSummaryLines.join('\n')}

## Checks
- [x] Composition & hierarchy: PASS - one primary takeaway and visual anchor.
- [x] Typography & legibility: PASS - readable type and contrast.
- [x] Korean/CJK word-break integrity: PASS - no mid-word break or ragged key line.
- [x] Review Litmus: PASS - audience can grasp the point in 3-5 seconds.

## Findings
| Slide | Finding | Severity | Fix | Status |
|-------|---------|----------|-----|--------|
| ${slideCell} | ${blocking} | ${findingSeverity} | Resolve before export | ${findingStatus} |
`;
}

function getSlideFingerprint(slidesDir) {
  const file = 'slide-01.html';
  const bytes = readFileSync(join(slidesDir, file));
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
