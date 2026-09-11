// Run with node tests/support/ui-fixture.mjs. Uses a fresh isolated database only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import bundled from 'next/dist/compiled/webpack/webpack.js';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { createBrowserDatabase } from './browser-db.mjs';
bundled.init();
const output = path.resolve('node_modules/.cache/casher-ui-followup');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'loader.cjs'), `exports.default = function(source) { return require('typescript').transpileModule(source, { compilerOptions: { jsx: 4, module: 99, target: 9 } }).outputText; };`);
bundled.webpack({ mode: 'development', entry: path.resolve('tests/support/ui-fixture-entry.tsx'), output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.resolve('src') } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(output, 'loader.cjs') }] } }, async (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
  const css = await postcss([tailwind({ base: process.cwd() })]).process('@import "tailwindcss";', { from: path.resolve('src/app/globals.css') });
  fs.writeFileSync(path.join(output, 'fixture.css'), css.css);
  let database;
  try { database = await createBrowserDatabase(); } catch (error) { console.error('Isolated browser database unavailable: ' + error.name + ' (details suppressed)'); process.exitCode = 1; return; }
  let closing = false;
  const close = async () => { if (closing) return; closing = true; server.close(); try { await database.close(); } finally { process.exit(0); } };
  process.on('SIGINT', close); process.on('SIGTERM', close);
  const server = http.createServer(async (request, response) => {
    if (request.url === '/fixture/stop' && request.method === 'POST') {
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ stopping: true }));
      void close(); return;
    }
    if (request.url.startsWith('/api/') || request.url.startsWith('/fixture/')) {
      try {
        const chunks = []; for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString('utf8');
        const result = await database.handle(new Request('http://127.0.0.1:3213' + request.url, { method: request.method, headers: request.headers, ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body } : {}) }));
        response.writeHead(result.status, { 'Content-Type': 'application/json' }); response.end(await result.text());
      } catch { response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message: 'テストサーバーの処理エラー' })); }
      return;
    }
    const file = request.url === '/fixture.js' ? 'fixture.js' : request.url === '/fixture.css' ? 'fixture.css' : null;
    response.setHeader('Content-Type', file?.endsWith('.js') ? 'application/javascript' : file ? 'text/css' : 'text/html; charset=utf-8');
    response.end(file ? fs.readFileSync(path.join(output, file)) : '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>会計アプリ 安全な画面テスト</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  }).on('error', async () => { console.error('Fixture server could not start; cleaning up isolated database'); await close(); }).listen(3213, '127.0.0.1', () => console.log('Fixture ready at http://127.0.0.1:3213 (actual handlers, isolated test database; Ctrl+C cleans up)'));
});
