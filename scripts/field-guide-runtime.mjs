import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function supportsPdfPackages(command) {
  const result = spawnSync(command, ['-c', 'import reportlab, pdfplumber, pypdf'], {
    encoding: 'utf8'
  });
  return result.status === 0;
}

export function resolvePython() {
  const candidates = [
    process.env.FIELD_GUIDE_PYTHON,
    'python3',
    join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'bin', 'python3')
  ].filter(Boolean);
  for (const candidate of candidates) {
    if ((candidate === 'python3' || existsSync(candidate)) && supportsPdfPackages(candidate)) return candidate;
  }
  throw new Error('Python with reportlab, pdfplumber, and pypdf is required. Install requirements-print.txt or set FIELD_GUIDE_PYTHON.');
}
