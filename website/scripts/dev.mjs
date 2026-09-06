import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const websiteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pipelineRoot = path.resolve(websiteDir, '..');
const runnerUrl = process.env.PIPELINE_RUNNER_URL || 'http://127.0.0.1:8788';
const children = [];
let stopping = false;

async function runnerAlreadyAvailable() {
  try {
    const response = await fetch(`${runnerUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok || response.status === 503;
  } catch {
    return false;
  }
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
    ...options,
  });
  children.push(child);
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 750).unref();
}

if (!(await runnerAlreadyAvailable())) {
  const python = process.env.NOTEBOOKFAIR_PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
  const runner = start(
    python,
    [path.join(pipelineRoot, 'pipeline', 'runner_server.py'), '--port', '8788'],
    { cwd: pipelineRoot, env: process.env },
  );
  runner.on('exit', (code) => {
    if (!stopping && code !== 0) {
      console.error('[dev] The local pipeline runner stopped. Repository imports will remain pending.');
    }
  });
}

const vinext = path.join(websiteDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vinext.cmd' : 'vinext');
const web = start(vinext, ['dev', ...process.argv.slice(2)], {
  cwd: websiteDir,
  env: { ...process.env, PIPELINE_RUNNER_URL: runnerUrl },
});

web.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
