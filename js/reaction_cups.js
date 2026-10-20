/* ═══════════════════════════════════════════════════════════════════
   reaction_cups.js — 秒反應・球在哪杯（原「杯子在哪」，三杯一球）
   球藏在其中一個杯子下面，杯子快速成對交換位置，最後點出球在哪個杯子。
   答對進下一關（杯子變多、換得更多更快），答錯就結束。成績＝通過的關卡數。
   ───────────────────────────────────────────────────────────────────
   · 先把整串交換（makeSwaps）產生成純資料，再依序播放動畫：球在哪個位置是「算出來」
     的（applySwaps），不是看動畫結果，所以不管動畫有沒有播完、rAF 有沒有被瀏覽器暫停，
     答案都是對的。動畫用 kit.round().tween（rAF 為主、setTimeout 保底）。
   · 難度全部線性：杯子數 3 → 7（每 3 關 +1）、每關交換次數 +2、每次交換時間
     從 0.6 秒線性縮到 0.18 秒；PAIRS_FROM_LEVEL 關起（且杯子 ≥ 4 個）會兩對同時換。
   · V1.34（玩家意見：杯子改成以圓環狀擺放，像圓型的傳統時鐘；杯子會移動到圓環的另一端，這樣可以容納更多杯子，杯子移動時也不容易互相遮蔽；
     刻意讓杯子們開始移動的時間點有些許差異、互相錯開）：
       - 版面：n 個位置平均排在一個圓上（ringLayout／slotPoint，第 0 個在 12 點鐘、順時針），杯子最多 CUPS_MAX ＝ 12 個（像鐘面）；
       - 交換：兩個位置要夠遠（farEnough：至少相隔 FAR_FRAC × n 格，杯子穿過圓環中間移動到另一端）；一步兩對同時換時，兩條路線（弦）盡量不交叉（chordsCross）；
         每個杯子沿著兩個位置之間的弦走（swapPos），兩個杯子往相反的方向凸出一點弧度，不會正面撞上；
       - 錯開：每個杯子各自晚 0～STAGGER（30%）倍的時間才出發（隨機），整步總時間不變；
       - 前後遮擋：杯底越靠下的杯子畫在越上面（sortZ）；點擊：找離手指最近的位置（二維距離）。
   · 交換時一個杯子走弧線在上、另一個走弧線在下，路徑會交叉，不是單純平移。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'cups';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 cups 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 杯子數：3 個起，每 3 關多一個，最多 7 個 */
    var CUPS_START = 3, CUPS_MAX = 12, CUPS_EVERY = 3;  /* 每 CUPS_EVERY 關多一個杯子，最多 CUPS_MAX（V1.34：圓環排列放得下更多，7 → 12，像鐘面） */
    /* 交換次數：5 次起，每關 +2，最多 60 */
    var SWAPS_START = 5, SWAPS_STEP = 2, SWAPS_MAX = 60;
    /* 每次交換的時間（秒）：隨關卡線性縮短（越來越快） */
    var SWAP_SEC_START = 0.5, SWAP_SEC_END = 0.10, SWAP_RAMP_LEVELS = 20;
    var PAIRS_FROM_LEVEL = 8;   /* 這一關起，杯子 ≥ 4 個時會兩對同時交換 */
    var REVEAL_MS = 1100;       /* 開場掀開杯子露出球的時間 */
    var LIFT_PX = 54;           /* 掀開杯子的高度 */
    var ARC_PX = 34;            /* 交換時弧線的高度 */
    var GAP_MS = 40;            /* 兩次交換之間的間隔 */
    var FAR_FRAC = 0.3;         /* 交換的兩個位置，在圓環上至少相隔「杯子數 × 這個比例」格（杯子要移動到圓環的另一端；至少 1 格） */
    var STAGGER = 0.3;          /* 同一步裡每個杯子各自晚多少比例的時間才出發（0～這個比例，隨機），杯子們的移動才會錯開 */
    var RING_PAD = 14;          /* 圓環（含杯子）離場地邊緣至少多遠 */
    var RING_FILL = 0.84;       /* 杯子寬度最多占相鄰兩個杯位距離的比例（杯子多的時候靠它避免杯子互相疊在一起） */
    var CUP_W_MAX = 86;         /* 杯子寬度上限 */
    var CUP_H = 1.12, CUP_TOP = 1.08;   /* 杯高是杯寬的幾倍；杯口上緣（含杯身頂端的弧度）比杯高再多一點 */

    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 第 ' + v + ' 關'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關有幾個杯子 */
    function cupsFor(level) { return Math.min(CUPS_MAX, CUPS_START + Math.floor((level - 1) / CUPS_EVERY)); }
    /* 這一關要交換幾次 */
    function swapsFor(level) { return Math.min(SWAPS_MAX, SWAPS_START + SWAPS_STEP * (level - 1)); }
    /* 這一關每次交換花幾秒 */
    function swapSecFor(level) { return kit.ramp(level, SWAP_SEC_START, SWAP_SEC_END, SWAP_RAMP_LEVELS); }

    /* 兩個位置在圓環上的「環上距離」（相隔幾格，走近的那一邊）：0～floor(n/2) */
    function ringDist(n, a, b) { var d = Math.abs(a - b) % n; return Math.min(d, n - d); }
    /* 兩個位置夠不夠「遠」：杯子要移動到圓環的另一端（V1.34 玩家意見），所以交換的兩個位置至少相隔 FAR_FRAC × n 格（n 小時至少 1 格） */
    function farEnough(n, a, b) { return ringDist(n, a, b) >= Math.max(1, Math.round(n * FAR_FRAC)); }
    /* 兩條弦（交換 p＝[a,b] 與交換 q＝[c,d] 的路線）在圓裡會不會交叉：c、d 一個在 a～b 之間、一個在外面就會交叉 */
    function chordsCross(p, q) {
        var lo = Math.min(p[0], p[1]), hi = Math.max(p[0], p[1]);
        function inside(x) { return x > lo && x < hi; }
        return inside(q[0]) !== inside(q[1]);
    }
    /* 產生整串交換：先用資料算好，再播放動畫。球在哪裡是「算出來」的，不是看動畫結果，所以動畫沒播完或畫面卡住，答案都是對的 */
    /* 產生整串交換。回傳 { steps, finalBall }：
       steps＝陣列，每一項是一步，一步是 1～2 對「位置編號」[[a,b]] 或 [[a,b],[c,d]]（兩對互不重疊）。
       至少要有 minBall 次交換牽涉到「球所在的位置」，不然球整局都沒動就太簡單了。
       V1.34（杯子改成圓環排列）：交換的兩個位置要夠遠（farEnough：杯子移動到圓環的另一端）；
       一步有兩對同時換時，兩條路線（弦）盡量不交叉（chordsCross），杯子才不會在圓心撞在一起。條件找不到（極少）就放寬。 */
    /* n 杯子數、count 交換次數、pairs 能不能兩對同時換、ballSlot 球一開始的位置 */
    function makeSwaps(n, count, pairs, ballSlot, rand) {
        rand = rand || Math.random;
        /* 最多重試 60 次，直到球被牽涉到足夠多次（不然球整局都沒動就太簡單） */
        for (var attempt = 0; attempt < 60; attempt++) {
            var steps = [];
            var ball = ballSlot, touched = 0, prevKey = '';
            var made = 0;
            /* while：還沒湊滿 count 次就繼續產生下一步 */
            while (made < count) {
                var two = pairs && n >= 4 && made + 2 <= count && rand() < 0.5, step = null, tr;
                /* 先找「夠遠、路線不交叉」的（前 200 次，亂數抽樣；杯子多的時候夠遠又不交叉的組合比例低，要多抽幾次）；找不到就先放寬「不交叉」（接下來 50 次，只要夠遠）；再找不到才連「夠遠」也放寬（只要是不同的位置）。
                   例如 5 個杯子、一步兩對：兩對都至少相隔 2 格的組合，路線一定交叉，所以會走到第二關。 */
                for (tr = 0; tr < 300 && !step; tr++) {
                    var slots = kit.shuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }), rand);
                    var s1 = [slots[0], slots[1]];
                    if (tr < 250 && !farEnough(n, s1[0], s1[1])) continue;
                    if (two) {
                        var s2 = [slots[2], slots[3]];
                        if (tr < 250 && !farEnough(n, s2[0], s2[1])) continue;
                        if (tr < 200 && chordsCross(s1, s2)) continue;
                        step = [s1, s2];
                    } else step = [s1];
                }
                /* 不連續做一模一樣的交換（等於沒換）；JSON.stringify 把交換內容轉成字串好比較 */
                var key = JSON.stringify(step.map(function (p) { return p.slice().sort(); }).sort());
                if (key === prevKey) continue;      /* 不連續做一模一樣的交換（等於沒換） */
                prevKey = key;
                /* 照這一步交換，更新球的位置 */
                step.forEach(function (p) {
                    if (ball === p[0]) { ball = p[1]; touched++; }
                    else if (ball === p[1]) { ball = p[0]; touched++; }
                });
                steps.push(step);
                made += step.length;
            }
            if (touched >= Math.min(count, Math.max(2, Math.floor(count / 3)))) return { steps: steps, finalBall: ball };
        }
        return { steps: steps, finalBall: ball };
    }
    /* 圓環版面（V1.34 玩家意見：杯子改成圓環狀擺放，像傳統時鐘，可以容納更多杯子、杯子移動時也不容易互相遮蔽）：
       n 個位置平均分布在一個圓上，第 0 個在 12 點鐘、順時針排；FW×FH 是場地大小。回傳
       { n, cx, cyBase, R, CW, CH }：圓心 x、圓心的「杯底」y（位置 i 的杯底在 (cx + R sin θ, cyBase − R cos θ)，θ＝2π i/n）、圓半徑、杯子寬高。
       杯子寬 CW 不能超過相鄰兩杯的距離（RING_FILL × 2πR/n），整圈（含杯子往上長的高度 CH）要放得進場地：
       水平 R ＋ CW/2 ≤ FW/2 − RING_PAD、垂直 2R ＋ CH ≤ FH − 2 × RING_PAD；R 與 CW 互相影響，用迭代找到穩定的解。整組在場地裡上下置中。 */
    function ringLayout(n, FW, FH) {
        /* 先量這 n 個位置的「單位圓」範圍：水平最遠 |sin θ|、垂直 −cos θ 的最小與最大（偶數個杯子垂直範圍是 2，3 個杯子只有 1.5，不一定是 2R） */
        var sinMax = 0, cMin = 1e9, cMax = -1e9, i;
        for (i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; sinMax = Math.max(sinMax, Math.abs(Math.sin(a))); cMin = Math.min(cMin, -Math.cos(a)); cMax = Math.max(cMax, -Math.cos(a)); }
        var span = cMax - cMin, CW = CUP_W_MAX, CH = CW * CUP_H, R = 0;
        for (var it = 0; it < 40; it++) {
            R = Math.max(30, Math.min((FW / 2 - RING_PAD - CW / 2) / sinMax, (FH - 2 * RING_PAD - CH * CUP_TOP) / span));
            CW = Math.min(CUP_W_MAX, 2 * Math.PI * R / n * RING_FILL);
            CH = CW * CUP_H;
        }
        R = Math.max(30, Math.min((FW / 2 - RING_PAD - CW / 2) / sinMax, (FH - 2 * RING_PAD - CH * CUP_TOP) / span));
        /* 整組（杯底到杯口最上緣）在場地裡上下置中：最上緣在 cyBase ＋ R × cMin − CH × CUP_TOP，最下緣（杯底）在 cyBase ＋ R × cMax */
        var top = R * cMin - CH * CUP_TOP, bottom = R * cMax;
        return { n: n, cx: FW / 2, cyBase: FH / 2 - (top + bottom) / 2, R: R, CW: CW, CH: CH };
    }
    /* 第 i 個位置的杯底座標 */
    function slotPoint(L, i) {
        var a = 2 * Math.PI * i / L.n;
        return { x: L.cx + L.R * Math.sin(a), y: L.cyBase - L.R * Math.cos(a) };
    }
    /* 杯子在一次交換裡的位置：from、to 是兩端的杯底座標，e 是進度 0～1（已經套過緩動），dir 是 +1／−1。
       路線＝兩端之間的直線，再往「出發→目的」方向的垂直方向凸出 sin(π e) × ARC_PX × dir。
       同一對交換的兩個杯子，出發→目的的方向剛好相反，垂直方向也相反，所以兩個杯子用同樣的 dir，就會往相反的兩側凸出去，路線不會正面撞上。 */
    function swapPos(from, to, e, dir) {
        var dx = to.x - from.x, dy = to.y - from.y, len = Math.sqrt(dx * dx + dy * dy) || 1, arc = Math.sin(Math.PI * e) * ARC_PX * dir;
        return { x: from.x + dx * e - dy / len * arc, y: from.y + dy * e + dx / len * arc };
    }
    /* 照一串交換走一遍，回傳球最後在哪個位置（驗證 makeSwaps 用） */
    /* 照一串交換走一遍，回傳球最後在哪個位置（用來驗證 makeSwaps 的 finalBall） */
    function applySwaps(steps, ballSlot) {
        var ball = ballSlot;
        steps.forEach(function (step) {
            step.forEach(function (p) {
                if (ball === p[0]) ball = p[1]; else if (ball === p[1]) ball = p[0];
            });
        });
        return ball;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;
        /* bestLevel：進場時的最佳紀錄，用來判斷這次有沒有破紀錄 */
        var bestLevel = Reaction.getBest(ID);

        /* round：開一關 */
        function round(level) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            level = level || 1;
            root.innerHTML = '';
            ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));

            /* n 這關杯子數 */
            var n = cupsFor(level);
            /* 建立畫面元素：提示、場地 */
            var hint = h('div', { 'class': 'hint', text: '記住球在哪個杯子' });
            var field = h('div', { 'class': 'cp-field' });
            root.appendChild(hint);
            root.appendChild(field);
            var FW = field.clientWidth, FH = field.clientHeight;
            /* SVG 畫布 */
            var svg = kit.svg('svg', { 'class': 'cp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'none' }, field);

            /* 圓環版面：n 個位置平均排在一個圓上（像時鐘，第 0 個在 12 點鐘、順時針）；CW 杯子寬、CH 杯子高；P[i] 是第 i 個位置的杯底座標 */
            var layout = ringLayout(n, FW, FH), CW = layout.CW, CH = layout.CH, P = [];
            for (var si = 0; si < n; si++) P.push(slotPoint(layout, si));

            /* 隨機決定球一開始在哪個位置，並先算好整串交換 */
            var ballSlot = kit.randInt(0, n - 1);
            var plan = makeSwaps(n, swapsFor(level), level >= PAIRS_FROM_LEVEL, ballSlot);

            /* 杯子們：cups[c] 是第 c 號杯子（編號固定不變），slotOf[c] 是它目前站在第幾個位置 */
            /* 杯子們：cups[c] 是第 c 號杯子（編號固定不變），slotOf[c] 是它目前站的位置 */
            var cups = [], slotOf = [], zOrder = [];
            for (var c = 0; c < n; c++) {
                slotOf.push(c);
                /* 每個杯子是一個 SVG 群組 <g>：包含球（只有一個杯子有）和杯身 */
                var g = kit.svg('g', { 'class': 'cp-cup' }, svg);
                var ballEl = null;
                if (c === ballSlot) ballEl = kit.svg('circle', { 'class': 'cp-ball', cx: 0, cy: -CW * 0.2, r: CW * 0.2 }, g);
                var lift = kit.svg('g', { 'class': 'cp-lift' }, g);
                kit.svg('path', {
                    'class': 'cp-cup__body',
                    d: 'M' + (-CW / 2) + ' 0 L' + (-CW * 0.36) + ' ' + (-CH) + ' Q0 ' + (-CH - CW * 0.12) + ' ' + (CW * 0.36) + ' ' + (-CH) + ' L' + (CW / 2) + ' 0 Z'
                }, lift);
                kit.svg('ellipse', { 'class': 'cp-cup__rim', cx: 0, cy: 0, rx: CW / 2, ry: CW * 0.1 }, lift);
                kit.svg('path', { 'class': 'cp-cup__shine', d: 'M' + (-CW * 0.2) + ' ' + (-CH * 0.25) + ' L' + (-CW * 0.14) + ' ' + (-CH * 0.8) }, lift);
                cups.push({ g: g, lift: lift, ball: ballEl, id: c, y: 0 });
                place(cups[c], P[c].x, P[c].y, 0);
            }
            sortZ();
            /* 放置一個杯子：(x, y) 是杯底座標，liftPx 是掀開的高度 */
            function place(cup, x, y, liftPx) {
                cup.y = y;
                cup.g.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
                cup.lift.setAttribute('transform', 'translate(0 ' + (-liftPx).toFixed(2) + ')');
            }
            /* 前後遮擋：杯底越靠下（y 越大）的杯子越靠前、畫在上面。順序有變才重排 DOM，免得每個影格都動 DOM */
            function sortZ() {
                var order = cups.slice().sort(function (a, b) { return a.y - b.y; });
                var same = order.length === zOrder.length && order.every(function (cp, i) { return zOrder[i] === cp; });
                if (same) return;
                zOrder = order;
                order.forEach(function (cp) { svg.appendChild(cp.g); });
            }
            /* 球一開始在第 ballSlot 號位置的杯子（杯子編號＝一開始的位置） */
            var ballCup = ballSlot;

            var state = 'reveal';

            /* 掀開或蓋回杯子的動畫（用 tween 逐步改變高度） */
            function setLift(cupIdx, to, ms) {
                var cup = cups[cupIdx], pt = P[slotOf[cupIdx]];
                var from = cup._lift || 0;
                return my.tween(ms, function (e) {
                    cup._lift = from + (to - from) * e;
                    place(cup, pt.x, pt.y, cup._lift);
                }, kit.easeInOutCubic);
            }

            /* 執行一步交換（V1.34）：每個杯子沿著「兩個位置之間的弦」走到對方的位置（路線凸出一點弧度，兩個杯子往相反的方向凸，不會正面撞上）；
               「刻意讓杯子們的開始移動的時間點有些許的差異」：每個杯子各自晚 0～STAGGER 倍的時間才出發（隨機），走得比較久一點補回來，整步的總時間不變（sec 秒） */
            function doStep(step, sec) {
                var moves = [];
                step.forEach(function (pr) {
                    var ca = slotOf.indexOf(pr[0]), cb = slotOf.indexOf(pr[1]), dir = Math.random() < 0.5 ? 1 : -1;
                    /* 兩個杯子的路線方向相反，垂直方向（法線）也跟著相反，所以用同一個 dir 就會往相反的兩側凸出去；dir 每一對隨機，凸的方向才有變化 */
                    moves.push({ cup: ca, from: pr[0], to: pr[1], dir: dir, delay: Math.random() * STAGGER });
                    moves.push({ cup: cb, from: pr[1], to: pr[0], dir: dir, delay: Math.random() * STAGGER });
                });
                /* my.tween(毫秒, 回呼, 緩動函式)：在指定時間內每個畫面呼叫一次回呼；這裡用線性的 u（0→1），每個杯子再用自己的出發時間與緩動算進度 */
                return my.tween(sec * 1000, function (u) {
                    moves.forEach(function (m) {
                        var e = kit.easeInOutCubic(kit.clamp((u - m.delay) / (1 - STAGGER), 0, 1)), p = swapPos(P[m.from], P[m.to], e, m.dir);
                        place(cups[m.cup], p.x, p.y, cups[m.cup]._lift || 0);
                    });
                    sortZ();
                }, kit.linear).then(function () {
                    moves.forEach(function (m) { slotOf[m.cup] = m.to; place(cups[m.cup], P[m.to].x, P[m.to].y, cups[m.cup]._lift || 0); });
                    sortZ();
                });
            }

            /* 整個流程用 Promise 串起來：掀開露出球 → 蓋回 → 逐步交換 → 讓玩家點。.then() 會等前一個動作完成才執行下一個 */
            /* ─── 流程：掀開露出球 → 蓋回 → 交換 → 玩家點 ─── */
            my.wait(500)
                .then(function () { return setLift(ballCup, LIFT_PX, 350); })
                .then(function () { Sfx.play('flip'); return my.wait(REVEAL_MS); })
                .then(function () { return setLift(ballCup, 0, 300); })
                .then(function () {
                    state = 'swap';
                    hint.textContent = '盯緊…';
                    var chain = my.wait(250), sec = swapSecFor(level);
                    plan.steps.forEach(function (step) {
                        chain = chain.then(function () { Sfx.play('whoosh'); return doStep(step, sec); }).then(function () { return my.wait(GAP_MS); });
                    });
                    return chain;
                })
                .then(function () {
                    state = 'pick';
                    /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「現在有球的那個杯子」上（第一關的正確答案） */
                    if (Reaction.kit.once('cups.hint')) Reaction.kit.hintOn(root, cups[slotOf.indexOf(plan.finalBall)].g, { mode: 'tap', text: '請點擊有球的杯子' });
                    hint.textContent = '球在哪個杯子？點一下！';
                    Sfx.play('go');
                });

            /* 用「位置」選杯子：玩家看到的是位置，不是杯子編號 */
            /* 用「位置」選：玩家看到的是位置，不是杯子編號 */
            function pickSlot(slot) {
                if (state !== 'pick') return;
                state = 'result';
                var cupIdx = slotOf.indexOf(slot);
                var correct = slot === plan.finalBall;
                var right = slotOf.indexOf(plan.finalBall);
                setLift(cupIdx, LIFT_PX + 10, 280);
                if (correct) {
                    Sfx.play('ok');
                    hint.textContent = '答對了！';
                    var passed = level;
                    Reaction.setBest(ID, passed, function (v, b) { return v > b; });
                    ctx.setMeta(kit.meta(['第 ' + level + ' 關', fmtBest(Reaction.getBest(ID))]));
                    my.after(1100, function () { round(level + 1); });
                } else {
                    Sfx.play('bad');
                    hint.textContent = '猜錯了…球在這裡';
                    my.after(500, function () { setLift(right, LIFT_PX + 10, 280); });
                    my.after(1700, function () {
                        var passed = level - 1;
                        var isNew = passed > 0 && Reaction.getBest(ID) === passed && bestLevel !== passed;
                        kit.result(root, {
                            score: passed,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            level: level,         /* 記下到過第幾關，下次進場從最佳關卡 − 4 開始（kit.noteLevel） */
                            num: '通過 ' + passed + ' 關', label: '猜錯了，球在另一個杯子', sfx: passed >= 5 ? 'win' : 'fail',
                            lines: ['這一關有 ' + n + ' 個杯子、換了 ' + swapsFor(level) + ' 次'],
                            isNew: isNew, onAgain: function () { bestLevel = Reaction.getBest(ID); round(1); }
                        });
                    });
                }
            }

            /* 點杯子：杯子位置一直換，所以用事件當下點擊的位置，找離它最近的「位置」（圓環上的 n 個杯位；比較的是杯身中心） */
            var onDown = function (e) {
                if (state !== 'pick') return;
                e.preventDefault();
                var rect = field.getBoundingClientRect();
                var x = (e.clientX - rect.left) * FW / rect.width, y = (e.clientY - rect.top) * FH / rect.height;
                var best = 0, bd = 1e18;
                for (var s = 0; s < n; s++) { var dx = P[s].x - x, dy = P[s].y - CH / 2 - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } }
                pickSlot(best);
            };
            /* 綁定點擊（pointerdown 一碰就觸發） */
            field.addEventListener('pointerdown', onDown);
            /* 這一局結束時把事件監聽拿掉 */
            my.onDispose(function () { field.removeEventListener('pointerdown', onDown); });

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, n: n, state: state, ballSlot: ballSlot, finalBall: plan.finalBall, swaps: plan.steps.length, slotOf: slotOf.slice() }; },
                layout: function () { return { layout: layout, P: P, FW: FW, FH: FH }; },
                pickSlot: pickSlot
            };
        }

        /* V1.34：從「個人最佳關卡 − 4」開始（沒玩過就是第 1 關），見 kit.enter（reaction_kit.js） */
        kit.enter(ID, round);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '球在哪杯',
        rule: '球藏在其中一個杯子下面。杯子像時鐘一樣**圍成一圈**。先看清楚球在哪裡，杯子蓋回後會**穿過圓圈中間，成對換到對面的位置**（出發的時間還會稍微錯開），**眼睛盯緊**！**最後點出球在哪個杯子**。答對進下一關，杯子會變多（最多 12 個）、換得更多更快。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { cupsFor: cupsFor, swapsFor: swapsFor, swapSecFor: swapSecFor, makeSwaps: makeSwaps, applySwaps: applySwaps, ringDist: ringDist, farEnough: farEnough, chordsCross: chordsCross, ringLayout: ringLayout, slotPoint: slotPoint, swapPos: swapPos, CUPS_START: CUPS_START, CUPS_MAX: CUPS_MAX, CUPS_EVERY: CUPS_EVERY, FAR_FRAC: FAR_FRAC, STAGGER: STAGGER, RING_PAD: RING_PAD, RING_FILL: RING_FILL, CUP_W_MAX: CUP_W_MAX, ARC_PX: ARC_PX }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
