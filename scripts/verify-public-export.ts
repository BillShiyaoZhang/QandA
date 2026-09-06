import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createExampleCorpus } from '../tests/helpers/example-corpus';
import { execFileSync } from 'node:child_process';
import { loadStore, validateStore, sha256, canonical, publication, walk } from '../src/lib/content';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-withdrawal-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
const root = path.join(temporary, 'content'),
  out = path.join(temporary, 'dist');
createExampleCorpus(root);
const s = loadStore(root),
  marker = 'WITHDRAWAL_SENTINEL_81a7fc';
const write = (file: string, data: unknown) => {
  const p = path.join(root, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
};
const q = s.questions['q-001'];
q.current_revision_id = null;
q.title = marker;
write('questions/q-001/question.json', q);
for (const [kind, id] of [
  ['question', 'q-001'],
  ['revision', 'q-001.r1'],
  ['answer', 'a-001-a'],
] as const) {
  const p = s.publications[`${kind}:${id}`];
  write(`publications/${kind}/${id}.json`, {
    ...p,
    state: 'withdrawn',
    withdrawal_reason: marker,
    reviewed_by: marker,
  });
}
for (const record of [s.revisions['q-001.r1'], s.answers['a-001-a']]) {
  record.body_sha256 = sha256(marker);
  write(record.body_path, marker);
  write(
    'question_id' in record
      ? `questions/${record.question_id}/revisions/${record.id}.json`
      : `answers/${record.id}/meta.json`,
    record,
  );
}
for (const r of Object.values(s.relations)) {
  for (const ref of [r.source_ref, r.target_ref])
    if (['q-001.r1', 'a-001-a'].includes(ref.entity_id)) ref.body_sha256 = sha256(marker);
  if ([r.source_ref, r.target_ref].some((ref) => ['q-001.r1', 'a-001-a'].includes(ref.entity_id)))
    r.rationale = marker;
  write(`relations/${r.id}.json`, r);
}
const core = {
  messages: [{ role: 'assistant', content: marker }],
  path_refs: [{ entity_type: 'answer', entity_id: 'a-001-a', body_sha256: sha256(marker) }],
  attachments: [],
};
const id = 'ctx-withdrawal-test';
write(`contexts/${id}.json`, {
  schema_version: 1,
  id,
  capture_kind: 'submitter_transcript',
  ...core,
  sha256: sha256(canonical(core)),
});
write(`publications/context/${id}.json`, publication('context', id));
const a = s.answers['a-follow-1'];
write(`answers/${a.id}/meta.json`, {
  ...a,
  context: {
    snapshot_id: id,
    capture_kind: 'submitter_transcript',
    visible_history_completeness: 'partial',
    matches_site_path: 'unknown',
  },
});
validateStore(loadStore(root));
const bin = JSON.parse(fs.readFileSync('node_modules/astro/package.json', 'utf8')).bin.astro;
const log = execFileSync(process.execPath, [path.resolve('node_modules/astro', bin), 'build'], {
  env: {
    ...process.env,
    CONTENT_DIR: root,
    BUILD_OUT_DIR: out,
    SITE_BASE: '/QandA',
    ASTRO_TELEMETRY_DISABLED: '1',
  },
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
fs.writeFileSync(path.join(temporary, 'build.log'), log);
execFileSync(process.execPath, ['node_modules/pagefind/lib/runner/bin.cjs', '--site', out], {
  stdio: 'pipe',
});
for (const file of walk(out))
  if (fs.readFileSync(file).includes(Buffer.from(marker))) throw new Error(`撤回内容泄漏: ${file}`);
const page = fs.readFileSync(path.join(out, 'questions/q-001/index.html'), 'utf8');
if (
  page.includes('focus=null') ||
  page.includes('focus=undefined') ||
  !page.includes('revisions/q-001.r1/')
)
  throw new Error('撤回问题的历史入口错误');
console.log('撤回构建检查通过：页面、JSON、搜索构建不包含撤回哨兵文本；无当前修订时历史入口保留。');
