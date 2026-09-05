import { loadStore, validateStore, baselineFromGit } from '../src/lib/content';
const base = process.argv.indexOf('--base');
try {
  const s = loadStore();
  validateStore(s, base >= 0 ? baselineFromGit(process.argv[base + 1]) : undefined);
  console.log(
    `内容校验通过：${Object.keys(s.questions).length} 个问题，${Object.keys(s.answers).length} 份答案，${Object.keys(s.relations).length} 条关联。`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
