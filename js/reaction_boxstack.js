/* ═══════════════════════════════════════════════════════════════════
   reaction_boxstack.js — 秒反應・疊箱子（原創篇 538「疊箱子」，照使用者的修改）
   樣式：css/games/reaction_boxstack.css（class 一律以「boxstack-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：倉庫的架子每格放一箱，規矩：**越下面越重、越右邊越重**（每一箱都比它上面那箱重、比它左邊那箱重；
     後面的關卡「一樣重」也可以）。**有幾箱已經貼好重量、放在固定的位置**（深色的箱子，不能動），其他重量在下面的清單上。
     點清單上的重量、再點空格放進去；點自己放的箱子可以拿回來。放得違反規矩，違反的那兩箱會變紅。
   · 使用者的第一次意見（V1.42）：如果沒有先固定幾箱，照重量從左上排到右下一定會過關、沒有難度。所以：
       ① 每題都先固定幾箱（剛好讓答案只剩一種的最少箱數，前面的關卡多給一兩箱暖身）；
       ② 出題器把「剩下的重量照大小一排一排填、一直行一直行填、或照斜線填就剛好對」的題目全部丟掉。
   · 使用者的第二次意見（V1.43.0）：難度還是太低，幾乎都是直覺照大小排；格子再多也沒用（最左上一定是最輕、最右下一定是最重，
     2 只能放在兩個位置……每個數字能放的位置都被限制得很死）。預先固定的箱子不是越多越好，重點是**位置能不能逼玩家重新想順序**；
     另外給了三個方向：①重量不是 1～N，而是從一大段範圍裡取 N 個（例如 3～58 取 16 個）；②重量可以重複、有的重量沒出現；③兩個混在一起。照做：
       A. **要玩家重新想的是「空格」**：先算出三種直覺填法（一排一排／一直行一直行／斜線）每一格的名次，答案裡名次跟三種直覺都差得
          最遠的格子叫「出乎直覺」。實測（note 裡沒有、test 用 bx 實驗）：最少箱數的題目有 93～97% 的 3×3、7 成的 4×5 剩下的重量
          照大小一排一排填就對，而「先固定出乎直覺的箱子」反而更糟（剩下的空格就變得很規矩）。所以反過來：固定的箱子優先挑最合直覺的位置，
          最出乎直覺的格子留給玩家填；刪掉多餘的箱子時先試著拿掉最出乎直覺的。
       B. **出題器要求「剩下的空格裡，答案跟每一種直覺填法都不一樣的比例」**（naiveDiff），這個比例隨關卡升高（DIFF_FRAC：原本 20% → 50%，使用者手調成目前的 50% → 80%，
          實測 3×3 最多只做得到 40% 左右、4×5 到 65%），空格數由參數 EMPTY 控制（V1.43.1：第 1 關 → 第 30 關，預設 3 → 11 個；架子撐不住那麼多空格時取撐得住的最大值，3×3 最多 4 個），
          最左上、最右下一定是最輕、最重，V1.43.1 起一律**預先放好（固定）**，不用玩家自己放，其餘固定的箱子再另外算「最少幾箱才唯一」。
       C. 階段（STAGES）：第 1～8 關 3×3、重量 1～N（seq）→ 第 9～16 關 3×4、**重量從一大段範圍取、中間有很多空隙（gap）**，
          固定的箱子是 3、17、41 這種數字，要先換算成「第幾輕」才知道它該在哪 → 第 17～24 關 4×4、**重量可以重複、有的重量沒出現
          （dup，一樣重可以放一起）** → 第 25 關起 4×5、**兩個混在一起（mix）**。
   · 頓悟：一箱的左上方那一整塊都比它輕、右下方那一整塊都比它重，所以「左上方有幾箱」就是它的名次下限，
     再用固定的箱子夾：夾在 3 公斤和 8 公斤中間、又要比左上方 2 箱重……一格一格縮小範圍。
   · 數解（唯一性）：不管重量重不重複，「重量由輕到重、每種重量佔的格子」＝從左上往右下一層一層長大的階梯形。所以用動態規劃：
     狀態＝目前階梯形（每一排填到第幾格，最多 126 種），一種重量一種重量地往外長，數有幾種長法（見 countFillV）。
   · 限時（V1.43.1，原本是不限時的自由解題）：每一關限時 ＝ TIME_BASE ＋ 空格數 × 每格幾秒（7 → 5 秒，線性），上面的時間條倒數；時間到了＝失敗（把正確答案放上去）。
     全部放好而且都符合規矩就過關（答案唯一），成績＝解開幾題。
   · 提示（每題 HINTS 次）：有放錯的箱子就標出它；都沒放錯就替你放好一箱（標成黃色）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'boxstack';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；r×c＝架子幾層幾格；mode＝重量的種類（seq／gap／dup／mix） */
        { to: 3, r: 3, c: 3, mode: 'seq' },
        { to: 6, r: 3, c: 4, mode: 'seq' },
        { to: 9, r: 3, c: 4, mode: 'gap' },
        { to: 12, r: 4, c: 4, mode: 'dup' },
        { to: 9999, r: 4, c: 5, mode: 'mix' }
    ];
    var EMPTY = [4, 12];                        /* 空格數（玩家要自己放的箱子數，不含已經固定的）：第 1 關 → 第 RAMP_LEVELS 關（線性）。要的比這種架子「答案還唯一」撐得住的空格數更多時，就用撐得住的最大空格數（V1.43.1） */
    var MODES = {                               /* span＝重量的範圍有多寬（格子數的幾倍）；distinct＝不同的重量佔格子數的幾成（沒寫＝每格都不同） */
        seq: {},
        gap: { span: 3.5 },
        dup: { span: 1, distinct: 0.6 },
        mix: { span: 3.5, distinct: 0.65 }
    };
    var VAL_LO = [1, 9];                        /* 最輕的重量從這個範圍亂數挑（gap／dup／mix） */
    var DUP_MAX = 3;                            /* 同一種重量最多重複幾箱 */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var DIFF_FRAC = [0.5, 0.8];                 /* 剩下的空格裡，答案跟「每一種直覺填法」都不一樣的比例至少多少：第 1 關 → 到頂（太高會找不到題目，見檔頭說明） */
    var HINTS = 3;                                  /* 每一題可以用幾次提示（目前 3 次） */
    var TRIES = 300;                                /* 出題時最多重抽幾次（都達不到空格數與難度比例，就用最接近的那一題） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1400;                       /* 答對（過關）後停多久才換下一關（毫秒，1400 毫秒＝1.4 秒） */
    var FAIL_HOLD_MS = 6000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，6000 毫秒＝6 秒），讓玩家先看清楚答案 */
    var TIME_BASE = 15, TIME_CELL = [7, 5];  /* 每一關限時（秒）＝基本 ＋ 每一個空格幾秒（第 1 關 → 第 30 關，線性縮短）；時間到了＝失敗，並亮出答案（V1.43.1） */
    var CELL_MAX = 96;                          /* 架上每格最大邊長（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function emptyFor(level) { return Math.max(1, Math.round(kit.ramp(level, EMPTY[0], EMPTY[1], RAMP_LEVELS))); }
    function timeFor(level, empties) { return TIME_BASE + empties * kit.ramp(level, TIME_CELL[0], TIME_CELL[1], 30); }
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: level - from + 1, len: Math.min(STAGES[i].to, from + 9) - from + 1 };
            from = STAGES[i].to + 1;
        }
    }
    function isWeak(mode) { return mode === 'dup' || mode === 'mix'; }      /* 重量會重複（一樣重可以放一起） */
    function seqVals(N) { var a = []; for (var i = 1; i <= N; i++) a.push(i); return a; }
    /* 這個關卡的重量（由輕到重，長度 N）：seq＝1～N；gap＝從 [lo, lo＋span] 取 N 個不重複；dup／mix＝取 K 種、其中有的重複 */
    function makeValues(mode, N, rand) {
        rand = rand || Math.random;
        var m = MODES[mode] || MODES.seq;
        if (mode === 'seq' || !m.span) return seqVals(N);
        var lo = kit.randInt(VAL_LO[0], VAL_LO[1], rand), size = Math.max(N, Math.round(N * m.span));
        var pool = []; for (var i = 0; i < size; i++) pool.push(lo + i);
        var K = m.distinct ? Math.max(2, Math.min(N - 1, Math.round(N * m.distinct))) : N;
        var picks = kit.shuffle(pool, rand).slice(0, K).sort(function (a, b) { return a - b; });
        var mult = picks.map(function () { return 1; }), extra = N - K;
        while (extra > 0) { var q = kit.randInt(0, K - 1, rand); if (mult[q] < DUP_MAX) { mult[q]++; extra--; } }
        var out = [];
        picks.forEach(function (v, q) { for (var t = 0; t < mult[q]; t++) out.push(v); });
        return out;
    }
    /* [{ v: 重量, m: 有幾箱 }, …]（由輕到重） */
    function groupsOf(vals) {
        var gs = [];
        vals.forEach(function (v) { if (gs.length && gs[gs.length - 1].v === v) gs[gs.length - 1].m++; else gs.push({ v: v, m: 1 }); });
        return gs;
    }
    /* 隨機產生一種合法擺法（名次 1～N）：每次在「可以放的角落」（上面和左邊都放好了的空格）隨機挑一格放下一個名次 */
    function randomStack(r, c, rand) {
        var g = [], N = r * c, i, j, v;
        for (i = 0; i < N; i++) g.push(0);
        for (v = 1; v <= N; v++) {
            var cand = [];
            for (i = 0; i < r; i++) for (j = 0; j < c; j++) { var k = i * c + j; if (!g[k] && (i === 0 || g[k - c]) && (j === 0 || g[k - 1])) cand.push(k); }
            g[kit.pick(cand, rand)] = v;
        }
        return g;
    }
    /* 照固定的箱子（given[k]＝重量，0＝空格）數有幾種填法（最多數到 limit），重量是 vals（由輕到重的多重集合）。
       做法（動態規劃）：重量由輕到重，一種重量一種重量地加進去；「重量 ≤ 目前這種」的格子一定是從左上角長出來的階梯形
       （每一排的長度不增）。狀態＝階梯形（每一排填到第幾格），這一種重量要佔 m 格，就是從舊階梯形長成新階梯形、多出 m 格；
       多出來的格子裡，固定的箱子必須剛好是這個重量，而這個重量的固定箱子也必須都在這 m 格裡 */
    function countFillV(r, c, given, vals, limit) {
        var gs = groupsOf(vals), memo = {}, i, k;
        var need = {}, avail = {};
        for (k = 0; k < r * c; k++) if (given[k]) need[given[k]] = (need[given[k]] || 0) + 1;
        gs.forEach(function (g) { avail[g.v] = g.m; });
        for (var v in need) if (!avail[v] || need[v] > avail[v]) return 0;           /* 固定的重量不在清單裡，或比清單裡的箱數多 */
        function fits(shape, ns, val) {
            var found = 0;
            for (var a = 0; a < r; a++) for (var b = shape[a]; b < ns[a]; b++) {
                var q = given[a * c + b];
                if (q) { if (q !== val) return false; found++; }
            }
            return found === (need[val] || 0);
        }
        function rec(t, shape) {
            if (t === gs.length) return 1;
            var key = t + ':' + shape.join('');
            if (key in memo) return memo[key];
            var g = gs[t], total = 0;
            (function row(a, prev, left, ns) {
                if (total >= limit) return;
                if (a === r) { if (left === 0 && fits(shape, ns, g.v)) total += rec(t + 1, ns.slice()); return; }
                for (var l = shape[a]; l <= prev; l++) {
                    var d = l - shape[a];
                    if (d > left) break;
                    ns[a] = l; row(a + 1, l, left - d, ns);
                }
            })(0, c, g.m, []);
            return (memo[key] = Math.min(total, limit));
        }
        var start = []; for (i = 0; i < r; i++) start.push(0);
        return rec(0, start);
    }
    /* 重量是 1～N 時的數法（見上面） */
    function countFill(r, c, given, limit) { return countFillV(r, c, given, seqVals(r * c), limit); }
    /* 偷懶的填法：剩下的重量由輕到重，照某個順序填進空格（vals＝全部的重量，沒給就是 1～N）。order：'row' 一排一排、'col' 一直行一直行、'diag' 照斜線 */
    function naiveFill(r, c, given, order, vals) {
        var N = r * c, rest = (vals || seqVals(N)).slice(), cells = [], k, i, j, s;
        for (k = 0; k < N; k++) if (given[k]) { var p = rest.indexOf(given[k]); if (p >= 0) rest.splice(p, 1); }
        if (order === 'row') for (k = 0; k < N; k++) cells.push(k);
        else if (order === 'col') for (j = 0; j < c; j++) for (i = 0; i < r; i++) cells.push(i * c + j);
        else for (s = 0; s <= r + c - 2; s++) for (i = 0; i < r; i++) { j = s - i; if (j >= 0 && j < c) cells.push(i * c + j); }
        var g = given.slice(), q = 0;
        cells.forEach(function (k2) { if (!g[k2]) g[k2] = rest[q++]; });
        return g;
    }
    var ORDERS = ['row', 'col', 'diag'];
    function sameArr(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
    /* 偷懶的填法有沒有剛好對 */
    function naiveWorks(r, c, given, sol, vals) {
        return ORDERS.some(function (o) { return sameArr(naiveFill(r, c, given, o, vals), sol); });
    }
    /* 三種偷懶的填法裡，答案跟「每一種」都不一樣的空格比例的最小值（越大＝越不能靠直覺；固定的箱子不算） */
    function naiveDiff(r, c, given, sol, vals) {
        var free = 0, k;
        for (k = 0; k < r * c; k++) if (!given[k]) free++;
        if (!free) return 0;
        var worst = 1;
        ORDERS.forEach(function (o) {
            var g = naiveFill(r, c, given, o, vals), d = 0;
            for (k = 0; k < r * c; k++) if (!given[k] && g[k] !== sol[k]) d++;
            worst = Math.min(worst, d / free);
        });
        return worst;
    }
    /* 違反規矩的相鄰兩格：[[上或左, 下或右], …]（只看兩格都有箱子的；一樣重不算違規） */
    function violations(r, c, g) {
        var out = [], i, j;
        for (i = 0; i < r; i++) for (j = 0; j < c; j++) {
            var k = i * c + j;
            if (!g[k]) continue;
            if (i + 1 < r && g[k + c] && g[k + c] < g[k]) out.push([k, k + c]);
            if (j + 1 < c && g[k + 1] && g[k + 1] < g[k]) out.push([k, k + 1]);
        }
        return out;
    }
    /* 每一格「跟直覺差多遠」：三種直覺填法（空架子）的名次，跟答案的名次差的最小值；越大＝越出乎直覺 */
    function surprise(r, c, rk) {
        var N = r * c, none = [], k;
        for (k = 0; k < N; k++) none.push(0);
        var fills = ORDERS.map(function (o) { return naiveFill(r, c, none, o); });
        return rk.map(function (x, q) { return Math.min.apply(null, fills.map(function (f) { return Math.abs(f[q] - x); })); });
    }
    /* 出一題：{ r, c, mode, vals（由輕到重）, sol[], given[]（0＝空格）, diff } —— 答案唯一、固定的箱子偏向合直覺的位置、空格裡三種直覺填法都對不上的比例夠高 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), st = s.st, r = st.r, c = st.c, N = r * c, best = null, bestScore = -1e9;
        var want = emptyFor(level);
        var frac = kit.ramp(level, DIFF_FRAC[0], DIFF_FRAC[1], RAMP_LEVELS);
        for (var tr = 0; tr < TRIES; tr++) {
            var rk = randomStack(r, c, rand), vals = makeValues(st.mode, N, rand), sol = rk.map(function (x) { return vals[x - 1]; });
            var sp = surprise(r, c, rk), key = sp.map(function (x, q) { return q === 0 || q === N - 1 ? -99 : -x + rand() * 1.5; }), cells = seqVals(N).map(function (x) { return x - 1; });
            var order = cells.slice().sort(function (a, b) { return key[b] - key[a]; });   /* 最合直覺的格子優先固定、最出乎直覺的留給玩家（加一點亂數，每次不完全一樣） */
            var given = [], k;
            for (k = 0; k < N; k++) given.push(0);
            given[0] = sol[0]; given[N - 1] = sol[N - 1];                                  /* 最左上（一定最輕）、最右下（一定最重）預先放好，不用玩家自己放（V1.43.1） */
            for (var a = 0; a < N && countFillV(r, c, given, vals, 2) !== 1; a++) given[order[a]] = sol[order[a]];        /* 一箱一箱固定，直到唯一 */
            order.slice().reverse().forEach(function (q) {                                                                 /* 再拿掉多餘的：先試著拿掉最出乎直覺的 */
                if (!given[q] || q === 0 || q === N - 1) return;
                var v = given[q]; given[q] = 0;
                if (countFillV(r, c, given, vals, 2) !== 1) given[q] = v;
            });
            var free = order.filter(function (q) { return !given[q]; });                    /* 現在的空格數＝這題「答案唯一」撐得住的最大空格數 */
            var shortBy = Math.max(0, want - free.length);                                  /* 要的空格比撐得住的多幾個（0＝夠） */
            for (var e = 0; e < free.length - want; e++) given[free[e]] = sol[free[e]];     /* 空格比要的多：多固定幾箱（挑最合直覺的）*/
            var diff = naiveDiff(r, c, given, sol, vals), cand = { r: r, c: c, mode: st.mode, vals: vals, sol: sol, given: given, diff: diff, empties: given.filter(function (v) { return !v; }).length };
            if (!naiveWorks(r, c, given, sol, vals) && !shortBy && diff >= frac) return cand;
            if (!naiveWorks(r, c, given, sol, vals) && diff - shortBy * 10 > bestScore) { best = cand; bestScore = diff - shortBy * 10; }
            if (!best) best = cand;
        }
        return best;        /* 保底：試了 TRIES 次都達不到空格數與比例，就用空格數最接近、比例最好的那一題 */
    }
    function rating(n) {
        if (n >= 25) return '倉庫主任！';
        if (n >= 12) return '夾擠推理很穩！';
        if (n >= 5) return '越來越有感覺了！';
        return '看一箱的左上方有幾箱：它至少要比那麼多箱都重！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false,
            head: function (level) { return '第 ' + level + ' 關'; },
            info: function (S) { return '已解 ' + S.cleared + ' 關'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), r = pz.r, c = pz.c, N = r * c, weak = isWeak(pz.mode), groups = groupsOf(pz.vals);
        api.info = pz;
        console.log('[疊箱子] 第 ' + level + ' 關：' + r + '×' + c + '（' + pz.mode + '），固定 ' + pz.given.filter(Boolean).length + ' 箱；重量 ' + pz.vals.join(','));
        var W = stage.clientWidth || 472;
        var cell = Math.min(CELL_MAX, Math.floor((W * 0.86 - c * 6) / c));
        var g = pz.given.slice(), hinted = {}, pick = 0, hintsLeft = HINTS, solved = false, flagged = -1, dead = false;

        var wrap = h('div', { 'class': 'boxstack-wrap' });
        var shelfBox = h('div', { 'class': 'boxstack-shelfbox' });
        var shelf = h('div', { 'class': 'boxstack-shelf' });
        shelf.style.setProperty('--boxstack-c', c);
        shelf.style.setProperty('--boxstack-cell', cell + 'px');
        var cells = [];
        for (var k = 0; k < N; k++) {
            var cl = h('div', { 'class': 'boxstack-cell' });
            (function (kk) { kit.onTap(cl, function () { tapCell(kk); }); })(k);
            shelf.appendChild(cl); cells.push(cl);
        }
        shelfBox.appendChild(h('div', { 'class': 'boxstack-arrow boxstack-arrow--right', text: weak ? '越右邊越重（可一樣重）→' : '越右邊越重 →' }));
        var row = h('div', { 'class': 'boxstack-shelfrow' }, [shelf, h('div', { 'class': 'boxstack-arrow boxstack-arrow--down', text: weak ? '越下面越重 ↓' : '越下面越重 ↓' })]);
        shelfBox.appendChild(row);
        var tray = h('div', { 'class': 'boxstack-tray' });
        var tipDefault = weak ? '點下面的重量，再點空格放進去。一樣重的箱子可以並排' : '點下面的重量，再點空格放進去';
        var tip = h('div', { 'class': 'boxstack-tip', text: tipDefault });
        var tools = h('div', { 'class': 'boxstack-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line boxstack-tool', type: 'button', text: '提示 ' + hintsLeft });
        var btnReset = h('button', { 'class': 'btn btn--line boxstack-tool', type: 'button', text: '重來' });
        kit.onTap(btnHint, useHint);
        kit.onTap(btnReset, reset);
        if (HINTS > 0) tools.appendChild(btnHint);
        tools.appendChild(btnReset);
        wrap.appendChild(shelfBox); wrap.appendChild(tip); wrap.appendChild(tray); wrap.appendChild(tools);
        stage.appendChild(wrap);

        function placedCount() { var s = {}; g.forEach(function (v) { if (v) s[v] = (s[v] || 0) + 1; }); return s; }
        function paint() {
            var bad = {}, vs = violations(r, c, g);
            vs.forEach(function (p) { bad[p[0]] = true; bad[p[1]] = true; });
            for (var k = 0; k < N; k++) {
                var cls = 'boxstack-cell';
                if (pz.given[k]) cls += ' boxstack-cell--given';
                else if (hinted[k]) cls += ' boxstack-cell--hinted';
                else if (g[k]) cls += ' boxstack-cell--placed';
                else cls += ' boxstack-cell--empty';
                if (bad[k]) cls += ' boxstack-cell--bad';
                if (k === flagged) cls += ' boxstack-cell--flag';
                if (solved) cls += ' boxstack-cell--ok';
                cells[k].className = cls;
                cells[k].textContent = g[k] ? String(g[k]) : '';
            }
            tray.innerHTML = '';
            var used = placedCount();
            groups.forEach(function (gr) {
                var left = gr.m - (used[gr.v] || 0), first = true;
                for (var t = 0; t < left; t++) {
                    var b = h('div', { 'class': 'boxstack-chip' + (gr.v === pick && first ? ' boxstack-chip--sel' : ''), text: String(gr.v) });
                    first = false;
                    (function (vv) { kit.onTap(b, function () { if (!solved && !dead) { pick = pick === vv ? 0 : vv; paint(); } }); })(gr.v);
                    tray.appendChild(b);
                }
            });
            if (vs.length && !solved) tip.textContent = weak ? '紅色的兩箱違反規矩：上面的不能比下面重、左邊的不能比右邊重' : '紅色的兩箱違反規矩：上面的要比下面輕、左邊的要比右邊輕';
        }
        function tapCell(k) {
            if (solved || dead || pz.given[k] || hinted[k]) return;
            flagged = -1;
            if (pick) {                                  /* 放進去（原本有箱子就換回清單） */
                g[k] = pick; pick = 0;
            } else if (g[k]) {                            /* 沒選重量：把這箱拿回清單 */
                g[k] = 0;
            } else { tip.textContent = '先點下面的一個重量'; return; }
            tip.textContent = tipDefault;
            paint();
            if (g.every(Boolean) && !violations(r, c, g).length) win();
        }
        function useHint() {
            if (solved || dead || hintsLeft <= 0) return;
            var wrong = -1, empty = -1, k;
            for (k = 0; k < N; k++) {
                if (pz.given[k] || hinted[k]) continue;
                if (g[k] && g[k] !== pz.sol[k] && wrong < 0) wrong = k;
                if (g[k] !== pz.sol[k] && empty < 0) empty = k;
            }
            if (wrong < 0 && empty < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            if (wrong >= 0) { flagged = wrong; tip.textContent = '閃動的這一箱放錯了'; paint(); return; }
            /* 都沒放錯：替玩家放好一箱。這個重量的箱子都已經放出去了（清單裡沒有了）→ 先從放錯的格子拿一箱回來 */
            var v = pz.sol[empty], mult = 0, have = 0;
            groups.forEach(function (gr) { if (gr.v === v) mult = gr.m; });
            g.forEach(function (x) { if (x === v) have++; });
            if (have >= mult) for (k = 0; k < N; k++) if (g[k] === v && !pz.given[k] && pz.sol[k] !== v) { g[k] = 0; break; }
            g[empty] = v; hinted[empty] = true; pick = 0;
            tip.textContent = '黃色的這一箱是 ' + v + ' 公斤';
            paint();
            if (g.every(Boolean) && !violations(r, c, g).length) win();
        }
        function reset() { if (solved || dead) return; g = pz.given.slice(); Object.keys(hinted).forEach(function (k) { g[k] = pz.sol[k]; }); pick = 0; flagged = -1; paint(); }
        /* 時間到：把正確答案放上去（黃色），結算 */
        function timeUp() {
            if (solved || dead) return;
            dead = true; pick = 0; flagged = -1;
            for (var k = 0; k < N; k++) if (!pz.given[k] && g[k] !== pz.sol[k]) { g[k] = pz.sol[k]; hinted[k] = true; }
            paint();
            tip.textContent = '時間到了！黃色的是正確答案';
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: ['時間到了'] });
        }
        function win() {
            api.stopTimer();
            solved = true; pick = 0; paint();
            tip.textContent = weak ? '每一箱都不比上面、左邊的輕！' : '每一箱都比上面、左邊的重！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }
        api.solve = function () { g = pz.sol.slice(); paint(); win(); };
        api.wrong = function () {           /* 驗證用：放一箱違反規矩的 */
            for (var k = 0; k < N; k++) if (!pz.given[k]) { g[k] = pz.vals[N - 1] + 1; break; }
            paint();
        };
        api.state = function () { return { g: g.slice(), pick: pick, solved: solved, hintsLeft: hintsLeft, dead: dead }; };
        api.timeout = timeUp;
        api.timer(Math.round(timeFor(level, pz.given.filter(function (v) { return !v; }).length) * 1000), timeUp);
        paint();
    }

    var G = {
        id: ID,
        name: '疊箱子',
        rule: '倉庫的架子每格放一箱，規矩是**越下面越重、越右邊越重**：每一箱都要比它上面那箱重、也比它左邊那箱重（後面的關卡**一樣重也可以**）。**深色的箱子已經貼好重量、固定在那裡**（左上角一定最輕、右下角一定最重，已經先放好了），其他的重量在下面的清單上。**重量不一定是 1、2、3…，有的關卡中間會跳號、甚至有一樣重的箱子**，先想想每一箱的「第幾輕」。點清單上的重量、再點空格放進去；點自己放的箱子可以拿回來。答案只有一種，照大小隨便排是排不對的。每一關有時間限制（上面的時間條，空格越多給的時間越長），時間到了也算失敗；全部放對就過關，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, emptyFor: emptyFor, EMPTY: EMPTY, timeFor: timeFor, TIME_BASE: TIME_BASE, TIME_CELL: TIME_CELL, isWeak: isWeak, makeValues: makeValues, groupsOf: groupsOf, randomStack: randomStack, countFill: countFill, countFillV: countFillV,
            naiveFill: naiveFill, naiveWorks: naiveWorks, naiveDiff: naiveDiff, surprise: surprise, violations: violations,
            makePuzzle: makePuzzle, rating: rating, STAGES: STAGES, MODES: MODES, DIFF_FRAC: DIFF_FRAC, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
