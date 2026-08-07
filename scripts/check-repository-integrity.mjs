import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function repositoryFiles() {
  return git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter(path => !path.startsWith('.upstream/'));
}

function isRuntimeFile(path) {
  const extension = extname(path).toLowerCase();
  const runtimeExtensions = new Set(['.html', '.css', '.js', '.webmanifest']);
  const runtimeDirectories = ['app/', 'assets/', 'build/', 'dist/', 'public/', 'src/'];
  return runtimeExtensions.has(extension) || runtimeDirectories.some(directory => path.startsWith(directory));
}

function isPermittedPrintFile(path) {
  const extension = extname(path).toLowerCase();
  return ((path.startsWith('print/') || path.startsWith('pocket-card/')) && ['.html', '.css'].includes(extension)) ||
    ['generated/field-guide.html', 'generated/pocket-card.html'].includes(path);
}

async function main() {
  const files = repositoryFiles();
  const errors = [];
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
  const jsonFiles = files.filter(path => extname(path).toLowerCase() === '.json');
  const moduleFiles = files.filter(path => extname(path).toLowerCase() === '.mjs');
  const browserJavaScriptFiles = files.filter(path => extname(path).toLowerCase() === '.js');
  const pythonFiles = files.filter(path => extname(path).toLowerCase() === '.py');

  for (const path of jsonFiles) {
    try {
      JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
    } catch (error) {
      errors.push(path + ' is malformed JSON: ' + error.message);
    }
  }

  for (const path of moduleFiles) {
    const result = spawnSync(process.execPath, ['--check', resolve(repoRoot, path)], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    if (result.status !== 0) errors.push(path + ' has invalid JavaScript syntax: ' + (result.stderr || result.stdout).trim());
  }

  for (const path of browserJavaScriptFiles) {
    const result = spawnSync(process.execPath, ['--check', resolve(repoRoot, path)], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    if (result.status !== 0) errors.push(path + ' has invalid JavaScript syntax: ' + (result.stderr || result.stdout).trim());
  }

  for (const path of pythonFiles) {
    const result = spawnSync('python3', [
      '-c',
      'import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(), sys.argv[1], "exec")',
      resolve(repoRoot, path)
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    if (result.status !== 0) errors.push(path + ' has invalid Python syntax: ' + (result.stderr || result.stdout).trim());
  }

  if (packageJson.companion_phase?.runtime_allowed === false) {
    for (const path of files.filter(isRuntimeFile)) {
      if (packageJson.companion_phase.print_artifacts_allowed && isPermittedPrintFile(path)) continue;
      errors.push(path + ' is a runtime file prohibited during ' + packageJson.companion_phase.name);
    }
  }

  try {
    git(['diff', '--check']);
    git(['diff', '--cached', '--check']);
  } catch (error) {
    errors.push('Git whitespace integrity failed: ' + (error.stderr || error.message).trim());
  }

  if (errors.length) throw new Error('Repository integrity check failed:\n- ' + errors.join('\n- '));

  console.log('repository_integrity=pass');
  console.log('phase_scope=' + packageJson.companion_phase.name);
  console.log('runtime_allowed=' + packageJson.companion_phase.runtime_allowed);
  console.log('json_files_parsed=' + jsonFiles.length);
  console.log('mjs_files_syntax_checked=' + moduleFiles.length);
  console.log('browser_js_files_syntax_checked=' + browserJavaScriptFiles.length);
  console.log('python_files_syntax_checked=' + pythonFiles.length);
  console.log('git_whitespace_integrity=pass');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
