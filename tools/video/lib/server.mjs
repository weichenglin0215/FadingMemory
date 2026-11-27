// 錄影工具自己的小型網頁伺服器：把專案資料夾開給看不見的瀏覽器看（只聽本機 127.0.0.1，外面連不進來）。
//   routes：額外的網址（合成影片時用來把原始畫面交給瀏覽器、把合成好的畫面收回來）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg'
};

export async function startServer(root, routes) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const name = decodeURIComponent(url.pathname);
    for (const r of routes || []) if (name.startsWith(r.prefix)) return r.handle(req, res, name.slice(r.prefix.length));
    const file = path.resolve(base, '.' + name);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }   // 不准跑到專案資料夾外面
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const url = 'http://127.0.0.1:' + server.address().port;
  return { url, close() { server.closeAllConnections(); server.close(); } };
}
