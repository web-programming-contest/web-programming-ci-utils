import { spawnSync } from 'node:child_process';
import path from 'node:path';

const outputLimit = 60_000;

export class CheckSuite {
  checks = [];

  run(name, command, arguments_, options = {}) {
    const startedAt = Date.now();
    console.log(`\n==> ${name}`);
    const result = spawnSync(process.execPath, [command, ...arguments_], {
      cwd: options.cwd,
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024,
      timeout: options.timeout ?? 120_000,
    });
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    const passed = result.status === 0 && !result.error;
    const check = {
      command: [process.execPath, command, ...arguments_],
      durationMs: Date.now() - startedAt,
      exitCode: result.status,
      name,
      passed,
      signal: result.signal,
      status: passed ? 'passed' : 'failed',
      stderr: truncateOutput(result.stderr),
      stdout: truncateOutput(result.stdout),
    };
    if (!passed) {
      check.error = result.error?.message || `Процесс завершился с кодом ${result.status}.`;
    }
    this.checks.push(check);
    return check;
  }

  skip(name, reason) {
    this.checks.push({ durationMs: 0, name, passed: true, reason, status: 'skipped' });
  }

  fail(name, error) {
    this.checks.push({
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
      name,
      passed: false,
      status: 'failed',
    });
  }
}

export function localBinary(root, name) {
  return path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name,
  );
}

function truncateOutput(value) {
  const output = String(value ?? '').trim();
  if (output.length <= outputLimit) {
    return output;
  }
  return `[... пропущено ${output.length - outputLimit} символов ...]\n${output.slice(-outputLimit)}`;
}
