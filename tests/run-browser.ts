import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createExampleCorpus } from './helpers/example-corpus';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-browser-'));
try {
  const root = path.join(temporary, 'content'),
    dist = path.join(temporary, 'dist');
  createExampleCorpus(root);
  const env = {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
    CONTENT_DIR: root,
    BUILD_OUT_DIR: dist,
    SITE_BASE: process.env.TEST_BASE_PATH || '/',
    TEST_DIST_DIR: dist,
    TEST_ARTIFACT_DIR: path.join(temporary, 'artifacts'),
  };
  fs.mkdirSync(env.TEST_ARTIFACT_DIR, { recursive: true });
  const bin = JSON.parse(fs.readFileSync('node_modules/astro/package.json', 'utf8')).bin.astro;
  execFileSync(process.execPath, [path.resolve('node_modules/astro', bin), 'build'], {
    env,
    stdio: 'pipe',
  });
  execFileSync(process.execPath, ['node_modules/pagefind/lib/runner/bin.cjs', '--site', dist], {
    env,
    stdio: 'pipe',
  });
  const args = process.argv.slice(2);
  execFileSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...(args.length ? args : ['site.spec.ts'])],
    { env, stdio: 'inherit' },
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
