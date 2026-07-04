#!/usr/bin/env node

import { resolve } from 'node:path';

import {
  TemplateImportError,
  importTemplatePack,
  parseImportTemplateArgs,
} from '../src/template-import.js';

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/import-template.js [options]',
      '',
      'Import one or more template/reference source files into a local template pack',
      'under <slides-dir>/.slides-grab/. HTML and image sources are analyzed locally',
      '(no network, no LLM). PPTX/PDF are accepted as metadata/visual-reference',
      'dispatch only; local rendering is not available and a warning is recorded.',
      '',
      'Options:',
      '  --input <path>      Template source file (repeatable; .pptx, .pdf, .html, .htm,',
      '                      or common image extensions).',
      '  --slides-dir <path> Target slides directory (default: slides).',
      '  --name <name>       Optional template pack display name.',
      '  -h, --help          Show this help message.',
      '',
      'Examples:',
      '  node scripts/import-template.js --input brand.html --input logo.png --slides-dir slides --name "Brand Pack"',
    ].join('\n'),
  );
  process.stdout.write('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    printUsage();
    return;
  }

  let parsed;
  try {
    parsed = parseImportTemplateArgs(argv);
  } catch (error) {
    if (error instanceof TemplateImportError) {
      console.error(`[slides-grab] ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (parsed.inputs.length === 0) {
    console.error('[slides-grab] At least one --input source is required.');
    process.exitCode = 1;
    return;
  }
  if (!parsed.slidesDir) {
    console.error('[slides-grab] A --slides-dir is required.');
    process.exitCode = 1;
    return;
  }

  const result = await importTemplatePack({
    inputs: parsed.inputs,
    slidesDir: resolve(parsed.slidesDir),
    name: parsed.name,
  });

  console.log(`Saved template pack: ${result.packPath}`);
  console.log(`Wrote ${result.previewPaths.length} preview(s) under ${resolve(result.previewPaths[0] ?? '', '..').replace(/\/$/, '') || '<slides-dir>/.slides-grab/template-previews'}`);
  for (const previewPath of result.previewPaths) {
    console.log(`  - ${previewPath}`);
  }
}

main().catch((error) => {
  if (error instanceof TemplateImportError) {
    console.error(`[slides-grab] ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.error(`[slides-grab] ${error.stack || error.message}`);
  process.exitCode = 1;
});
