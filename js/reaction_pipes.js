/* ═══════════════════════════════════════════════════════════════════
   reaction_pipes.js — 秒反應・接水管
   點一格水管，它就順時針轉 90 度。把左上角水龍頭流出來的水，接到每一個水桶，而且不能漏水。每關有時間限制。
   ───────────────────────────────────────────────────────────────────
   · 一格水管用 4 個 bit 表示開口：N=1、E=2、S=4、W=8（rot 一次＝順時針 90 度：N→E→S→W→N）。
   · 水從水龍頭進到左上角那格的「上方」，所以左上角那格要有 N 開口才通水。
   · 從答案反推題目（所以一定有解）：
       1. 從左上角那格長出一棵樹：先接一個孩子；之後每一步不是「延長」（選一個尾端往旁邊多接一格），
          就是「分岔」（選一個直通的格子往旁邊長出新的尾端，變成 T 字管）。
          要 B 個水桶就做 B−1 次分岔（尾端數＝水桶數）；總格數 S ＝ round(N×N×FILL)。
       2. 樹上每一格就是一塊水管：1 個開口＝尾端（放水桶）、2 個開口＝直管或彎管、3 個開口＝T 管；樹外的格子是空的。
       3. 把每一格隨機轉 0～3 次打亂；打亂後不能已經是解答，而且至少要轉 MIN_TAPS 次才接得通。
   · 判定（每轉一次就算一次）：從水龍頭開始廣度優先搜尋，開口兩邊互相對上才算接通。
     所有水桶都有水、而且有水的格子沒有任何開口朝向空處或沒對上的格子（漏水），就過關。
   · 難度（第 1 → LEVEL_RAMP 關線性）：棋盤 4×4 → 6×6、水桶 1 → 5（T 管 0 → 4 個）、限時 45 → 90 秒（棋盤越大給越多時間）。
   · 成績：通過的關數（越大越好）。時間到就結束，並顯示答案。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'pipes';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度從第 1 關線性變到第 LEVEL_RAMP 關 */
    var LEVEL_RAMP = 10;
    var GRID_START = 4, GRID_END = 6;
    var BUCKETS_START = 1, BUCKETS_END = 5;
    var TIME_START = 45, TIME_END = 90;
    /* FILL：水管樹占棋盤格數的比例（其餘是空格） */
    var FILL = 0.55;                 /* 樹佔棋盤格數的比例 */
    var MIN_TAPS = 3;                /* 打亂後至少要轉幾次才解得開 */
    var CELL = 90;                   /* SVG 單位：一格的邊長 */
    var FAUCET_H = 56;               /* 水龍頭那一條的高度 */
    var NEXT_MS = 1300, ANSWER_MS = 2600;

    /* 【位元（bit）小常識】一格水管的四個開口用 4 個 bit 表示，就像 4 個開關：N 上=1、E 右=2、S 下=4、W 左=8。例如 N+E = 1+2 = 3，代表上和右有開口。用數字就能同時存四個方向 */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 四個方向的 bit 值 */
    var N_ = 1, E_ = 2, S_ = 4, W_ = 8;
    /* 四個方向的陣列 */
    var DIRS = [N_, E_, S_, W_];
    /* 每個方向 x、y 座標的變化（右＝x+1，上＝y−1…） */
    var DX = { 1: 0, 2: 1, 4: 0, 8: -1 }, DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
    /* 每個方向的相反方向（上↔下，左↔右） */
    var OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };

    /* 順時針轉 90 度：開口 bit 左移一位（N→E→S→W），最左邊溢出的 W(8) 再接回 N(1)；& 15 只保留 4 個 bit */
    function rot(m) { return ((m << 1) | (m >> 3)) & 15; }
    /* 轉 k 次 */
    function rotN(m, k) { for (var i = 0; i < k; i++) m = rot(m); return m; }
    /* 計算有幾個開口（把 4 個 bit 加起來） */
    function bits(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }
    /* 這一關棋盤邊長 */
    function gridFor(level) { return Math.round(kit.ramp(level, GRID_START, GRID_END, LEVEL_RAMP)); }
    /* 這一關水桶數 */
    function bucketsFor(level) { return Math.round(kit.ramp(level, BUCKETS_START, BUCKETS_END, LEVEL_RAMP)); }
    /* 這一關限時（棋盤越大給越多時間） */
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* 樹要占幾格 */
    function sizeFor(N) { return Math.round(N * N * FILL); }

    /* 從答案反推題目：先隨機「長」出一棵水管樹（所以題目一定有解），回傳每格的開口與水桶位置；卡住就回傳 null */
    /* 長出一棵樹；失敗（卡住）回傳 null */
    function makeTree(N, B, S, rand) {
        rand = rand || Math.random;
        /* cells：每格的開口（0＝空格） */
        var cells = []; for (var i = 0; i < N * N; i++) cells.push(0);
        /* 左上角那格一定有上方開口（水龍頭接在這裡） */
        cells[0] = N_;                                          /* 左上角：水從上面進來 */
        /* free(i)：第 i 格旁邊還空著、可以接出去的方向 */
        function free(i) {                                       /* 一格旁邊還空著的方向 */
            var x = i % N, y = Math.floor(i / N), out = [];
            DIRS.forEach(function (d) {
                var nx = x + DX[d], ny = y + DY[d];
                if (nx >= 0 && ny >= 0 && nx < N && ny < N && cells[ny * N + nx] === 0) out.push({ d: d, j: ny * N + nx });
            });
            return out;
        }
        /* attach：把兩格接起來（兩邊各加上對應的開口 bit，|= 是「或」運算） */
        function attach(i, f) { cells[i] |= f.d; cells[f.j] |= OPP[f.d]; }
        var f0 = kit.pick(free(0), rand); if (!f0) return null;
        attach(0, f0);
        /* 樹要長 S−2 次：其中 B−1 次是「分岔」（T 字管），其餘是「延長」 */
        var steps = S - 2, isBranch = [];
        for (var s = 0; s < steps; s++) isBranch.push(false);
        kit.shuffle(isBranch.map(function (_, k) { return k; }), rand).slice(0, B - 1).forEach(function (k) { isBranch[k] = true; });
        if (steps < B - 1) return null;
        /* 每一步：挑一個符合條件的格子往旁邊長出新的一格 */
        for (var s2 = 0; s2 < steps; s2++) {
            var cand = [];
            for (var c = 0; c < N * N; c++) {
                if (cells[c] === 0) continue;
                var deg = bits(cells[c]);
                /* 分岔要挑「剛好有 2 個開口」的格子，延長要挑「只有 1 個開口」的尾端 */
                if (isBranch[s2] ? deg === 2 : (deg === 1 && c !== 0)) { var fr = free(c); if (fr.length) cand.push([c, fr]); }
            }
            if (!cand.length) return null;
            var pc = kit.pick(cand, rand);
            attach(pc[0], kit.pick(pc[1], rand));
        }
        /* leaves：樹的尾端（只有一個開口的格子）＝水桶位置 */
        var leaves = []; for (var q = 1; q < N * N; q++) if (cells[q] && bits(cells[q]) === 1) leaves.push(q);
        return { cells: cells, leaves: leaves };
    }

    /* 通水：從水龍頭出發，用深度優先搜尋（stack 堆疊）沿著「兩邊開口互相對上」的路徑找出有水的格子，並找出漏水的開口 */
    /* 通水：回傳 { wet:[bool], leaks:[{i,d}], buckets 是否都有水由 solved 判斷 } */
    function flow(board, N) {
        var wet = board.map(function () { return false; }), leaks = [];
        /* 左上角沒有上方開口就完全不通水 */
        if (!(board[0] & N_)) return { wet: wet, leaks: leaks };
        /* stack 堆疊：後進先出，一直處理到沒有待處理的格子 */
        var stack = [0]; wet[0] = true;
        while (stack.length) {
            var i = stack.pop(), x = i % N, y = Math.floor(i / N);
            DIRS.forEach(function (d) {
                if (!(board[i] & d)) return;
                var nx = x + DX[d], ny = y + DY[d];
                if (nx < 0 || ny < 0 || nx >= N || ny >= N) return;
                var j = ny * N + nx;
                /* 相鄰格子的開口也對得上（OPP＝相反方向）才算通 */
                if ((board[j] & OPP[d]) && !wet[j]) { wet[j] = true; stack.push(j); }
            });
        }
        /* 有水的格子中，如果有開口朝向空格或沒對上的格子，就是漏水 */
        for (var k = 0; k < board.length; k++) {
            if (!wet[k]) continue;
            var kx = k % N, ky = Math.floor(k / N);
            DIRS.forEach(function (d) {
                if (!(board[k] & d)) return;
                if (k === 0 && d === N_) return;                /* 水龍頭的入口不算漏水 */
                var nx = kx + DX[d], ny = ky + DY[d];
                if (nx < 0 || ny < 0 || nx >= N || ny >= N || !(board[ny * N + nx] & OPP[d])) leaks.push({ i: k, d: d });
            });
        }
        return { wet: wet, leaks: leaks };
    }
    /* 解出來：沒有漏水，而且每個水桶都有水 */
    function solved(board, N, buckets) {
        var f = flow(board, N);
        return f.leaks.length === 0 && buckets.every(function (b) { return f.wet[b]; });
    }
    /* 把一格轉成目標形狀至少要點幾下 */
    /* 把一格轉成目標形狀至少要點幾下 */
    function tapsFor(cur, goal) { for (var t = 0; t < 4; t++) { if (rotN(cur, t) === goal) return t; } return -1; }
    function tapsToSolve(board, sol) { var s = 0; for (var i = 0; i < board.length; i++) if (board[i]) s += tapsFor(board[i], sol[i]); return s; }

    /* 出一關：先長出一棵樹當答案，再把每格隨機旋轉打亂，打亂後不能已經是解答、至少要轉 MIN_TAPS 次 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var N = gridFor(level), B = bucketsFor(level), S = sizeFor(N), tree = null;
        /* 最多嘗試 300 次長出樹 */
        for (var t = 0; t < 300 && !tree; t++) tree = makeTree(N, B, S, rand);
        if (!tree) throw new Error('pipes: cannot build a tree');
        var sol = tree.cells, board;
        /* 最多嘗試 200 次打亂 */
        for (var a = 0; a < 200; a++) {
            board = sol.map(function (m) { return m ? rotN(m, Math.floor(rand() * 4)) : 0; });
            if (!solved(board, N, tree.leaves) && tapsToSolve(board, sol) >= MIN_TAPS) break;
        }
        return { level: level, N: N, B: B, S: S, sol: sol, board: board, buckets: tree.leaves, time: timeFor(level) };
    }
    /* 依通過關數給評語 */
    function rating(n) {
        if (n >= 10) return '水管大師！';
        if (n >= 6) return '接得又快又準！';
        if (n >= 3) return '不錯喔！';
        return '再試一次，會更順！';
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

            /* level 目前關卡（先減 1，startLevel 會先加 1）；passed 已過幾關；L 這關資料；board 目前每格開口；state 目前階段；token 流水號；times 每關花的秒數 */
            var level = (startAt || 1) - 1, passed = level, L = null, board = null, state = 'idle', token = 0, times = [], t0 = 0, newRec = false;
            /* 建立畫面元素 */
            var head = h('div', { 'class': 'pp-head', text: ' ' });
            var banner = h('div', { 'class': 'pp-banner', text: ' ' });
            var field = h('div', { 'class': 'pp-field' });
            var tb = kit.timebar();
            [head, banner, field, tb.el].forEach(function (x) { root.appendChild(x); });
            ctx.setMeta(Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) + ' 關' : '');

            /* svg 與每格的元素 */
            var svg, cellEls = [];

            /* 畫整個棋盤（SVG）：水龍頭、每格的底板、4 個方向的管子、中心圓點、水桶、漏水的紅點 */
            function build() {
                field.innerHTML = ''; cellEls = [];
                var W = L.N * CELL, Ht = L.N * CELL + FAUCET_H;
                svg = kit.svg('svg', { 'class': 'pp-svg', viewBox: '0 0 ' + W + ' ' + Ht, preserveAspectRatio: 'xMidYMid meet' }, field);
                /* 水龍頭（在左上角那格的上方）*/
                var fx = CELL / 2;
                kit.svg('line', { 'class': 'pp-source', x1: fx, y1: FAUCET_H - 18, x2: fx, y2: FAUCET_H }, svg);
                kit.svg('rect', { 'class': 'pp-faucet', x: fx - 34, y: 6, width: 68, height: 22, rx: 8 }, svg);
                kit.svg('rect', { 'class': 'pp-faucet', x: fx - 12, y: 24, width: 24, height: FAUCET_H - 40, rx: 4 }, svg);
                var g = kit.svg('g', { transform: 'translate(0,' + FAUCET_H + ')' }, svg);
                for (var i = 0; i < L.N * L.N; i++) {
                    /* (function (i) {...})(i)：立即執行函式，讓每個格子的點擊事件記住自己的編號 */
                    (function (i) {
                        var x = (i % L.N) * CELL, y = Math.floor(i / L.N) * CELL;
                        var cg = kit.svg('g', { 'class': 'pp-cell', transform: 'translate(' + x + ',' + y + ')' }, g);
                        kit.svg('rect', { 'class': 'pp-tile' + (L.sol[i] ? '' : ' pp-tile--empty'), x: 2, y: 2, width: CELL - 4, height: CELL - 4, rx: 10 }, cg);
                        var lines = {}, leaks = {}, c = CELL / 2;
                        var ends = { 1: [c, 0], 2: [CELL, c], 4: [c, CELL], 8: [0, c] };
                        DIRS.forEach(function (d) { lines[d] = kit.svg('line', { 'class': 'pp-pipe', x1: c, y1: c, x2: ends[d][0], y2: ends[d][1] }, cg); });
                        var hub = kit.svg('circle', { 'class': 'pp-hub', cx: c, cy: c, r: 15 }, cg);
                        if (!L.sol[i]) hub.setAttribute('display', 'none');           /* 樹外的空格不畫水管中心 */
                        var bucket = null;
                        if (L.buckets.indexOf(i) >= 0) bucket = kit.svg('circle', { 'class': 'pp-bucket', cx: c, cy: c, r: 26 }, cg);
                        DIRS.forEach(function (d) { leaks[d] = kit.svg('circle', { 'class': 'pp-leak', cx: ends[d][0] + (d === 2 ? -6 : d === 8 ? 6 : 0), cy: ends[d][1] + (d === 4 ? -6 : d === 1 ? 6 : 0), r: 8 }, cg); });
                        /* 點一格就轉一下 */
                        cg.addEventListener('pointerdown', function (e) { e.preventDefault(); turn(i); });
                        cellEls[i] = { g: cg, lines: lines, leaks: leaks, bucket: bucket };
                    })(i);
                }
                paint();
            }

            /* 依目前的開口重畫：顯示有開口的管子、漏水的紅點、有水的格子變藍 */
            function paint() {
                var f = flow(board, L.N), leakSet = {};
                f.leaks.forEach(function (l) { leakSet[l.i + ':' + l.d] = true; });
                for (var i = 0; i < board.length; i++) {
                    var e = cellEls[i];
                    DIRS.forEach(function (d) {
                        e.lines[d].setAttribute('display', (board[i] & d) ? 'inline' : 'none');
                        e.leaks[d].setAttribute('display', leakSet[i + ':' + d] ? 'inline' : 'none');
                    });
                    e.g.setAttribute('class', 'pp-cell' + (f.wet[i] ? ' pp-cell--wet' : '') + (board[i] ? ' pp-cell--pipe' : ''));
                }
                var full = L.buckets.filter(function (b) { return f.wet[b]; }).length;
                banner.textContent = '水桶 ' + full + '／' + L.buckets.length + (f.leaks.length ? '　漏水 ' + f.leaks.length + ' 處' : '');
                return f;
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                level++;
                /* 產生這關 */
                L = makeLevel(level);
                board = L.board.slice();
                var id = ++token;
                state = 'play';
                head.textContent = '第 ' + level + ' 關　限時 ' + Math.round(L.time) + ' 秒';
                build();
                ctx.setMeta(kit.meta(['已過 ' + passed + ' 關', Reaction.getBest(ID) != null ? '最佳 ' + Reaction.getBest(ID) : '']));
                t0 = performance.now();
                /* 主控台印出這關的實際資料（棋盤大小、水桶數、T 管數、至少要轉幾下、限時） */
                try { console.info('[接水管] 第 ' + level + ' 關：' + L.N + '×' + L.N + '、水桶 ' + L.B + '、T 管 ' + (L.B - 1) + '、樹 ' + L.S + ' 格、至少要轉 ' + tapsToSolve(L.board, L.sol) + ' 下、限時 ' + L.time.toFixed(1) + ' 秒'); } catch (e) { }
                tb.set(1);
                /* 倒數 */
                my.loop(function (now) {
                    if (id !== token || state !== 'play') return false;
                    var left = L.time - (now - t0) / 1000;
                    tb.set(left / L.time);
                    head.textContent = '第 ' + level + ' 關　剩 ' + Math.max(0, Math.ceil(left)) + ' 秒';
                });
                my.after(L.time * 1000, function () { if (id === token && state === 'play') timeUp(); });
            }

            /* 點一格：轉 90 度、重畫、檢查有沒有接通 */
            function turn(i) {
                if (state !== 'play' || !board[i]) return;
                board[i] = rot(board[i]);
                Sfx.play('click');
                var f = paint();
                /* 接通了 → 過關 */
                if (solved(board, L.N, L.buckets)) {
                    state = 'won'; token++;
                    passed = level; times.push((performance.now() - t0) / 1000);
                    tb.set(0);
                    if (Reaction.setBest(ID, passed, function (v, b) { return v > b; })) newRec = true;
                    banner.textContent = '通水了！';
                    head.textContent = '第 ' + level + ' 關　過關';
                    Sfx.play('win');
                    ctx.setMeta(kit.meta(['已過 ' + passed + ' 關', '最佳 ' + Reaction.getBest(ID)]));
                    my.after(NEXT_MS, startLevel);
                }
                return f;
            }

            /* 時間到：把答案亮出來，稍後結算 */
            function timeUp() {
                state = 'over'; token++;
                tb.set(0);
                head.textContent = '時間到';
                /* 顯示答案（樹的原始形狀） */
                board = L.sol.slice();                   /* 亮出答案 */
                paint();
                banner.textContent = '答案是這樣接';
                Sfx.play('bad');
                my.after(ANSWER_MS, function () {
                    var avg = times.length ? times.reduce(function (a, b) { return a + b; }, 0) / times.length : null;
                    /* kit.resumeFrom：失敗後可從前 5 關繼續 */
                    var back = kit.resumeFrom(level);
                        kit.result(root, {
                        num: passed + ' 關', label: rating(passed),
                        lines: ['第 ' + level + ' 關（' + L.N + '×' + L.N + '、' + L.B + ' 個水桶）沒接完'].concat(avg != null ? ['過關平均 ' + avg.toFixed(3) + ' 秒'] : []),
                        isNew: newRec && passed > 0, sfx: passed >= 3 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* G.debug：測試用後門，solve() 可以照答案一格一格轉到位 */
            G.debug = {
                state: function () { return { level: level, passed: passed, state: state, N: L && L.N, B: L && L.B, board: board && board.slice(), sol: L && L.sol.slice(), buckets: L && L.buckets.slice(), time: L && L.time }; },
                turn: turn,
                timeUp: function () { if (state === 'play') timeUp(); },
                /* 照答案把每一格轉到位（用 turn，所以會真的觸發判定）*/
                solve: function () { for (var i = 0; i < board.length; i++) { if (!board[i]) continue; var k = tapsFor(board[i], L.sol[i]); for (var t = 0; t < k; t++) turn(i); } },
                solveAllButOne: function () { var left = null; for (var i = 0; i < board.length; i++) { if (!board[i]) continue; var k = tapsFor(board[i], L.sol[i]); if (k && left == null) { left = i; continue; } for (var t = 0; t < k; t++) turn(i); } return left; }
            };
            /* 開場等 400 毫秒再開始第一關 */
            my.after(400, startLevel);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '接水管',
        rule: '點一格水管，它就轉一下。把左上角水龍頭流出來的水，接到每一個水桶，而且管子不能漏水（紅點就是漏水的地方）。每一關都有時間限制，看你能接幾關！',
        mount: mount,
        /* test 匯出純函式給 Node 自動測試 */
        test: { rot: rot, rotN: rotN, bits: bits, gridFor: gridFor, bucketsFor: bucketsFor, timeFor: timeFor, sizeFor: sizeFor, makeTree: makeTree, flow: flow, solved: solved, tapsFor: tapsFor, tapsToSolve: tapsToSolve, makeLevel: makeLevel, rating: rating, N_: N_, E_: E_, S_: S_, W_: W_, LEVEL_RAMP: LEVEL_RAMP, MIN_TAPS: MIN_TAPS }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
