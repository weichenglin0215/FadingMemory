// 企劃文件檢查：編號連續、id/名稱合規與不重複、欄位齊全、統計各類數量。
// 用法：node lint.cjs <要檢查的 md 檔路徑...>   （可傳多個 part 檔，會依序合併）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(__dirname, '..', '新遊戲企劃100款_深思篇.md')];
const text = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

// ---- 現有遊戲 id 與名稱（menu.js 的 GAME_CELLS） ----
const menu = fs.readFileSync(path.join(ROOT, 'js/menu.js'), 'utf8');
const existing = []; { const re = /\{\s*id:\s*'([a-z0-9]+)',\s*name:\s*'([^']+)',\s*cat:/g; let m; while ((m = re.exec(menu))) existing.push({ id: m[1], name: m[2] }); }
const exIds = new Set(existing.map(e => e.id)), exNames = new Set(existing.map(e => e.name));

// ---- 舊企劃文件裡出現過的 id 與名稱（用來標示「復活」與避免撞名） ----
const oldDocs = ['新遊戲企劃50款.md', '新遊戲企劃100款.md', '新遊戲企劃120款.md', '新遊戲企劃200款.md', '遊戲構想30款.md', '後續要製作的遊戲.md'];
const oldIds = new Map(), oldNames = new Map();
for (const d of oldDocs) {
  const p = path.join(ROOT, 'note', d); if (!fs.existsSync(p)) continue; const t = fs.readFileSync(p, 'utf8');
  let m; const re1 = /^#{2,3}\s*(\d{1,3})\s+([^（(\s　]+)(?:（([a-z0-9]+)）)?/gm;
  while ((m = re1.exec(t))) { oldNames.set(m[2], d + ' #' + m[1]); if (m[3]) oldIds.set(m[3], d + ' #' + m[1]); }
}

const cards = []; const errors = [], warns = [];
const parts = text.split(/\n(?=### \d{3} )/);
for (const part of parts) {
  const h = part.match(/^### (\d{3}) ([^（\n]+)（([^）\n]*)）\s*\n/);
  if (!h) continue;
  const [, num, name, id] = h;
  const lines = part.split('\n');
  const header = lines[1] || '';
  const cut = part.search(/\n## /); // 卡片到下一個二級標題為止
  const card = { num: +num, name: name.trim(), id: id.trim(), header, body: cut >= 0 ? part.slice(0, cut) : part };
  cards.push(card);
}

const errs = (c, msg) => errors.push(c.num + ' ' + c.name + '：' + msg);
const warn = (c, msg) => warns.push(c.num + ' ' + c.name + '：' + msg);
const seenIds = new Set(), seenNames = new Set();
const stat = { cat: {}, fail: {}, origin: {}, risk: {} };
const REQUIRED = ['玩法', '頓悟與難度', '出題與捷徑', '揭曉', '題材與自審'];
cards.forEach((c, i) => {
  if (c.num !== 421 + i) errs(c, '編號不連續（預期 ' + (421 + i) + '）');
  if (!/^[a-z0-9]+$/.test(c.id)) errs(c, 'id 不合規：' + c.id);
  if (c.id.length < 3) warn(c, 'id 太短：' + c.id);
  if (seenIds.has(c.id)) errs(c, 'id 重複：' + c.id); seenIds.add(c.id);
  if (exIds.has(c.id)) errs(c, 'id 與現有遊戲重複：' + c.id);
  if (oldIds.has(c.id)) warn(c, 'id 曾出現在舊企劃：' + oldIds.get(c.id));
  const len = [...c.name].length;
  if (len < 2 || len > 5) errs(c, '名稱長度 ' + len + '（要 2～5 字）');
  if (seenNames.has(c.name)) errs(c, '名稱重複'); seenNames.add(c.name);
  if (exNames.has(c.name)) errs(c, '名稱與現有遊戲重複');
  if (oldNames.has(c.name)) warn(c, '名稱曾出現在舊企劃：' + oldNames.get(c.name));
  // 標頭
  const f = c.header.split('｜');
  if (f.length !== 5) errs(c, '標頭欄位數 ' + f.length + '（要 5 欄）：' + c.header);
  else {
    if (!['邏輯', '數字', '記憶'].includes(f[0].trim())) errs(c, '類別不是 邏輯／數字／記憶：' + f[0]);
    const ft = f[2].trim()[0]; if (!'ABCDE'.includes(ft)) errs(c, '失敗型不是 A～E');
    if (!/^(新|復活|改編)/.test(f[3].trim())) errs(c, '來源欄不是 新／復活／改編');
    if (!/^風險(低|中高|中)/.test(f[4].trim())) errs(c, '風險欄格式錯');
    stat.cat[f[0].trim()] = (stat.cat[f[0].trim()] || 0) + 1;
    stat.fail[ft] = (stat.fail[ft] || 0) + 1;
    const o = f[3].trim().match(/^(新|復活|改編)/)[1]; stat.origin[o] = (stat.origin[o] || 0) + 1;
    const r = f[4].trim().match(/^風險(中高|中|低)/); if (r) stat.risk[r[1]] = (stat.risk[r[1]] || 0) + 1;
  }
  for (const k of REQUIRED) { const n = (c.body.match(new RegExp('\\*\\*' + k + '\\*\\*：', 'g')) || []).length; if (n !== 1) errs(c, '欄位「' + k + '」出現 ' + n + ' 次'); }
  const sec = c.body.match(/\*\*出題與捷徑\*\*：([^\n]*)/);
  if (sec) { if (!/捷徑：/.test(sec[1])) errs(c, '「出題與捷徑」沒有「捷徑：」'); else { const t = sec[1].split('捷徑：')[1]; const n = (t.match(/[①②③④⑤]/g) || []).length; if (n < 2) errs(c, '捷徑少於 2 條（' + n + '）'); } }
  const sec2 = c.body.match(/\*\*頓悟與難度\*\*：([^\n]*)/);
  if (sec2 && !/[→]/.test(sec2[1])) warn(c, '「頓悟與難度」沒有「→」（缺起訖？）');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(c.body)) errs(c, '含 emoji');
  const bodyLen = [...c.body].length; if (bodyLen > 1100) warn(c, '卡片偏長：' + bodyLen + ' 字');
  c.len = bodyLen;
});
if (cards.length !== 100) errors.push('卡片數 ' + cards.length + '（要 100）');
console.log('卡片數：' + cards.length + '｜現有遊戲 ' + existing.length + ' 款｜舊企劃名稱 ' + oldNames.size + ' 個');
console.log('類別：', JSON.stringify(stat.cat), '｜失敗型：', JSON.stringify(stat.fail), '｜來源：', JSON.stringify(stat.origin), '｜風險：', JSON.stringify(stat.risk));
const lens = cards.map(c => c.len).sort((a, b) => a - b); console.log('卡片字數：最短 ' + lens[0] + '、中位 ' + lens[lens.length >> 1] + '、最長 ' + lens[lens.length - 1] + '、總計 ' + lens.reduce((a, b) => a + b, 0));
console.log('--- 錯誤 ' + errors.length + ' 項'); errors.forEach(e => console.log('  ✗ ' + e));
console.log('--- 提醒 ' + warns.length + ' 項'); warns.forEach(e => console.log('  △ ' + e));
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(cards.map(c => ({ num: c.num, name: c.name, id: c.id, header: c.header, oldName: oldNames.get(c.name) || '', oldId: oldIds.get(c.id) || '' })), null, 1));
