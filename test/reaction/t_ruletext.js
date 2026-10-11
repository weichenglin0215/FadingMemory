// 玩法說明的排版（js/dialog.js 的 Dlg.richText／emParts／lines）與全部遊戲的 rule 文字檢查（V1.23.0）：
//   · 一句一行：句尾標點（。！？；）後換行；緊接著的右引號／右括號不單獨換行；\n 是手動換行
//   · 重點句子用 ** 包起來，粗體黑字；** 沒成對時整句當一般文字
//   · 零秒出手的說明要排成使用者指定的三行，而且「心裡默數至零」「剩下的 3 秒要靠自己在心裡默數」是重點
//   · 全部遊戲：每一款都有重點、** 成對、沒有字被吃掉、每一行都是完整的一句、遊戲名稱不超過 5 個字
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { loadAllGames } = require('../leaderboard/all_games.cjs');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const games = loadAllGames();
require(ROOT + 'js/dialog.js');          // 換成真的彈窗公版（載入器裡的 Dlg 只是替身）
const T = global.Dlg.test;
const plain = (segs) => segs.map(s => s.t).join('');
const linesOf = (t) => T.lines(t).map(plain);

// ═══ 1. emParts：** 成對／不成對 ═══
ok(JSON.stringify(T.emParts('甲**乙**丙')) === JSON.stringify([{ t: '甲', em: false }, { t: '乙', em: true }, { t: '丙', em: false }]), 'emParts 基本');
ok(JSON.stringify(T.emParts('**乙**')) === JSON.stringify([{ t: '乙', em: true }]), '整句都是重點');
ok(JSON.stringify(T.emParts('甲**乙')) === JSON.stringify([{ t: '甲乙', em: false }]), '落單的 ** 忽略、整句一般文字');
ok(JSON.stringify(T.emParts('甲**乙**丙**丁')) === JSON.stringify([{ t: '甲', em: false }, { t: '乙', em: true }, { t: '丙丁', em: false }]), '三個 **：最後一個落單的忽略');
ok(T.emParts('').length === 0 && T.emParts(null).length === 0 && T.emParts(undefined).length === 0, '空字串／null');
ok(T.emParts('abc').length === 1 && T.emParts('abc')[0].em === false, '沒有 ** 就是一段一般文字');

// ═══ 2. lines：換行規則 ═══
ok(JSON.stringify(linesOf('甲。乙。丙。')) === JSON.stringify(['甲。', '乙。', '丙。']), '句號後換行');
ok(JSON.stringify(linesOf('甲；乙！丙？丁。')) === JSON.stringify(['甲；', '乙！', '丙？', '丁。']), '；！？也換行');
ok(JSON.stringify(linesOf('甲，乙，丙。')) === JSON.stringify(['甲，乙，丙。']), '逗號、頓號不換行');
ok(JSON.stringify(linesOf('按下「重疊！」。每次只能按一次。')) === JSON.stringify(['按下「重疊！」。', '每次只能按一次。']), '引號裡的！後面接」。→ 到。才換行');
ok(JSON.stringify(linesOf('點「重疊！」按鈕。')) === JSON.stringify(['點「重疊！」按鈕。']), '！」後面接字（不是句尾標點）→ 不換行');
ok(JSON.stringify(linesOf('甲（乙。）丙。')) === JSON.stringify(['甲（乙。）丙。']), '。）後面接字 → 不換行');
ok(JSON.stringify(linesOf('甲。』乙。')) === JSON.stringify(['甲。』乙。']), '。』後面接字 → 不換行');
ok(JSON.stringify(linesOf('甲。！乙。')) === JSON.stringify(['甲。！', '乙。']), '連續的句尾標點算同一個句尾');
ok(JSON.stringify(linesOf('甲\n乙')) === JSON.stringify(['甲', '乙']), '\\n 手動換行');
ok(JSON.stringify(linesOf('甲？」\n乙。')) === JSON.stringify(['甲？」', '乙。']), '引號問句後手動換行');
ok(JSON.stringify(linesOf('  甲。  \n  乙。 ')) === JSON.stringify(['甲。', '乙。']), '行首行尾空白去掉');
ok(JSON.stringify(linesOf('甲。\n\n乙。')) === JSON.stringify(['甲。', '乙。']), '空行不產生空的一行');
ok(linesOf('').length === 0 && linesOf(null).length === 0, '空字串沒有任何一行');
ok(JSON.stringify(linesOf('甲乙丙')) === JSON.stringify(['甲乙丙']), '沒有標點 → 一行');
// 重點可以跨過標點，不能被切壞
const cross = T.lines('甲**乙。丙**丁。');
ok(cross.length === 2 && plain(cross[0]) === '甲乙。' && plain(cross[1]) === '丙丁。', '重點跨過句號：兩行文字正確');
ok(cross[0][1].em && cross[0][1].t === '乙。' && cross[1][0].em && cross[1][0].t === '丙' && !cross[1][1].em, '重點跨過句號：兩行各自保留重點旗標');

