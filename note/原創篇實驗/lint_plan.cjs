// 企劃文件檢查（原創篇）：編號連續、id／名稱合規與不重複（含現有遊戲、舊企劃）、欄位齊全、統計各類數量。
// 用法：node lint_plan.cjs [要檢查的 md 檔路徑]   （預設檢查上一層的 新遊戲企劃100款_原創篇.md）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const file = process.argv[2] || path.join(__dirname, '..', '新遊戲企劃100款_原創篇.md');
const text = fs.readFileSync(file, 'utf8');
const FIRST = 521;

// ---- 現有遊戲 id 與名稱（menu.js 的 GAME_CELLS） ----
const menu = fs.readFileSync(path.join(ROOT, 'js/menu.js'), 'utf8');
const existing = []; { const re = /\{\s*id:\s*'([a-z0-9]+)',\s*name:\s*'([^']+)',\s*cat:/g; let m; while ((m = re.exec(menu))) existing.push({ id: m[1], name: m[2] }); }
const exIds = new Set(existing.map(e => e.id)), exNames = new Set(existing.map(e => e.name));

// ---- 舊企劃文件裡出現過的 id 與名稱 ----
const oldDocs = ['新遊戲企劃50款.md', '新遊戲企劃100款.md', '新遊戲企劃120款.md', '新遊戲企劃200款.md', '新遊戲企劃100款_深思篇.md', '遊戲構想30款.md', '後續要製作的遊戲.md'];
const oldIds = new Map(), oldNames = new Map();
for (const d of oldDocs) {
    const p = path.join(ROOT, 'note', d); if (!fs.existsSync(p)) continue; const t = fs.readFileSync(p, 'utf8');
    let m; const re1 = /^#{2,3}\s*(\d{1,3})\s+([^（(\s　]+)(?:（([a-z0-9]+)）)?/gm;
    while ((m = re1.exec(t))) { oldNames.set(m[2], d + ' #' + m[1]); if (m[3]) oldIds.set(m[3], d + ' #' + m[1]); }
}

