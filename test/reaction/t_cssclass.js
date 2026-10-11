// CSS class 名稱不能被兩款遊戲共用（V1.24 新增）
//
// 為什麼要檢查：所有遊戲的 CSS（css/reaction.css～reaction5.css）是「一次全部載入」的，
// 兩款遊戲只要用了同一個 class 名稱（例如 pb-cell），後面那一份規則就會蓋掉前面那一份，
// 結果是其中一款遊戲的版面莫名其妙跑掉（V1.24 真的發生過兩次：
//   · 藥盒（pillbox）和路人（passersby）都用 .pb-cell  → 藥盒的格子寬度不聽話；
//   · 秤麵包（bread）和接籃子（basket）都用 .bk-info → 秤麵包的資訊列位置不對）。
// 所以每款遊戲的 class 都要用「自己專屬的前綴」，這支測試掃描所有遊戲檔，找出被兩款以上遊戲使用的 class。
//
// 掃描方式：只看遊戲檔案裡「字串字面值」寫的 class 名稱（'class': '…'、className = '…'、classList.add('…')、
// querySelector('.…')、stageClass: '…'），不看 CSS 檔，所以不會被註解或別的規則干擾。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'js');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

// ── 已知而且是「故意」的共用，或是已知但還沒處理的共用 ──
//   mixcolor（混出什麼色）故意借用 matchcolor（記色調色）那一組 mc- 的版面，兩款的外觀本來就要一樣。
//   cr-track／cr-knob：catroad（貓咪走山路）和 colorrecall（記色調色）撞名，目前兩款的外觀是「兩份規則疊在一起」的結果，
//   使用者已經看過現在的樣子，所以先不動；要改的話，把其中一款的 cr- 換成別的前綴，並且同步改 CSS。
const ALLOW = {
  'mc-bg': ['matchcolor', 'mixcolor'], 'mc-block': ['matchcolor', 'mixcolor'], 'mc-field': ['matchcolor', 'mixcolor'],
  'mc-gap': ['matchcolor', 'mixcolor'], 'mc-gap--closed': ['matchcolor', 'mixcolor'], 'mc-hint': ['matchcolor', 'mixcolor'],
  'cr-knob': ['catroad', 'colorrecall'], 'cr-track': ['catroad', 'colorrecall'], 'cr-stage': ['catroad', 'colorrecall']
};
// 共用元件（kit、彈窗、按鈕…）本來就是大家一起用的，不算
const SHARED = /^(rx|ld|btn|hint|qz|dlg|bar|ui|screen|flip|rt)-/;

// 取出一份 JS 原始碼裡所有 class 名稱字串
function classesOf(src) {
  const strs = [];
  const grab = (re) => { src.replace(re, (m, a) => { strs.push(a); return m; }); };
  grab(/'class':\s*'([^']*)'/g);
  grab(/'class':\s*"([^"]*)"/g);
  grab(/className\s*=\s*'([^']*)'/g);
  grab(/classList\.(?:add|remove|toggle|contains)\(\s*'([^']*)'/g);
  grab(/stageClass:\s*'([^']*)'/g);
  grab(/\bcls:\s*'([^']*)'/g);
  src.replace(/querySelector(?:All)?\(\s*'([^']*)'/g, (m, a) => { strs.push(a.replace(/\./g, ' ')); return m; });
  const out = new Set();
  strs.forEach(t => t.split(/\s+/).forEach(c => { if (/^[a-z]{1,8}-[a-z0-9_-]+$/.test(c)) out.add(c); }));
  return out;
}

const files = fs.readdirSync(ROOT).filter(f => /^reaction_.+\.js$/.test(f) && !/^reaction_(core|kit\d*)\.js$/.test(f));
ok(files.length >= 100, '找到的遊戲檔案數量（應該有 100 多個）：' + files.length);
const used = {};                                   // class → [遊戲 id…]
files.forEach(f => {
  const id = f.replace(/^reaction_|\.js$/g, '');
  classesOf(fs.readFileSync(path.join(ROOT, f), 'utf8')).forEach(c => { (used[c] = used[c] || []).push(id); });
});

let shared = 0;
Object.keys(used).sort().forEach(c => {
  if (used[c].length < 2 || SHARED.test(c)) return;
  shared++;
  const allowed = ALLOW[c];
  const same = allowed && used[c].length === allowed.length && used[c].slice().sort().join() === allowed.slice().sort().join();
  ok(same, 'class「' + c + '」被這幾款遊戲同時使用：' + used[c].join('、') + '（每款遊戲的 class 要用自己專屬的前綴，不然 CSS 會互相蓋掉）');
});
// 允許清單裡的項目如果已經不再共用了，要把它從清單拿掉（不讓清單越積越長）
Object.keys(ALLOW).forEach(c => ok(used[c] && used[c].length >= 2, '允許清單裡的「' + c + '」已經沒有被共用了，請從 t_cssclass.js 的 ALLOW 拿掉'));

// 抽樣確認掃描真的有掃到東西（避免正規表示式壞掉時「沒掃到＝全部通過」）
ok(used['pb-cell'] && used['pb-cell'].join() === 'pillbox', '藥盒的 pb-cell 只有藥盒在用：' + (used['pb-cell'] || []).join('、'));
ok(used['psb-cell'] || Object.keys(used).some(c => /^psb-/.test(c)), '路人（passersby）改用 psb- 前綴');
ok(used['bsk-info'] && used['bk-info'] && used['bk-info'].join() === 'bread' && used['bsk-info'].join() === 'basket', 'bread 用 bk-、basket 用 bsk-');
console.log('掃描 ' + files.length + ' 個遊戲檔、' + Object.keys(used).length + ' 個 class 名稱；被兩款以上共用的有 ' + shared + ' 個（全部都在允許清單裡）');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