// ═══ 3. 零秒出手：使用者指定的三行＋兩個重點 ═══
const speed = games.filter(g => g.id === 'speed')[0];
const sl = T.lines(speed.rule);
ok(sl.length === 3, '零秒出手說明剛好三行（實際 ' + sl.length + ' 行）');
ok(plain(sl[0]) === '請在心裡默數至零，快速點擊按鈕，看看你差了幾秒。', '第 1 行：' + plain(sl[0] || []));
ok(plain(sl[1]) === '從 7.0000 開始倒數，畫面會顯示 X.XXXX 秒；', '第 2 行：' + plain(sl[1] || []));
ok(plain(sl[2]) === '倒數到 4.0000 秒時，數字會慢慢變透明，到 3.0000 秒就完全看不見，剩下的 3 秒要靠自己在心裡默數。', '第 3 行：' + plain(sl[2] || []));
const emOf = (lines) => [].concat.apply([], lines).filter(s => s.em).map(s => s.t);
ok(JSON.stringify(emOf(sl)) === JSON.stringify(['心裡默數至零', '剩下的 3 秒要靠自己在心裡默數']), '零秒出手的重點：' + emOf(sl).join(' / '));

// ═══ 4. 全部遊戲的 rule ═══
const ids = new Set();
games.forEach(g => {
  const tag = g.id + '「' + g.name + '」';
  ids.add(g.id);
  ok(typeof g.rule === 'string' && g.rule.length > 20, tag + ' 有玩法說明');
  ok((g.rule.split('**').length - 1) % 2 === 0, tag + ' 的 ** 成對');
  ok(!/\*\*\*/.test(g.rule), tag + ' 沒有 ***');
  const L = T.lines(g.rule);
  const ems = emOf(L);
  ok(ems.length >= 1, tag + ' 至少有 1 個重點');
  ok(ems.length <= 4, tag + ' 重點不超過 4 個（太多就不是重點了）：' + ems.length);
  ok(ems.every(e => e.replace(/\s/g, '').length >= 4), tag + ' 每個重點至少 4 個字：' + ems.filter(e => e.replace(/\s/g, '').length < 4).join('/'));
  const emLen = ems.join('').length, allLen = plain([].concat.apply([], L)).length;
  ok(emLen / allLen <= 0.6, tag + ' 重點的字數不超過全文 60%（' + (emLen / allLen * 100).toFixed(0) + '%）');
  // 沒有字被吃掉：把 ** 和換行拿掉、空白去掉，兩邊要一樣
  const strip = (s) => s.replace(/\*\*/g, '').replace(/\n/g, '').replace(/\s+/g, '');
  ok(strip(plain([].concat.apply([], L))) === strip(g.rule), tag + ' 排版後文字沒有增減');
  ok(L.length >= 2 && L.length <= 9, tag + ' 分成 2～9 行（' + L.length + ' 行）');
  L.forEach((segs, i) => {
    const t = plain(segs);
    ok(t.length >= 5, tag + ' 第 ' + (i + 1) + ' 行不會太短：「' + t + '」');
    ok(t.length <= 110, tag + ' 第 ' + (i + 1) + ' 行不會太長（' + t.length + ' 字）');
    ok(/[。！？；]$|[。！？；][」』）)]*$/.test(t) || i === L.length - 1 || /[」』）)]$/.test(t), tag + ' 第 ' + (i + 1) + ' 行以句尾標點結束：「' + t.slice(-8) + '」');
  });
  const last = plain(L[L.length - 1]);
  ok(/[。！？]$|[。！？][」』）)]$/.test(last), tag + ' 最後一行以句號／驚嘆號／問號結束：「' + last.slice(-8) + '」');
  // 遊戲名稱最多 5 個字（選單格子的名稱列只放得下 5 個字）
  ok(Array.from(g.name).length <= 5, tag + ' 名稱不超過 5 個字（' + Array.from(g.name).length + '）');
});
ok(ids.size === games.length && games.length === 108, '108 款遊戲 id 不重複（' + games.length + '）');

// ═══ 5. 原始碼：每款的 rule 行都只有一行（沒有被 \n 切斷）、檔案語法正確 ═══
const names = games.map(g => g.file);
names.forEach(f => {
  const src = fs.readFileSync(ROOT + 'js/' + f, 'utf8');
  const m = src.match(/^\s*rule:\s*'.*'\s*,?\s*$/gm);
  ok(m && m.length === 1, f + ' 只有一行 rule');
});

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
process.exitCode = bad ? 1 : 0;
