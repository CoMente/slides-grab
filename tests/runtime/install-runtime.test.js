import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

test('install-skills installs shared skills and runtime adapters for Codex and Claude Code', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'slides-grab-runtime-install-'));

  try {
    const output = execFileSync(
      process.execPath,
      [
        'bin/ppt-agent.js',
        'install-skills',
        '--runtime',
        'all',
        '--scope',
        'project',
        '--project-dir',
        projectDir,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    assert.match(output, /codex/i);
    assert.match(output, /claude code/i);

    assert.equal(existsSync(join(projectDir, '.agents', 'skills', 'slides-grab', 'SKILL.md')), true);
    assert.equal(existsSync(join(projectDir, '.claude', 'skills', 'slides-grab', 'SKILL.md')), true);
    assert.equal(existsSync(join(projectDir, '.codex', 'agents', 'slides-grab-design-critic.md')), true);
    assert.equal(existsSync(join(projectDir, '.claude', 'agents', 'design-critic-agent.md')), true);

    const codexAdapter = readFileSync(join(projectDir, '.codex', 'agents', 'slides-grab-design-critic.md'), 'utf-8');
    const claudeAdapter = readFileSync(join(projectDir, '.claude', 'agents', 'design-critic-agent.md'), 'utf-8');
    assert.match(codexAdapter, /slides-grab design-gate/);
    assert.match(claudeAdapter, /slides-grab design-gate/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
