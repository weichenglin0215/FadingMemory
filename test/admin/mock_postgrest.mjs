// 假的 Supabase REST（PostgREST）伺服器：只實作「查玩家意見」需要的部分，用來測試 admin/feedback.html。
//   不連網路、不會碰到真的資料庫。模擬新版資料庫：資料表 MF_feedback 仍然鎖住（任何人讀都是 401／42501），
//   公開檢視表 MF_feedback_public（沒有 player_id 這一欄）任何人用 anon 金鑰都讀得到。
//   opts.mode：'ok'（預設）｜'noview'（還沒執行新版 SQL：找不到檢視表 → 404／PGRST205）｜'locked'（有檢視表但沒給讀取權限 → 401／42501）
//   實作了：GET /rest/v1/MF_feedback_public?select=*&order=id.desc&limit=…&offset=…&id=gte.N&id=lte.N&created_at=gte.ISO&created_at=lte.ISO
//          （同一個欄位寫兩次＝兩個條件都要成立，跟 PostgREST 一樣）、CORS 預檢（OPTIONS）、
//          金鑰檢查（apikey 標頭）、單次回傳筆數上限（maxRows，Supabase 預設 1000）。
//   錯誤的樣子照 Supabase 的真實回應：anon 金鑰讀被鎖的資料表 → 401 + code 42501；金鑰亂寫 → 401 Invalid API key；找不到資料表 → 404 + PGRST205。
import http from 'node:http';

// 產生 n 筆假意見（id 從 1 到 n，時間每筆差 stepMin 分鐘，整分整點＋小數 .123456 秒，跟 Postgres 回傳的格式一樣）
export function makeRows(n, opts) {
  const o = Object.assign({ startMs: Date.UTC(2026, 9, 1, 2, 0, 0), stepMin: 41 }, opts || {});
  const games = [['coins', '零錢分類'], ['paint', '刷油漆'], ['sudokuone', '數獨猜一格'], ['rainbow', '七彩陷阱'], ['invoice', '對發票'], ['pillbox', '分藥盒']];
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const g = games[i % games.length];
    const t = new Date(o.startMs + i * o.stepMin * 60000);
    let message = '第 ' + i + ' 則意見：這一款有點難，希望再慢一點。';
    if (i % 10 === 4) message = '第 ' + i + ' 則：第一行\n第二行（有換行）\n第三行';
    if (i === 7) message = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> 這是一則會害人的意見';
    if (i === 9) message = '很長的意見：' + '字'.repeat(280);
    rows.push({
      id: i,
      game_id: g[0],
      game_title: g[1],
      player_id: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'),
      nickname: i % 3 === 0 ? null : '玩家' + i,
      message,
      app_version: '1.23.0',
      created_at: t.toISOString().replace(/\.\d{3}Z$/, '.123456+00:00')
    });
  }
  return rows;
}

// 啟動伺服器。opts：rows（資料，可以事後直接改陣列內容）、maxRows、goodKey（接受的 apikey，網頁用的是公開的 anon 金鑰）、mode
// 回傳 { port, url, requests, rows, close() }；requests 記著收到的每一個 GET 請求（查詢字串與標頭），測試用來檢查網頁送了什麼
export function startMock(opts) {
  const o = Object.assign({ rows: makeRows(60), maxRows: 1000, goodKey: 'GOOD', mode: 'ok' }, opts || {});
  const requests = [];

  // 判斷一列資料符不符合一個條件，例如 col='id'、cond='gte.10'
  function matches(row, col, cond) {
    const m = /^(eq|gt|gte|lt|lte)\.(.*)$/.exec(cond);
    if (!m) return true;
    let a = row[col], b = m[2];
    if (col === 'created_at') { a = Date.parse(a); b = Date.parse(b); } else { a = Number(a); b = Number(b); }
    switch (m[1]) {
      case 'eq': return a === b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
    }
    return true;
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://mock');
    // CORS：網頁從 file:// 開（來源是 null）也要能連，所以什麼來源都放行；標頭照預檢要求的回覆
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'apikey, authorization, content-type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    requests.push({ method: req.method, path: u.pathname, query: u.search.slice(1), apikey: req.headers['apikey'] || null, authorization: req.headers['authorization'] || null });
    const delay = o.latencyMs || 0;
    setTimeout(() => {
      const key = req.headers['apikey'];
      if (key !== o.goodKey) return send(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
      // 資料表本身永遠鎖住（跟真的資料庫一樣）
      if (u.pathname === '/rest/v1/MF_feedback') return send(401, { code: '42501', details: null, hint: null, message: 'permission denied for table MF_feedback' });
      if (u.pathname !== '/rest/v1/MF_feedback_public' || o.mode === 'noview') return send(404, { code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public." + u.pathname.split('/').pop() + "' in the schema cache" });
      if (o.mode === 'locked') return send(401, { code: '42501', details: null, hint: null, message: 'permission denied for view MF_feedback_public' });
      // 檢視表：沒有 player_id 這一欄
      let rows = o.rows.map(r => { const c = Object.assign({}, r); delete c.player_id; return c; });
      // 篩選
      for (const col of ['id', 'created_at']) for (const cond of u.searchParams.getAll(col)) rows = rows.filter(r => matches(r, col, cond));
      // 排序（只支援 id／created_at 的 asc／desc）
      const ord = /^(\w+)\.(asc|desc)$/.exec(u.searchParams.get('order') || '');
      if (ord) {
        const [, col, dir] = ord, sgn = dir === 'desc' ? -1 : 1;
        rows.sort((a, b) => (col === 'created_at' ? Date.parse(a[col]) - Date.parse(b[col]) : a[col] - b[col]) * sgn);
      }
      // 翻頁：offset 先跳過幾列，limit 與伺服器上限取小的
      const offset = Number(u.searchParams.get('offset') || 0);
      const limit = Math.min(Number(u.searchParams.get('limit') || o.maxRows), o.maxRows);
      const page = rows.slice(offset, offset + limit);
      res.setHeader('Content-Range', page.length ? offset + '-' + (offset + page.length - 1) + '/*' : '*/*');
      send(200, page);
    }, delay);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        port, url: 'http://127.0.0.1:' + port, requests, rows: o.rows,
        close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); })
      });
    });
  });
}
