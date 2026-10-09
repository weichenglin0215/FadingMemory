/* ═══════════════════════════════════════════════════════════════════
   reaction_pillbox.js — 秒反應・分藥盒
   先看一張「吃藥單」，記住每個時段要放幾顆什麼樣子的藥丸；單子收起來後，上方的格子會出現一堆藥丸
   （裡面混了干擾的藥丸），用手指把正確的藥丸**拖曳**到下方藥盒對應的格子。
   藥丸是虛構的彩色圖案，這是記憶遊戲，不是用藥建議。
   ───────────────────────────────────────────────────────────────────
   · 吃藥單：sheet[時段][藥種] ＝ 顆數。時段（早／午／晚／睡前）2 → 4 個，藥種（白圓／黃橢圓／藍方／粉三角）
     2 → 4 種，每格每種最多 1 → 3 顆；每個時段至少 1 顆；並且**至少有一對時段只差 1 顆**
     （近似干擾：早「白2黃1」、晚「白2黃2」，記憶時最容易混）。整張單子不會所有時段都一樣。
   · 上方的藥丸盤（makeTray）：
        ① 單子上用到的每一種藥丸：需要的總顆數（各時段加起來）＋ 隨機多放 0～EXTRA_MAX 顆（故意放多）；
        ② 干擾藥丸：單子上沒有的藥丸，跟單子上的某一種只差「形狀」或只差「顏色」（白橢圓、黃圓、藍三角、粉方），
           種類數 1 → 4（隨關卡），每種 1～3 顆。
        放進格子的藥丸只要種類或顆數跟單子不一樣就算錯，所以要同時記得「哪個時段、什麼藥丸、幾顆」。
   · 操作：按住藥丸拖曳到下方的格子放開；也可以直接點藥盤裡的藥丸（放進目前選取的格子，點格子可換選取）；
     點格子裡的藥丸，藥丸就回到藥盤；「清空這格」把這格的藥丸全部放回去；「好了」送出。
   · 流程：看單子 SHOW 秒（倒數條）→ 單子蓋起來、藥盤出現 → 限時（FILL_BASE ＋ FILL_PER_PILL × 需要的顆數）填藥盒
     → 完全相同才算過關。時間到了不會直接算輸：先判斷藥盒，已經放對就過關。
   · 難度（第 1 → LEVEL_RAMP 關線性或依關卡解鎖）：時段 2/3/4（第 1/6/11 關）、藥種 2 → 4、每格上限 1 → 3、
     看單子時間 10 → 5 秒、干擾藥丸種類 1 → 4。
   · 有 LIVES 次機會，成績＝通過關數（越多越好）；失敗後可從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'pillbox';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 pillbox 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 難度與數量的設定都集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 15;
    /* 陣列 [1, 6, 11]：第 1 關起 2 個時段、第 6 關起 3 個、第 11 關起 4 個（slotCount 會用到） */
    var SLOT_AT = [1, 6, 11];               /* 第幾關起時段數變成 2、3、4 */
    var KINDS_START = 2, KINDS_END = 4;
    var MAXCNT_START = 1, MAXCNT_END = 3;
    var SHOW_START = 10, SHOW_END = 5;      /* 看單子秒數 */
    var FILL_BASE = 12, FILL_PER_PILL = 1.8; /* 填藥盒的限時：基本秒數 + 每顆需要的藥丸再加幾秒（要拖曳，比點的慢）*/
    var EXTRA_START = 1, EXTRA_END = 3;     /* 單子上的藥丸，故意多放幾顆（上限）*/
    var DECOY_START = 1, DECOY_END = 4;     /* 干擾藥丸的種類數 */
    var MAX_TRAY = 50;                      /* 藥丸盤最多放幾顆 */
    var DRAG_MOVE_PX = 8;                   /* 手指移動超過這麼多 px 才算拖曳（不然算點一下）*/
    var LIVES = 2;
    /* 四個時段的名稱 */
    var SLOT_NAME = ['早', '午', '晚', '睡前'];
    /* 8 種藥丸的名稱：編號 0～3 是單子上會出現的，4～7 是干擾藥丸（和 0～3 只差形狀或只差顏色） */
    var KIND_NAME = ['白圓', '黃橢圓', '藍方', '粉三角', '白橢圓', '黃圓', '藍三角', '粉方'];       /* 0～3 是單子上會出現的，4～7 是干擾藥丸 */
    /* 8 種藥丸的顏色（hsl＝色相、飽和度、亮度） */
    var KIND_COLOR = ['hsl(0,0%,96%)', 'hsl(46,92%,58%)', 'hsl(210,70%,58%)', 'hsl(335,75%,72%)', 'hsl(0,0%,96%)', 'hsl(46,92%,58%)', 'hsl(210,70%,58%)', 'hsl(335,75%,72%)'];
    /* 8 種藥丸的形狀代號（pillSvg 依它決定畫圓、橢圓、方形或三角形） */
    var KIND_SHAPE = ['circle', 'ellipse', 'square', 'tri', 'ellipse', 'circle', 'tri', 'square'];
    var N_KINDS = 8;

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 level 關有幾個時段：從 1 開始，每達到一個門檻就 +1 */
    function slotCount(level) { var n = 1; SLOT_AT.forEach(function (a, i) { if (level >= a) n = i + 2; }); return n; }
    /* 藥種數：kit.ramp 線性從 2 增加到 4，Math.round 四捨五入成整數 */
    function kindCount(level) { return Math.round(kit.ramp(level, KINDS_START, KINDS_END, LEVEL_RAMP)); }
    /* 每格每種最多幾顆 */
    function maxCnt(level) { return Math.round(kit.ramp(level, MAXCNT_START, MAXCNT_END, LEVEL_RAMP)); }
    /* 看單子的秒數（越來越短） */
    function showSec(level) { return kit.ramp(level, SHOW_START, SHOW_END, LEVEL_RAMP); }
    /* 故意多放的顆數上限 */
    function extraMax(level) { return Math.round(kit.ramp(level, EXTRA_START, EXTRA_END, LEVEL_RAMP)); }
    /* 干擾藥丸的種類數 */
    function decoyKinds(level) { return Math.round(kit.ramp(level, DECOY_START, DECOY_END, LEVEL_RAMP)); }
    /* 單子上總共要放幾顆：reduce 是「累加」——把每一列再累加成一個數字 */
    function needTotal(sheet) { return sheet.reduce(function (sum, row) { return sum + row.reduce(function (a, b) { return a + b; }, 0); }, 0); }
    /* 填藥盒的限時＝基本秒數 + 每顆需要的藥丸再加一點時間 */
    function fillSec(sheet) { return FILL_BASE + FILL_PER_PILL * needTotal(sheet); }
    /* 一列的總顆數 */
    function total(row) { return row.reduce(function (s, x) { return s + x; }, 0); }
    /* 兩列的差距：各藥種顆數差的絕對值加總 */
    function rowDiff(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; }
    /* 兩列是否完全相同 */
    function sameRow(a, b) { return rowDiff(a, b) === 0; }

    /* 出一張單子：回傳 { slots 時段數, kinds 藥種數, sheet[時段][藥種]＝顆數, nearPair 刻意只差 1 顆的兩個時段 } */
    /* 出一張單子：回傳 { slots, kinds, sheet:[[顆數…]…], nearPair:[a,b] } */
    /* rand = rand || Math.random：測試時會傳固定種子的亂數，讓結果可重現 */
    function makeSheet(level, rand) {
        rand = rand || Math.random;
        /* S 時段數、K 藥種數、M 每格每種上限 */
        var S = slotCount(level), K = kindCount(level), M = maxCnt(level);
        /* 隨機產生一列，並且至少要有 1 顆（do...while：先做再檢查條件） */
        function randRow() {
            var row;
            do { row = []; for (var k = 0; k < K; k++) row.push(kit.randInt(0, M, rand)); } while (total(row) < 1);
            return row;
        }
        /* 最多嘗試 400 次，直到產生符合所有規則的單子 */
        for (var tries = 0; tries < 400; tries++) {
            var sheet = []; for (var s = 0; s < S; s++) sheet.push(randRow());
            /* 挑一對時段，把其中一個改成「只差 1 顆」的近似版本（近似干擾：記憶時最容易混） */
            /* 挑一對時段，把其中一個改成「只差 1 顆」的近似版本 */
            var order = kit.shuffle(Array.apply(null, Array(S)).map(function (_, i) { return i; }), rand);
            var a = order[0], b = order[1];
            var base = sheet[a], nb = base.slice();
            var cand = [];
            for (var k = 0; k < K; k++) {
                if (nb[k] + 1 <= M) cand.push([k, 1]);
                if (nb[k] - 1 >= 0) cand.push([k, -1]);
            }
            /* shuffle 後用 some 逐一嘗試加或減 1 顆，找到第一個合法的就停（some 回傳 true 會中斷） */
            kit.shuffle(cand, rand).some(function (c) { var t = nb.slice(); t[c[0]] += c[1]; if (total(t) >= 1) { nb = t; return true; } return false; });
            if (rowDiff(base, nb) !== 1) continue;
            sheet[b] = nb;
            /* 整張單子不能每個時段都一樣 */
            /* 不能所有時段都一樣（S ≥ 3 時至少有一個不同；S = 2 時兩格本來就差 1 顆）*/
            var allSame = sheet.every(function (r) { return sameRow(r, sheet[0]); });
            if (allSame) continue;
            return { slots: S, kinds: K, sheet: sheet, nearPair: [a, b] };
        }
        /* 保底：理論上不會用到，萬一 400 次都失敗，就給一張固定的簡單單子 */
        /* 保底（理論上不會用到） */
        var fb = []; for (var i = 0; i < S; i++) fb.push([1].concat(Array(K - 1).fill(0)));
        fb[S - 1] = [1, 1].concat(Array(Math.max(0, K - 2)).fill(0));
        return { slots: S, kinds: K, sheet: fb, nearPair: [0, S - 1] };
    }
    /* 單子只有 K 種藥丸，補 0 補到 8 種才能和藥盒（8 種）比對 */
    /* 單子的一列補 0 補到 8 種藥丸，才能跟藥盒（8 種）比 */
    function pad(row) { var out = row.slice(); while (out.length < N_KINDS) out.push(0); return out; }
    /* 判定：藥盒的每一格都要和單子的對應列完全相同 */
    function judge(sheet, box) {
        if (sheet.length !== box.length) return false;
        for (var s = 0; s < sheet.length; s++) if (!sameRow(pad(sheet[s]), pad(box[s]))) return false;
        return true;
    }
    /* 把一列轉成文字（例如「白圓 2、黃橢圓 1」），顯示答錯原因用 */
    function rowText(row) {
        var t = [];
        row.forEach(function (c, k) { if (c > 0) t.push(KIND_NAME[k] + ' ' + c); });
        return t.length ? t.join('、') : '（空）';
    }
    /* 上方的藥丸盤：回傳每顆藥丸的種類編號 */
    /* 上方的藥丸盤：單子上每種藥丸「需要的總顆數 + 故意多放」＋ 干擾藥丸。回傳藥丸種類編號陣列（已洗牌）*/
    function makeTray(sheet, level, rand) {
        rand = rand || Math.random;
        /* list 是結果；K 是單子的藥種數 */
        var K = sheet[0].length, list = [], used = {};
        /* 對每一種藥丸：需要的總顆數 + 隨機多放幾顆 */
        for (var k = 0; k < K; k++) {
            var need = 0; sheet.forEach(function (row) { need += row[k]; });
            if (need > 0) used[k] = true;
            var cnt = need + (need > 0 ? kit.randInt(0, extraMax(level), rand) : kit.randInt(0, 1, rand));
            for (var i = 0; i < cnt; i++) list.push(k);
        }
        /* 干擾藥丸：編號 4～7，優先挑對應的單子藥丸存在的（更容易混淆） */
        /* 干擾藥丸：優先挑跟單子上的藥丸只差形狀或顏色的（4 白橢圓、5 黃圓、6 藍三角、7 粉方）*/
        var decoys = [4, 5, 6, 7].slice(0, 4), want = Math.min(4, decoyKinds(level));
        var order = decoys.slice().sort(function (a, b) { return (a - 4 < K ? 0 : 1) - (b - 4 < K ? 0 : 1); });      /* 對應的單子藥丸存在的排前面 */
        order.slice(0, want).forEach(function (d) { var c = kit.randInt(1, 3, rand); for (var i = 0; i < c; i++) list.push(d); });
        /* 總數超過 MAX_TRAY（大約每 30 個高關卡的藥丸盤會有 1 個）就拿掉多餘的藥丸，絕不拿掉必要的。
           拿的順序有三層，每一層都是在同一層的候選裡隨機挑一顆，這一層拿光了才換下一層：
             ① 先拿「故意多放」的（單子上有的藥種，超過需要顆數的那些）；
             ② 再拿干擾藥丸的「第 2 顆以後」——每一種干擾藥丸都至少留 1 顆，干擾藥丸的種類數才會照關卡（1 → 4 種）；
             ③ 還是放不下，才拿干擾藥丸的最後一顆（實際上不會發生：單子最多只需要 44 顆左右，再加 4 種干擾藥丸各 1 顆也不到 50）。
           （以前是把 ①② 混在一起隨機拿，偶爾會把某一種干擾藥丸整種拿光，甚至一次少兩三種，跟上面寫的順序不一樣。） */
        var need2 = Array(N_KINDS).fill(0);
        for (var kk = 0; kk < K; kk++) sheet.forEach(function (row) { need2[kk] += row[kk]; });
        var have = Array(N_KINDS).fill(0); list.forEach(function (c) { have[c]++; });
        while (list.length > MAX_TRAY) {
            var extraIdx = [], decoyMoreIdx = [], decoyLastIdx = [];
            list.forEach(function (c, i) {
                if (have[c] <= need2[c]) return;                  /* 必要的藥丸絕不拿 */
                if (c < 4) extraIdx.push(i);                      /* 編號 0～3：單子上會出現的藥種，多出來的就是「故意多放」 */
                else if (have[c] >= 2) decoyMoreIdx.push(i);      /* 編號 4～7 是干擾藥丸：這一種還有 2 顆以上，可以拿 */
                else decoyLastIdx.push(i);                        /* 這一種只剩最後 1 顆 */
            });
            var cand = extraIdx.length ? extraIdx : (decoyMoreIdx.length ? decoyMoreIdx : decoyLastIdx);
            if (!cand.length) break;
            var drop = cand[Math.floor(rand() * cand.length)]; have[list[drop]]--; list.splice(drop, 1);
        }
        /* 最後洗牌，藥丸在藥盤裡的順序是隨機的 */
        return kit.shuffle(list, rand);
    }

    /* 畫藥丸圖示：用 SVG 向量圖，k 是種類編號，size 是畫出來的邊長（px） */
    /* 藥丸圖示 */
    function pillSvg(k, size) {
        var s = kit.svg('svg', { 'class': 'pb-pill', viewBox: '0 0 40 40', width: size, height: size });
        var f = { fill: KIND_COLOR[k], stroke: 'rgba(74,59,30,0.65)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' };
        /* 小工具 m(標籤, 屬性)：建立形狀並合併共用的填色、外框屬性 */
        function m(tag, a) { var o = {}, x; for (x in a) o[x] = a[x]; for (x in f) o[x] = f[x]; kit.svg(tag, o, s); }
        var shape = KIND_SHAPE[k];
        if (shape === 'circle') m('circle', { cx: 20, cy: 20, r: 15 });
        else if (shape === 'ellipse') m('ellipse', { cx: 20, cy: 20, rx: 17, ry: 10 });
        else if (shape === 'square') m('rect', { x: 6, y: 6, width: 28, height: 28, rx: 5 });
        else m('polygon', { points: '20,5 35,33 5,33' });
        return s;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* level 關卡；cleared 已過幾關；lives 機會；state 目前階段（show 看單子/fill 填藥盒/judged 已判定）；lvId 關卡流水號 */
            var level = startAt || 1, cleared = level - 1, lives = LIVES, newRec = false, state = 'idle', lvId = 0;
            /* Sh 這關的單子；pills 所有藥丸 [{id, kind 種類, where 位置}]，where=-1 在藥盤、0..3 在對應時段的格子；sel 目前選取的格子 */
            var Sh = null, pills = [], sel = 0, nextId = 1;

            /* 建立畫面元素：標題、上方面板（先放單子後放藥盤）、藥盒、時間條、按鈕列、拖曳圖層 */
            var head = h('div', { 'class': 'pb-head' });
            var sheetEl = h('div', { 'class': 'pb-sheet' });
            var boxEl = h('div', { 'class': 'pb-box' });
            var tb = kit.timebar();
            var clear = h('button', { 'class': 'btn btn--line btn--sm pb-clear', text: '清空這格' });
            var done = h('button', { 'class': 'btn btn--go btn--sm pb-done', text: '好了' });
            var acts = h('div', { 'class': 'pb-acts' }, [clear, done]);
            var layer = h('div', { 'class': 'pb-layer' });
            [head, sheetEl, boxEl, tb.el, acts, layer].forEach(function (n) { root.appendChild(n); });

            /* 更新標題列右側的小字 */
            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關', '機會 ' + lives])); }

            /* 統計藥盒每格目前放了什麼：box[時段][藥種]＝顆數 */
            /* 每個格子現在放了哪些藥丸：box[s][k] ＝ 顆數 */
            function boxCounts() {
                var box = Sh.sheet.map(function () { return Array(N_KINDS).fill(0); });
                pills.forEach(function (p) { if (p.where >= 0) box[p.where][p.kind]++; });
                return box;
            }

            /* 畫「藥單」：每個時段一行（時段名 + 該放的藥丸圖案） */
            function drawSheet() {
                sheetEl.innerHTML = '';
                sheetEl.className = 'pb-sheet';
                Sh.sheet.forEach(function (row, s) {
                    var line = h('div', { 'class': 'pb-line' }, [h('span', { 'class': 'pb-line__name', text: SLOT_NAME[s] })]);
                    var pl = h('span', { 'class': 'pb-line__pills' });
                    row.forEach(function (c, k) { for (var i = 0; i < c; i++) pl.appendChild(pillSvg(k, 36)); });
                    line.appendChild(pl);
                    sheetEl.appendChild(line);
                });
            }

            /* 畫藥丸盤與藥盒：拖曳結束或點一下之後才重畫，拖曳當中不重畫（否則手指按著的那個元素會被刪掉） */
            /* 畫藥丸盤與藥盒（拖曳結束、或點一下之後才重畫；拖曳當中不重畫）*/
            /* 建立一顆可操作的藥丸：按下去就開始拖曳 */
            function pillItem(p, size) {
                var el = h('div', { 'class': 'pb-item', attrs: { 'data-id': String(p.id) } }, [pillSvg(p.kind, size)]);
                el.addEventListener('pointerdown', function (e) { startDrag(e, p, el, size); });
                return el;
            }
            /* 藥丸太多時縮小圖示，才擠得進藥盤與格子（舞台寬固定 500px） */
            /* 藥丸太多的時候縮小一點，才擠得進藥盤與格子（舞台寬固定 500，兩列是塞得下的上限）*/
            function trayPillSize(n) { return n <= 40 ? 38 : 30; }
            function cellPillSize(n) { return n <= 8 ? 36 : (n <= 10 ? 30 : 26); }
            /* 畫藥丸盤 */
            function drawTray() {
                sheetEl.innerHTML = '';
                sheetEl.className = 'pb-sheet pb-tray';
                sheetEl.appendChild(h('div', { 'class': 'pb-tray__cap', text: '藥丸（拖曳到下面的格子）' }));
                var grid = h('div', { 'class': 'pb-tray__grid' });
                var inTray = pills.filter(function (p) { return p.where < 0; }), sz = trayPillSize(inTray.length);
                inTray.forEach(function (p) { grid.appendChild(pillItem(p, sz)); });
                sheetEl.appendChild(grid);
            }
            /* 畫藥盒：每個時段一格，點格子可以選取；格子裡的藥丸也可以再拖出來 */
            function drawBox() {
                boxEl.innerHTML = '';
                Sh.sheet.forEach(function (_, s) {
                    var cell = h('div', { 'class': 'pb-cell' + (s === sel ? ' pb-cell--sel' : ''), attrs: { 'data-s': String(s) } }, [h('span', { 'class': 'pb-cell__name', text: SLOT_NAME[s] })]);
                    var wrap = h('span', { 'class': 'pb-cell__pills' });
                    var inCell = pills.filter(function (p) { return p.where === s; }), sz = cellPillSize(inCell.length);
                    inCell.forEach(function (p) { wrap.appendChild(pillItem(p, sz)); });
                    cell.appendChild(wrap);
                    cell.addEventListener('pointerdown', function (e) { if (state === 'fill' && !(e.target.closest && e.target.closest('.pb-item'))) { sel = s; Sfx.play('click'); drawBox(); } });
                    boxEl.appendChild(cell);
                });
            }
            /* 只有填藥盒階段才重畫 */
            function redraw() { if (state === 'fill') { drawTray(); drawBox(); } }

            /* 拖曳功能：手指移動不到 DRAG_MOVE_PX（8px）就算「點一下」，超過才算拖曳 */
            /* ─── 拖曳（手指移動不到 DRAG_MOVE_PX 就算「點一下」）─── */
            var dragging = null;
            /* startDrag：手指按在某顆藥丸上時呼叫 */
            function startDrag(e, p, el, size) {
                if (state !== 'fill' || dragging) return;
                e.preventDefault();
                /* setPointerCapture：讓手指移出這個元素外仍持續收到 pointermove／pointerup */
                try { el.setPointerCapture(e.pointerId); } catch (err) { }
                /* ghost 是跟著手指跑的「分身」，畫在最上層的 .pb-layer 上；kit.localPt 把螢幕座標換算成舞台座標 */
                var pt = kit.localPt(e, layer), ghost = h('div', { 'class': 'pb-ghost' }, [pillSvg(p.kind, 56)]);
                dragging = { id: e.pointerId, p: p, el: el, x0: e.clientX, y0: e.clientY, ghost: ghost, moved: false };
                layer.appendChild(ghost);
                ghost.style.left = (pt.x - 28) + 'px'; ghost.style.top = (pt.y - 28) + 'px';
                ghost.style.display = 'none';
                /* 手指移動 */
                function move(ev) {
                    if (!dragging || ev.pointerId !== dragging.id) return;
                    var dx = ev.clientX - dragging.x0, dy = ev.clientY - dragging.y0;
                    /* 還沒移動超過 8px 就不當作拖曳 */
                    if (!dragging.moved && dx * dx + dy * dy < DRAG_MOVE_PX * DRAG_MOVE_PX) return;
                    /* 第一次超過門檻：顯示分身、讓原本那顆變淡 */
                    if (!dragging.moved) { dragging.moved = true; ghost.style.display = ''; el.classList.add('pb-item--lifted'); }
                    var q = kit.localPt(ev, layer);
                    ghost.style.left = (q.x - 28) + 'px'; ghost.style.top = (q.y - 28) + 'px';
                    /* 標出手指正在哪一格上方（該格亮綠色） */
                    markTarget(ev.clientX, ev.clientY);
                }
                /* 手指放開 */
                function up(ev) {
                    if (!dragging || ev.pointerId !== dragging.id) return;
                    /* 拖曳結束就拿掉三個事件監聽，避免累積 */
                    el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
                    var d = dragging; dragging = null;
                    if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
                    clearMarks();
                    if (state !== 'fill') return;
                    /* 沒有移動 → 當成「點一下」；有移動 → 看放在哪裡 */
                    if (!d.moved) tapPill(d.p);
                    else dropPill(d.p, targetAt(ev.clientX, ev.clientY));
                }
                el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
            }
            /* 放開的位置在哪：document.elementsFromPoint 取得該座標上所有重疊的元素，由上往下找出藥盒的格子或藥盤 */
            /* 放開的位置在哪：回傳 { s:格子編號 } 或 { tray:true } 或 null */
            function targetAt(x, y) {
                var els = document.elementsFromPoint(x, y);
                for (var i = 0; i < els.length; i++) {
                    var c = els[i].closest && els[i].closest('.pb-cell');
                    if (c && boxEl.contains(c)) return { s: Number(c.getAttribute('data-s')) };
                    if (els[i].closest && els[i].closest('.pb-tray')) return { tray: true };
                }
                return null;
            }
            /* 拖曳中標出目前所在的格子 */
            function markTarget(x, y) {
                clearMarks();
                var t = targetAt(x, y);
                if (t && t.s != null) { var c = boxEl.children[t.s]; if (c) c.classList.add('pb-cell--over'); }
            }
            function clearMarks() { [].forEach.call(boxEl.children, function (c) { c.classList.remove('pb-cell--over'); }); }
            /* 放下：放進格子（位置=格子編號）或放回藥盤（位置=-1） */
            function dropPill(p, t) {
                if (t && t.s != null) { p.where = t.s; sel = t.s; Sfx.play('pop'); }
                else if (t && t.tray) { p.where = -1; Sfx.play('click'); }
                redraw();
            }
            /* 點一下：藥盤裡的藥丸放進目前選取的格子；格子裡的藥丸回到藥盤 */
            /* 點一下：藥盤裡的藥丸放進目前選取的格子；格子裡的藥丸回到藥盤 */
            function tapPill(p) {
                if (p.where < 0) { p.where = sel; Sfx.play('pop'); } else { p.where = -1; Sfx.play('click'); }
                redraw();
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                /* 產生這關的單子與藥丸盤 */
                Sh = makeSheet(level);
                pills = makeTray(Sh.sheet, level).map(function (k) { return { id: nextId++, kind: k, where: -1 }; });
                sel = 0; state = 'show';
                head.textContent = '第 ' + level + ' 關　記住每個時段的藥丸';
                meta();
                /* 顯示單子，藥盒先變淡、按鈕先隱藏 */
                drawSheet(); drawBox();
                acts.style.visibility = 'hidden'; boxEl.classList.add('pb-box--dim');
                /* 主控台印出這關單子與藥盤的實際內容（除錯用） */
                try { console.info('[分藥盒] 第 ' + level + ' 關 單子：' + Sh.sheet.map(function (r, s) { return SLOT_NAME[s] + '＝' + rowText(r); }).join('；') + '；藥盤共 ' + pills.length + ' 顆（需要 ' + needTotal(Sh.sheet) + ' 顆，其中干擾 ' + pills.filter(function (p) { return p.kind >= 4; }).length + ' 顆）；看 ' + showSec(level).toFixed(1) + ' 秒、填 ' + fillSec(Sh.sheet).toFixed(0) + ' 秒'); } catch (e) { }
                var t0 = performance.now(), lim = showSec(level) * 1000;
                /* 看單子的倒數時間條 */
                my.loop(function (now) { if (id !== lvId || state !== 'show') return false; tb.set(1 - (now - t0) / lim); });
                /* 時間到：蓋掉單子，換成藥丸盤，進入「填藥盒」階段，開始填藥盒的倒數 */
                my.after(lim, function () {
                    if (id !== lvId || state !== 'show') return;
                    state = 'fill';
                    drawTray(); drawBox();
                    /* 操作提示（只在第一次進遊戲時）：把藥丸拖到格子裡 → 手指＋箭頭 */
                    if (root.querySelector('.pb-item')) if (Reaction.kit.once('pillbox.hint')) Reaction.kit.hintOn(root, root.querySelector('.pb-item'), { mode: 'drag', dx: 0, dy: 150 });
                    head.textContent = '第 ' + level + ' 關　把正確的藥丸拖曳到格子裡';
                    acts.style.visibility = 'visible'; boxEl.classList.remove('pb-box--dim');
                    Sfx.play('go');
                    var f0 = performance.now(), fl = fillSec(Sh.sheet) * 1000;
                    my.loop(function (now) { if (id !== lvId || state !== 'fill') return false; tb.set(1 - (now - f0) / fl); });
                    /* 填藥盒的時間到了：submit(true) 會先判斷藥盒，放對就過關 */
                    my.after(fl, function () { if (id === lvId && state === 'fill') submit(true); });
                });
            }

            /* 送出判定：timeout 表示是時間到而不是玩家按「好了」 */
            function submit(timeout) {
                if (state !== 'fill') return;
                state = 'judged';
                tb.set(0);
                /* boxCounts() 統計目前藥盒的內容 */
                var box = boxCounts();
                var ok = judge(Sh.sheet, box);     /* 時間到了也先判斷：已經放對就算過關（跟撥時間、撕日曆一致）*/
                /* 揭曉：把單子重新顯示出來，讓玩家比對 */
                drawSheet();                       /* 揭曉：把單子再亮出來 */
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    Sfx.play('win');
                    head.textContent = timeout ? '時間到，剛好放對了！' : '全部正確！';
                    level++;
                    meta();
                    my.after(1400, startLevel);
                    return;
                }
                /* 答錯扣一次機會，並列出哪些時段不一樣 */
                lives--;
                Sfx.play('bad');
                var wrong = [];
                Sh.sheet.forEach(function (r, s) { if (!sameRow(pad(r), box[s])) wrong.push(SLOT_NAME[s] + '：應放 ' + rowText(pad(r)) + '，你放了 ' + rowText(box[s])); });
                head.textContent = timeout ? '時間到了！' : '有 ' + wrong.length + ' 格不一樣';
                /* 錯的格子標橘 */
                /* 錯的格子標橘色 */
                [].forEach.call(boxEl.children, function (c, s) { if (!sameRow(pad(Sh.sheet[s]), box[s])) c.classList.add('pb-cell--bad'); });
                meta();
                /* 沒有機會了 → 顯示結算 */
                if (lives <= 0) {
                    my.after(2200, function () {
                        /* kit.resumeFrom：失敗後可從前 5 關繼續 */
                        var back = kit.resumeFrom(level);
                        kit.result(root, {
                            score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: cleared + ' 關', label: cleared >= 8 ? '細心的好幫手！' : (cleared >= 4 ? '記得很清楚！' : '再試一次，會更準！'),
                            lines: wrong.slice(0, 3), note: '藥丸是虛構的圖案，不是用藥建議；遊戲成績，不是醫療檢查',
                            isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(2200, startLevel);
            }
            /* 「清空這格」：把目前選取格子的藥丸全部放回藥盤 */
            clear.addEventListener('pointerdown', function (e) { e.preventDefault(); if (state === 'fill') { pills.forEach(function (p) { if (p.where === sel) p.where = -1; }); Sfx.play('click'); redraw(); } });
            /* 「好了」：送出 */
            done.addEventListener('pointerdown', function (e) { e.preventDefault(); submit(false); });

            /* G.debug：測試用後門，fill() 可以一鍵把藥丸依單子放好 */
            G.debug = {
                state: function () { return { level: level, state: state, lives: lives, cleared: cleared, sheet: Sh && Sh.sheet, box: Sh && boxCounts(), sel: sel, tray: pills.filter(function (p) { return p.where < 0; }).length, pills: pills.length }; },
                /* 依單子把藥丸放進藥盒（wrong＝true 時故意放一顆干擾藥丸進第一格）*/
                fill: function (wrong) {
                    if (state !== 'fill') return state;
                    pills.forEach(function (p) { p.where = -1; });
                    Sh.sheet.forEach(function (row, s) {
                        row.forEach(function (c, k) {
                            for (var i = 0; i < c; i++) { var p = pills.filter(function (q) { return q.where < 0 && q.kind === k; })[0]; if (p) p.where = s; }
                        });
                    });
                    if (wrong) { var d = pills.filter(function (q) { return q.where < 0 && q.kind >= 4; })[0]; if (d) d.where = 0; }
                    redraw(); return state;
                },
                submit: function () { submit(false); return state; },
                drop: function (id, s) { var p = pills.filter(function (q) { return q.id === id; })[0]; if (p) { p.where = s; redraw(); } }
            };
            /* 開場等 300 毫秒再開始第一關 */
            my.after(300, startLevel);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '分藥盒',
        rule: '先看吃藥單，記住每個時段有哪些顏色、什麼形狀、幾顆藥丸。單子收起來後，上面會出現一堆藥丸（還混了顏色或形狀不一樣的干擾藥丸，數量也故意多放），用手指把正確的藥丸拖曳到下面藥盒的格子，按「好了」。藥丸是虛構的圖案，這是記憶遊戲，不是用藥建議。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式，給 Node 自動測試（test/reaction/t_pillbox.js）用 */
        test: { MAX_TRAY: MAX_TRAY, makeTray: makeTray, extraMax: extraMax, decoyKinds: decoyKinds, needTotal: needTotal, pad: pad, N_KINDS: N_KINDS, KIND_NAME: KIND_NAME, EXTRA_END: EXTRA_END, slotCount: slotCount, kindCount: kindCount, maxCnt: maxCnt, showSec: showSec, fillSec: fillSec, makeSheet: makeSheet, judge: judge, rowDiff: rowDiff, sameRow: sameRow, total: total, LEVEL_RAMP: LEVEL_RAMP }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
