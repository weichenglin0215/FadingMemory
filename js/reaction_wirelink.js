/* ═══════════════════════════════════════════════════════════════════
   reaction_wirelink.js — 秒反應・接電線（企劃 222）
   方格板上散著幾對同色的插頭（紅對紅、藍對藍…）。手指從一個插頭拖到同色的另一個，拖過的格子變成那條電線；
   **電線不能交叉，最後每一格都要被電線佔滿**才過關。畫錯了可以從插頭重拖（或從電線中間重拖，那一格之後的電線會收回去）。
   接通的那一對插頭會亮起小燈泡，全部接好、板子填滿時整塊板子的燈一起亮。
   ───────────────────────────────────────────────────────────────────
   · 這是手機上流行的「Flow」玩法。難度：棋盤 4×4 → 8×8（SIZE）、顏色 2 → 8 種（COLORS）、限時 30 → 70 秒（TIME_S），都是線性；
     顏色的出現順序是「紅、藍、綠、黃、紫、水藍、橘、粉紅」：第 6 種起水藍跟藍很接近、第 7 種起橘跟黃很接近（誘餌：看錯顏色就接錯）。
   · 出題（makePuzzle）：先隨機做出「走遍整個棋盤的一條路」（kit.hamPath，漢米爾頓路徑），再把這條路切成 k 段（每段至少 3 格），
     每一段就是一種顏色的電線，兩端各放一個插頭——所以每一題一定有解，而且電線全部不交叉、剛好填滿整塊板子。
     最近的兩個同色插頭往往不能直接連（會擋住別的顏色的路），這是這類題目自然的陷阱。
   · 判定：不拿「出題時的那組解」比對，只看「規則有沒有達成」——每一格都有電線、每一種顏色的兩個插頭都接通。
     所以只要接法合規，不管跟出題時的解一不一樣都算過關（玩家不會在「其實也對」的接法上被判錯）。
   · 電線的規則（applyDrag）：從插頭（或同色電線上的任何一格）按下；只能往相鄰的空格拖；拖回上一格＝把電線收回一格；
     碰到別的顏色的電線／插頭、或自己的電線（不是上一格）就擋住，不能穿過；拖到同色的另一個插頭就接通。
   · 時間到：把正確的接法一條一條畫出來，沒接通的電線閃紅，停格 3 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'wirelink';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var SIZE = [4, 8];                          /* 棋盤邊長（格）：第 1 關 → 到頂 */
    var COLORS = [2, 8];                        /* 顏色（電線）種數：第 1 關 → 到頂；最多 8 種（PALETTE 的長度） */
    var TIME_S = [30, 70];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var MIN_SEG = 3;                            /* 每一條電線（一段路）至少幾格 */
    var MAX_LEVEL = 90;
    /* 顏色的名稱與出現順序（CSS 變數 --wlk-0～--wlk-7 在 css/theme.css；水藍(5)像藍(1)、橘(6)像黃(3)） */
    var PALETTE = ['紅', '藍', '綠', '黃', '紫', '水藍', '橘', '粉紅'];
    var neighbors = kit.gridNeighbors, adjacent = kit.gridAdjacent;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(level) { return Math.round(kit.ramp(level, SIZE[0], SIZE[1], RAMP_LEVELS)); }
    /* 這一關有幾種顏色：照線性算，但每種顏色至少要有 MIN_SEG 格，所以最多 floor(n² ÷ MIN_SEG) 種 */
    function colorsFor(level) { var n = sizeFor(level); return Math.max(1, Math.min(PALETTE.length, Math.floor(n * n / MIN_SEG), Math.round(kit.ramp(level, COLORS[0], COLORS[1], RAMP_LEVELS)))); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 把 total 格分成 k 段，每段至少 min 格（多出來的格子隨機分給各段）；回傳每段的長度 */
    function splitLengths(total, k, min, rand) {
        var lens = [], extra = total - k * min, i;
        for (i = 0; i < k; i++) lens.push(min);
        for (i = 0; i < extra; i++) lens[Math.floor(rand() * k)]++;
        return lens;
    }
    /* 出一題：{ n, k, plugs:[{ c（顏色編號 0～7）, a, b（兩個插頭的格子）}], solution:[每種顏色一條路（格子編號陣列，從 a 到 b）], level }；
       先用 kit.hamPath 做一條走遍整個棋盤的路，再切成 k 段 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var n = sizeFor(level), k = colorsFor(level), total = n * n, blocked = new Uint8Array(total), ham = null;
        for (var tr = 0; tr < 300 && !ham; tr++) { var s0 = Math.floor(rand() * total); if (kit.gridParityOk(n, blocked, s0)) ham = kit.hamPath(n, blocked, s0, rand, 4000); }
        if (!ham) { ham = []; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) ham.push(r * n + (r % 2 ? n - 1 - c : c)); }
        var lens = splitLengths(total, k, MIN_SEG, rand), cols = kit.shuffle(Array.apply(null, Array(k)).map(function (_, i) { return i; }), rand), plugs = [], solution = [], pos = 0;
        lens.forEach(function (len, i) {
            var seg = ham.slice(pos, pos + len); pos += len;
            if (rand() < 0.5) seg.reverse();
            plugs.push({ c: cols[i], a: seg[0], b: seg[seg.length - 1] });
            solution.push(seg);
        });
        return { n: n, k: k, plugs: plugs, solution: solution, level: level };
    }
    /* 目前的接線狀態：occ[格子] ＝ 那一格的電線顏色（沒有＝−1，插頭那格一開始就是它的顏色）；paths[顏色] ＝ 這條電線已經鋪的格子（從某一個插頭開始）；done[顏色] ＝ 接通了嗎 */
    function newState(q) {
        var occ = new Int8Array(q.n * q.n).fill(-1), plugOf = {}, paths = {}, done = {};
        q.plugs.forEach(function (p) { occ[p.a] = p.c; occ[p.b] = p.c; plugOf[p.a] = p.c; plugOf[p.b] = p.c; paths[p.c] = []; done[p.c] = false; });
        return { n: q.n, occ: occ, plugOf: plugOf, paths: paths, done: done, plugs: q.plugs };
    }
    function otherPlug(st, c, cell) { var p = st.plugs.filter(function (x) { return x.c === c; })[0]; return p.a === cell ? p.b : p.a; }
    /* 手指在格子 cell 按下：回傳這一筆畫的顏色（−1＝按在空格或不能開始的地方）。
       按在插頭上：那條電線整條收回，從這個插頭重新開始；按在同色電線的中間：那一格之後的電線收回，從這裡接著畫；按在電線的最前端：接著畫 */
    function startDraw(st, cell) {
        var c = st.occ[cell];
        if (c < 0) return -1;
        if (st.plugOf[cell] != null) { clearPath(st, c); st.paths[c] = [cell]; return c; }
        var p = st.paths[c], idx = p.indexOf(cell);
        if (idx < 0) return -1;
        while (p.length > idx + 1) { var gone = p.pop(); if (st.plugOf[gone] == null) st.occ[gone] = -1; }       /* 插頭那一格的顏色不能清掉 */
        st.done[c] = false;
        return c;
    }
    function clearPath(st, c) {
        st.paths[c].forEach(function (k) { if (st.plugOf[k] == null) st.occ[k] = -1; });
        st.paths[c] = []; st.done[c] = false;
    }
    /* 這一筆畫（顏色 c）拖到格子 cell：回傳 'add'（往空格鋪一格）／'connect'（接到同色的另一個插頭）／'back'（拖回上一格＝收回一格）／null（不動：不相鄰、被擋住） */
    function applyDrag(st, c, cell) {
        var p = st.paths[c];
        if (!p.length) return null;
        var head = p[p.length - 1];
        if (p.length >= 2 && cell === p[p.length - 2]) {
            if (st.plugOf[head] == null || st.done[c]) { if (st.plugOf[head] == null) st.occ[head] = -1; p.pop(); st.done[c] = false; return 'back'; }
        }
        if (st.done[c]) return null;                                  /* 已經接通了：只能往回收，不能再往前 */
        if (!adjacent(st.n, head, cell)) return null;
        if (st.occ[cell] === -1) { st.occ[cell] = c; p.push(cell); return 'add'; }
        if (st.plugOf[cell] === c && cell !== p[0] && cell === otherPlug(st, c, p[0])) { p.push(cell); st.done[c] = true; return 'connect'; }
        return null;
    }
    function filled(st) { var f = 0; for (var i = 0; i < st.occ.length; i++) if (st.occ[i] >= 0) f++; return f; }
    function linked(st) { var l = 0; Object.keys(st.done).forEach(function (c) { if (st.done[c]) l++; }); return l; }
    /* 過關：每一格都有電線、每一種顏色都接通 */
    function isSolved(st) { return filled(st) === st.n * st.n && linked(st) === st.plugs.length; }
    function rating(n) {
        if (n >= 25) return '電線大師！';
        if (n >= 15) return '接線高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先接最容易被擋住的那一對，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'wlk-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makePuzzle(level, api.rand), n = q.n, st = newState(q), over = false;
        api.info = q;
        console.log('[接電線] 第 ' + level + ' 關：' + n + '×' + n + '、' + q.k + ' 種顏色（' + q.plugs.map(function (p) { return PALETTE[p.c]; }).join('、') + '）；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 56;
        var cell = Math.floor(Math.min((W - 20) / n, (H - topPad - 20) / n, 90)), BS = cell * n, bx = Math.round((W - BS) / 2), by = topPad + Math.round((H - topPad - BS) / 2) - 8;
        var tip = h('div', { 'class': 'qz-note wlk-tip', text: '' });
        stage.appendChild(tip);
        var board = h('div', { 'class': 'wlk-board' });
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;';
        stage.appendChild(board);
        var cells = [];
        for (var i = 0; i < n * n; i++) {
            var r = Math.floor(i / n), c = i % n, el = h('div', { 'class': 'wlk-cell' });
            el.style.cssText = 'left:' + c * cell + 'px;top:' + r * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;';
            board.appendChild(el); cells.push(el);
        }
        function cx(i) { return (i % n + 0.5) * cell; }
        function cy(i) { return (Math.floor(i / n) + 0.5) * cell; }
        var svg = kit.svg('svg', { 'class': 'wlk-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, board);
        var gSol = kit.svg('g', {}, svg), wires = {}, plugEls = [];
        q.plugs.forEach(function (p) {
            var w = kit.svg('path', { 'class': 'wlk-wire wlk-c' + p.c, d: '' }, svg);
            w.setAttribute('stroke-width', (cell * 0.46).toFixed(1)); wires[p.c] = w;
        });
        q.plugs.forEach(function (p) {
            [p.a, p.b].forEach(function (k) {
                var g = kit.svg('g', { 'class': 'wlk-plug wlk-c' + p.c }, svg);
                kit.svg('circle', { 'class': 'wlk-plug-body', cx: cx(k), cy: cy(k), r: cell * 0.34 }, g);
                kit.svg('circle', { 'class': 'wlk-plug-in', cx: cx(k), cy: cy(k), r: cell * 0.14 }, g);
                plugEls.push({ g: g, c: p.c });
            });
        });
        function pathD(p) { return p.map(function (k, j) { return (j ? 'L' : 'M') + cx(k).toFixed(1) + ' ' + cy(k).toFixed(1); }).join(' '); }
        function paint() {
            q.plugs.forEach(function (p) {
                var path = st.paths[p.c];
                wires[p.c].setAttribute('d', path.length ? pathD(path) + (path.length === 1 ? ' L' + (cx(path[0]) + 0.01) + ' ' + cy(path[0]) : '') : '');
            });
            plugEls.forEach(function (pe) { pe.g.classList.toggle('wlk-plug--on', !!st.done[pe.c]); });
            tip.textContent = '已接通 ' + linked(st) + '／' + q.k + ' 條　填滿 ' + filled(st) + '／' + n * n + ' 格';
        }
        paint();
        api.timer(timeMs(level), function () { finish('time'); });
        if (level === 1 && kit.once('wirelink.hint')) {
            var p0 = q.plugs[0];
            kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(p0.a), y: by + cy(p0.a), dx: cx(p0.b) - cx(p0.a), dy: cy(p0.b) - cy(p0.a), delay: 500, text: '從插頭拖到同色插頭且佈滿畫面' });
        }

        var pid = null, drawing = -1, lastPt = null;
        function cellAt(x, y) {
            var c = Math.floor((x - bx) / cell), r = Math.floor((y - by) / cell);
            return c < 0 || c >= n || r < 0 || r >= n ? -1 : r * n + c;
        }
        function feed(p) {
            if (over || api.over) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));
            for (var s = 1; s <= steps && !over && !api.over; s++) {
                var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps, k = cellAt(x, y);
                if (k < 0) continue;
                var act = applyDrag(st, drawing, k);
                if (act) { Sfx.play(act === 'connect' ? 'ok' : (act === 'add' ? 'tick' : 'flip')); paint(); if (isSolved(st)) finish('ok'); }
            }
            lastPt = p;
        }
        stage.addEventListener('pointerdown', function (e) {
            if (over || api.over || pid != null) return;
            var p = kit.localPt(e, stage), k = cellAt(p.x, p.y);
            if (k < 0) return;
            var c = startDraw(st, k);
            if (c < 0) return;
            e.preventDefault(); pid = e.pointerId; drawing = c; lastPt = p;
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            paint();
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        function up(e) { if (pid === e.pointerId) { pid = null; drawing = -1; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 結束：kind＝'ok'（接好了）／'time'（時間到） */
        function finish(kind) {
            if (over || api.over) return;
            over = true; pid = null;
            if (kind === 'ok') {
                board.classList.add('wlk-board--lit');
                tip.textContent = '全部接好了，燈全亮！';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1500 });
                return;
            }
            /* 時間到：沒接通的電線閃紅；正確的接法一條一條畫出來（每條晚 0.25 秒） */
            var miss = 0;
            q.plugs.forEach(function (p, i) {
                if (!st.done[p.c]) { wires[p.c].classList.add('wlk-wire--bad'); miss++; }
                var sl = kit.svg('path', { 'class': 'wlk-sol wlk-c' + p.c, d: pathD(q.solution[i]), pathLength: 1 }, gSol);
                sl.setAttribute('stroke-width', (cell * 0.46).toFixed(1));
                sl.style.animationDelay = (i * 0.25) + 's';
            });
            board.classList.add('wlk-board--reveal');
            gSol.classList.add('wlk-sol--draw');
            tip.textContent = '時間到！彩色粗線是其中一種接法';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: ['時間到，還有 ' + miss + ' 條電線沒接通、' + (n * n - filled(st)) + ' 格沒填滿', '板子 ' + n + '×' + n + '、' + q.k + ' 種顏色'] });
        }
        /* 驗證用：api.solve 把出題時的解一條一條接好；api.wrong 直接當作時間到 */
        api.solve = function () {
            q.plugs.forEach(function (p, i) {
                var c = startDraw(st, q.solution[i][0]);
                q.solution[i].slice(1).forEach(function (k) { applyDrag(st, c, k); });
            });
            paint(); if (isSolved(st)) finish('ok');
        };
        api.wrong = function () { finish('time'); };
    }

    var G = {
        id: ID,
        name: '接電線',
        rule: '方格板上有幾對同顏色的插頭。**手指從一個插頭拖到同色的另一個插頭**，拖過的格子會變成電線。**電線必須占滿每一格且不能交叉**才過關。拖錯了，從插頭重新拖就好。來不及就結束，看你能過幾關。越後面，棋盤越大、顏色越多，還會有兩種很像的顏色（藍和水藍、橘和黃）！',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, colorsFor: colorsFor, timeMs: timeMs, splitLengths: splitLengths, makePuzzle: makePuzzle, newState: newState, startDraw: startDraw, applyDrag: applyDrag,
            filled: filled, linked: linked, isSolved: isSolved, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SIZE: SIZE, COLORS: COLORS, TIME_S: TIME_S, MIN_SEG: MIN_SEG, PALETTE: PALETTE, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