// 已經實作的款（V1.42.0，見企劃 §8.5）：現有遊戲清單裡出現它自己的 id／名稱不算撞名
const IMPLEMENTED = [523, 525, 530, 531, 538, 542, 544, 582];
const cards = []; const errors = [], warns = [];
const parts = text.split(/\n(?=### \d{3} )/);
for (const part of parts) {
    const h = part.match(/^### (\d{3}) ([^（\n]+)（([^）\n]*)）\s*\n/);
    if (!h) continue;
    const [, num, name, id] = h;
    const lines = part.split('\n');
    const cut = part.search(/\n## /); // 卡片到下一個二級標題為止
    cards.push({ num: +num, name: name.trim(), id: id.trim(), header: lines[1] || '', body: cut >= 0 ? part.slice(0, cut) : part });
}

const errs = (c, msg) => errors.push(c.num + ' ' + c.name + '：' + msg);
const warn = (c, msg) => warns.push(c.num + ' ' + c.name + '：' + msg);
const seenIds = new Set(), seenNames = new Set();
const stat = { cat: {}, fail: {}, origin: {}, risk: {} };
const REQUIRED = ['玩法', '頓悟與難度', '出題與捷徑', '揭曉', '原創自審'];
cards.forEach((c, i) => {
    if (c.num !== FIRST + i) errs(c, '編號不連續（預期 ' + (FIRST + i) + '）');
    if (!/^[a-z0-9]+$/.test(c.id)) errs(c, 'id 不合規：' + c.id);
    if (c.id.length < 3) warn(c, 'id 太短：' + c.id);
    if (seenIds.has(c.id)) errs(c, 'id 重複：' + c.id); seenIds.add(c.id);
    const built = IMPLEMENTED.includes(c.num);            /* 已經實作的款：現有遊戲裡有它自己是正常的（id 可能改過名） */
    if (exIds.has(c.id) && !built) errs(c, 'id 與現有遊戲重複：' + c.id);
    if (oldIds.has(c.id)) errs(c, 'id 與舊企劃重複：' + oldIds.get(c.id));
    const len = [...c.name].length;
    if (len < 2 || len > 5) errs(c, '名稱長度 ' + len + '（要 2～5 字）');
    if (seenNames.has(c.name)) errs(c, '名稱重複'); seenNames.add(c.name);
    if (exNames.has(c.name) && !built) errs(c, '名稱與現有遊戲重複');
    if (oldNames.has(c.name)) errs(c, '名稱與舊企劃重複：' + oldNames.get(c.name));
    // 標頭：類別｜操作｜失敗型｜原創度｜風險
    const f = c.header.split('｜');
    if (f.length !== 5) errs(c, '標頭欄位數 ' + f.length + '（要 5 欄）：' + c.header);
    else {
        const cat = f[0].trim(); if (!['邏輯', '數字', '記憶'].includes(cat)) errs(c, '類別不是 邏輯／數字／記憶：' + cat);
        const ft = f[2].trim()[0]; if (!'ABCDF'.includes(ft)) errs(c, '失敗型不是 A／B／C／D／F');
        const o = f[3].trim().match(/^(★★★|★★)(?!★)/); if (!o) errs(c, '原創度欄不是 ★★★／★★');
        if (o && o[1] === '★★' && !/借用/.test(f[3])) errs(c, '★★ 要寫明「借用：…」');
        const r = f[4].trim().match(/^風險(中高|中|低|高)/); if (!r) errs(c, '風險欄格式錯');
        stat.cat[cat] = (stat.cat[cat] || 0) + 1;
        stat.fail[ft] = (stat.fail[ft] || 0) + 1;
        if (o) stat.origin[o[1]] = (stat.origin[o[1]] || 0) + 1;
        if (r) stat.risk[r[1]] = (stat.risk[r[1]] || 0) + 1;
        c.cat = cat; c.fail = ft; c.origin = o ? o[1] : '?'; c.risk = r ? r[1] : '?';
    }
    for (const k of REQUIRED) { const n = (c.body.match(new RegExp('\\*\\*' + k + '\\*\\*：', 'g')) || []).length; if (n !== 1) errs(c, '欄位「' + k + '」出現 ' + n + ' 次'); }
    const sec = c.body.match(/\*\*出題與捷徑\*\*：([^\n]*)/);
    if (sec) { if (!/捷徑：/.test(sec[1])) errs(c, '「出題與捷徑」沒有「捷徑：」'); else { const t = sec[1].split('捷徑：')[1]; const n = (t.match(/[①②③④⑤]/g) || []).length; if (n < 2) errs(c, '捷徑少於 2 條（' + n + '）'); } }
    const sec2 = c.body.match(/\*\*頓悟與難度\*\*：([^\n]*)/);
    if (sec2 && !/→/.test(sec2[1])) warn(c, '「頓悟與難度」沒有「→」（缺起訖？）');
    const sec3 = c.body.match(/\*\*原創自審\*\*：([^\n]*)/);
    if (sec3 && !/最像/.test(sec3[1])) errs(c, '「原創自審」沒有寫「最像」的已知東西');
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(c.body.replace(/★/g, ''))) errs(c, '含 emoji');
    c.len = [...c.body].length; if (c.len > 1300) warn(c, '卡片偏長：' + c.len + ' 字');
});
if (cards.length !== 100) errors.push('卡片數 ' + cards.length + '（要 100）');
console.log('卡片數：' + cards.length + '｜現有遊戲 ' + existing.length + ' 款｜舊企劃名稱 ' + oldNames.size + ' 個、id ' + oldIds.size + ' 個');
console.log('類別：', JSON.stringify(stat.cat), '｜失敗型：', JSON.stringify(stat.fail), '｜原創度：', JSON.stringify(stat.origin), '｜風險：', JSON.stringify(stat.risk));
const lens = cards.map(c => c.len).sort((a, b) => a - b); if (lens.length) console.log('卡片字數：最短 ' + lens[0] + '、中位 ' + lens[lens.length >> 1] + '、最長 ' + lens[lens.length - 1] + '、總計 ' + lens.reduce((a, b) => a + b, 0));
console.log('--- 錯誤 ' + errors.length + ' 項'); errors.forEach(e => console.log('  ✗ ' + e));
console.log('--- 提醒 ' + warns.length + ' 項'); warns.forEach(e => console.log('  △ ' + e));
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(cards.map(c => ({ num: c.num, name: c.name, id: c.id, cat: c.cat, fail: c.fail, origin: c.origin, risk: c.risk })), null, 1));
process.exitCode = errors.length ? 1 : 0;
