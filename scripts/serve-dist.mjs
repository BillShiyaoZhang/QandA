import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2),
  arg = (k) => args[args.indexOf(k) + 1];
const root = path.resolve(args.includes('--dir') ? arg('--dir') : 'dist'),
  port = Number(args.includes('--port') ? arg('--port') : 4173),
  base = (process.env.TEST_BASE_PATH || '').replace(/\/$/, '');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.pf_fragment': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_meta': 'application/octet-stream',
};
http
  .createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (base && pathname !== base && !pathname.startsWith(base + '/')) {
        res.writeHead(404);
        return res.end('Not found');
      }
      let relative = pathname.slice(base.length);
      let file = path.resolve(root, '.' + relative);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(400);
        return res.end('Invalid path');
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory())
        file = path.join(file, 'index.html');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const real = fs.realpathSync(file);
      if (!real.startsWith(root + path.sep)) {
        res.writeHead(400);
        return res.end('Invalid path');
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(`Serving built QandA at http://127.0.0.1:${port}${base}/`),
  );
