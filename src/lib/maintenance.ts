import fs from 'node:fs';
import path from 'node:path';
import { loadStore, validateStore, canonical, sha256, safePath } from './content';
import type { Store } from './schema';
export function applyReviewedFiles(root: string, files: Record<string, string>, expected: Store) {
  const lock = path.join(path.dirname(root), '.qanda-content.lock'),
    journal = root + '.transaction.json',
    backup = root + '.transaction-backup';
  let fd: number;
  try {
    fd = fs.openSync(lock, 'wx');
    fs.writeFileSync(fd, String(process.pid));
  } catch {
    throw new Error('内容事务正在处理，或存在待恢复的锁');
  }
  let staging = '';
  try {
    const current = loadStore(root);
    if (canonical(current) !== canonical(expected))
      throw new Error('审阅期间内容已改变，请重新检查');
    staging = fs.mkdtempSync(path.join(path.dirname(root), '.qanda-stage-'));
    fs.cpSync(root, staging, { recursive: true });
    for (const [file, body] of Object.entries(files)) {
      const target = safePath(staging, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
    const next = loadStore(staging);
    validateStore(next, current);
    if (fs.existsSync(backup) || fs.existsSync(journal))
      throw new Error('存在待恢复事务，请先运行 review --recover');
    fs.writeFileSync(journal, JSON.stringify({ staging, expectedHash: sha256(canonical(next)) }));
    fs.renameSync(root, backup);
    try {
      fs.renameSync(staging, root);
    } catch (e) {
      fs.renameSync(backup, root);
      throw e;
    }
    fs.rmSync(backup, { recursive: true });
    fs.unlinkSync(journal);
  } finally {
    if (staging && fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
