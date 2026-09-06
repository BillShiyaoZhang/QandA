import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExampleCorpus } from './helpers/example-corpus';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qanda-unit-'));
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
process.env.CONTENT_DIR = path.join(temporary, 'content');
createExampleCorpus(process.env.CONTENT_DIR);
