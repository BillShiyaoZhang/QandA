import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { sha256, publication, loadStore, validateStore, walk } from '../src/lib/content';
import { unknownGeneration } from '../src/lib/schema';
import { copyPath } from '../src/lib/graph';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-capacity-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
const target = path.join(temporary, 'content'),
  output = path.join(temporary, 'dist');
if (process.argv.includes('--browser') && !process.argv.includes('--build'))
  throw new Error('--browser requires --build');
fs.mkdirSync(target, { recursive: true });
function write(p: string, v: unknown) {
  const f = path.join(target, p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v));
}
const now = '2026-09-06T02:00:00Z';
for (let i = 0; i < 1000; i++) {
  const q = `bench-q-${i}`,
    r = `bench-r-${i}`,
    body = `容量测试问题 ${i}：怎样保留一个问题的探索路径？`;
  write(`questions/${q}/question.json`, {
    schema_version: 1,
    id: q,
    parent_answer_id: i > 0 && i <= 20 ? `bench-a-${i - 1}-0` : null,
    current_revision_id: r,
    title: `容量测试问题 ${i}`,
    tags: ['容量测试'],
    created_at: now,
    created_by: 'benchmark',
    state: 'active',
    copied_from_question_id: null,
    is_example: true,
  });
  write(`questions/${q}/revisions/${r}.json`, {
    schema_version: 1,
    id: r,
    question_id: q,
    body_path: `questions/${q}/revisions/${r}.md`,
    body_sha256: sha256(body),
    created_at: now,
    created_by: 'benchmark',
    change_note: '性能样本',
  });
  write(`questions/${q}/revisions/${r}.md`, body);
  for (const [kind, id] of [
    ['question', q],
    ['revision', r],
  ] as const)
    write(`publications/${kind}/${id}.json`, {
      ...publication(kind, id, 'benchmark'),
      reviewed_at: now,
    });
  for (let j = 0; j < 3; j++) {
    const a = `bench-a-${i}-${j}`,
      text = `## 回答 ${j}\n\n这是一份只用于容量验收的测试文本。每条答案关联固定提问版本，追问关联具体父答案。\n\n${'长期记录需要保存原文、来源和时间，未知条件保持未知。'.repeat(8)}`;
    write(`answers/${a}/meta.json`, {
      schema_version: 1,
      id: a,
      question_revision_id: r,
      body_path: `answers/${a}/body.md`,
      body_sha256: sha256(text),
      submitted_at: now,
      submitted_by: 'benchmark',
      provenance: { kind: 'development_example', source_url: null, identity_evidence: 'unknown' },
      generation: unknownGeneration(),
      context: {
        snapshot_id: null,
        capture_kind: 'unknown',
        visible_history_completeness: 'unknown',
        matches_site_path: 'unknown',
      },
      run_id: null,
      is_example: true,
    });
    write(`answers/${a}/body.md`, text);
    write(`publications/answer/${a}.json`, {
      ...publication('answer', a, 'benchmark'),
      reviewed_at: now,
    });
  }
}
const start = performance.now(),
  s = loadStore(target);
validateStore(s);
const validationMs = performance.now() - start;
const deep = copyPath(s, 'bench-q-20', 'bench-r-20', 'bench-a-20-0');
if (deep.nodes.length !== 42) throw new Error('深分支生成错误');
let buildMs: number | null = null,
  bytes: number | null = null,
  files: number | null = null;
if (process.argv.includes('--build')) {
  const begin = performance.now();
  const bin = JSON.parse(fs.readFileSync('node_modules/astro/package.json', 'utf8')).bin.astro;
  const log = execFileSync(process.execPath, [path.resolve('node_modules/astro', bin), 'build'], {
    env: {
      ...process.env,
      CONTENT_DIR: target,
      BUILD_OUT_DIR: output,
      ASTRO_TELEMETRY_DISABLED: '1',
      SITE_BASE: '/QandA',
    },
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(temporary, 'build.log'), log);
  execFileSync(process.execPath, ['node_modules/pagefind/lib/runner/bin.cjs', '--site', output], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  buildMs = performance.now() - begin;
  const all = walk(output);
  files = all.length;
  bytes = all.reduce((n, p) => n + fs.statSync(p).size, 0);
}
const report = {
  questions: Object.keys(s.questions).length,
  answers: Object.keys(s.answers).length,
  followUpDepth: 20,
  pathNodes: deep.nodes.length,
  validationMs: Math.round(validationMs),
  buildMs: buildMs ? Math.round(buildMs) : null,
  outputBytes: bytes,
  outputFiles: files,
  measuredAt: new Date().toISOString(),
};
fs.mkdirSync('.local', { recursive: true });
fs.writeFileSync('.local/benchmark-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--browser')) {
  const artifacts = path.join(temporary, 'artifacts');
  fs.mkdirSync(artifacts);
  execFileSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', 'benchmark.spec.ts'],
    {
      env: {
        ...process.env,
        BENCHMARK_BROWSER: '1',
        TEST_DIST_DIR: output,
        TEST_BASE_PATH: '/QandA',
        TEST_ARTIFACT_DIR: artifacts,
      },
      stdio: 'inherit',
    },
  );
}
