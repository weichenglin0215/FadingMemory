/* ═══════════════════════════════════════════════════════════════════
   reaction_shapegrid.js — 秒反應・形色不相鄰（原創篇 542「夜市擺攤」，照使用者的修改改成擺幾何形狀）
   樣式：css/games/reaction_shapegrid.css（class 一律以「shapegrid-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：九宮格（3×3）、16 宮格（4×4）、25 宮格（5×5）。下面有一盒圖形：n 種形狀 × n 種顏色，每種組合剛好一個
     （3×3 就是 3 種形狀 × 3 種顏色＝9 個）。**把全部的圖形擺進格子，形狀相同或顏色相同的兩個，不可以左右相鄰、也不可以上下相鄰。**
     點下面的圖形、再點格子放進去；點自己放的圖形可以拿回來。有些格子一開始就放好了（不能動）。
   · 頓悟（3×3）：正中間那格有 4 個鄰居，要跟它「形狀和顏色都不一樣」——3 種形狀、3 種顏色時，剛好只剩 4 個圖形符合，
     所以中間放什麼一決定，旁邊四格放哪 4 個就決定了；接著四個角落……
     4×4、5×5 時，可以想成「形狀排成一種不相鄰的花樣、顏色排成另一種，兩種疊起來每個組合都不重複」。
   · 關卡：3×3（第 1～8 關）→ 4×4（第 9～20 關）→ 5×5（第 21 關起）；每個階段一開始先放好的圖形較多，越後面越少（線性）。
     實測（note/原創篇實驗/exp_impl8.cjs ③）：3×3 完全空白時，9! 種擺法裡只有 72 種合格；4×4、5×5 的合格擺法很多，所以先放好幾個。
   · 沒有時間限制、不會失敗（自由解題）：只要全部擺完、都不相鄰就過關（合格的擺法不只一種，任何一種都算）；按左上角「返回」結束，成績＝解開幾題。
   · 違規時那兩格變紅，下面寫出是「形狀一樣」還是「顏色一樣」。
   · 提示（每題 HINTS 次）：從你目前的擺法找一種擺得完的，替你放好一格（黃框）；如果目前的擺法已經擺不完，就標出要拿起來的那一格。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'shapegrid';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；n＝邊長；given＝先放好幾個：階段第一關 → 第 10 關（之後維持） */
        { to: 8, n: 3, given: [2, 0] },
        { to: 20, n: 4, given: [6, 2] },
        { to: 9999, n: 5, given: [9, 4] }
    ];
    var HINTS = 3;
    var NODE_LIMIT = 300000;                    /* 求解時最多搜尋幾步（超過就當作「不知道」，避免手機卡住） */
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1400;
    var SHAPES = ['圓形', '三角形', '正方形', '星形', '菱形'];
    var COLORS = ['紅色', '藍色', '綠色', '黃色', '紫色'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: level - from + 1, len: Math.min(STAGES[i].to - from + 1, 10) };
            from = STAGES[i].to + 1;
        }
    }
    /* 圖形編號 p＝形狀 × n ＋ 顏色 */
    function shapeOf(p, n) { return Math.floor(p / n); }
    function colorOf(p, n) { return p % n; }
    /* 兩個圖形能不能相鄰：形狀不同而且顏色不同 */
    function canTouch(a, b, n) { return shapeOf(a, n) !== shapeOf(b, n) && colorOf(a, n) !== colorOf(b, n); }
    function neighbors(k, n) {
        var r = Math.floor(k / n), c = k % n, out = [];
        if (r > 0) out.push(k - n); if (r < n - 1) out.push(k + n); if (c > 0) out.push(k - 1); if (c < n - 1) out.push(k + 1);
        return out;
    }
    /* 違規的相鄰兩格：[{ a, b, why:'shape'|'color' }]（g[k]＝圖形編號，−1＝空格） */
    function violations(g, n) {
        var out = [];
        for (var k = 0; k < n * n; k++) {
            if (g[k] < 0) continue;
            [k + 1, k + n].forEach(function (q) {
                if (q === k + 1 && (k % n) === n - 1) return;
                if (q >= n * n || g[q] < 0) return;
                if (shapeOf(g[k], n) === shapeOf(g[q], n)) out.push({ a: k, b: q, why: 'shape' });
                else if (colorOf(g[k], n) === colorOf(g[q], n)) out.push({ a: k, b: q, why: 'color' });
            });
        }
        return out;
    }
    /* 從目前的擺法（g，−1＝空格）找一種擺得完的。rand 有給就隨機挑順序（出題用）。
       回傳 { sol: 擺法｜null, gaveUp: 是否超過 NODE_LIMIT } */
    function solve(g, n, rand, limit) {
        limit = limit || NODE_LIMIT;
        var N = n * n, used = [], cur = g.slice(), nodes = 0, found = null, gaveUp = false, k, p;
        for (p = 0; p < N; p++) used.push(false);
        for (k = 0; k < N; k++) if (cur[k] >= 0) { if (used[cur[k]]) return { sol: null, gaveUp: false }; used[cur[k]] = true; }
        if (violations(cur, n).length) return { sol: null, gaveUp: false };
        var order = []; for (p = 0; p < N; p++) order.push(p);
        (function rec(k) {
            if (found || gaveUp) return;
            if (++nodes > limit) { gaveUp = true; return; }
            while (k < N && cur[k] >= 0) k++;
            if (k === N) { found = cur.slice(); return; }
            var cand = rand ? kit.shuffle(order, rand) : order, nb = neighbors(k, n);
            for (var i = 0; i < cand.length; i++) {
                var q = cand[i];
                if (used[q]) continue;
                var ok = true;
                for (var j = 0; j < nb.length; j++) if (cur[nb[j]] >= 0 && !canTouch(q, cur[nb[j]], n)) { ok = false; break; }
                if (!ok) continue;
                used[q] = true; cur[k] = q;
                rec(k + 1);
                used[q] = false; cur[k] = -1;
                if (found || gaveUp) return;
            }
        })(0);
        return { sol: found, gaveUp: gaveUp };
    }
    /* 出一題：{ n, sol（一種合格擺法）, given[k]（先放好的圖形，−1＝空格） } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), n = s.st.n, N = n * n, sol = null, k;
        var empty = []; for (k = 0; k < N; k++) empty.push(-1);
        for (var tr = 0; tr < 20 && !sol; tr++) sol = solve(empty, n, rand, NODE_LIMIT).sol;
        if (!sol) {                                  /* 保底（實測不會用到）：形狀＝(列＋行) mod n、顏色＝(列＋2×行) mod n 一定合格 */
            sol = []; for (k = 0; k < N; k++) { var r = Math.floor(k / n), c = k % n; sol.push(((r + c) % n) * n + (r + 2 * c) % n); }
        }
        var cnt = Math.round(kit.ramp(s.idx, s.st.given[0], s.st.given[1], Math.max(2, s.len)));
        var given = empty.slice();
        kit.shuffle(Object.keys(sol).map(Number), rand).slice(0, cnt).forEach(function (q) { given[q] = sol[q]; });
        return { n: n, sol: sol, given: given };
    }
    /* 違規說明的文字 */
    function whyText(v, g, n) { return v.why === 'shape' ? '兩個都是' + SHAPES[shapeOf(g[v.a], n)] + '，不能相鄰' : '兩個都是' + COLORS[colorOf(g[v.a], n)] + '，不能相鄰'; }
    function rating(n) {
        if (n >= 25) return '排列大師！';
        if (n >= 12) return '形狀顏色都顧到了！';
        if (n >= 5) return '越來越有感覺了！';
        return '先決定正中間那格：它的四個鄰居形狀、顏色都要跟它不一樣！';
    }

    /* 圖形的 SVG：形狀 s（0 圓、1 三角、2 正方、3 星、4 菱形）、顏色 c（用 CSS 變數 --shapegrid-c0～4） */
    var SVGNS = 'http://www.w3.org/2000/svg';
    function shapeSvg(s, c) {
        var svg = document.createElementNS(SVGNS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('class', 'shapegrid-svg');
        var el;
        if (s === 0) { el = document.createElementNS(SVGNS, 'circle'); el.setAttribute('cx', 50); el.setAttribute('cy', 50); el.setAttribute('r', 40); }
        else if (s === 2) { el = document.createElementNS(SVGNS, 'rect'); el.setAttribute('x', 13); el.setAttribute('y', 13); el.setAttribute('width', 74); el.setAttribute('height', 74); el.setAttribute('rx', 6); }
        else {
            el = document.createElementNS(SVGNS, 'polygon');
            var pts = s === 1 ? '50,8 93,88 7,88' : s === 4 ? '50,5 92,50 50,95 8,50' : (function () {
                var a = [], i; for (i = 0; i < 10; i++) { var ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 19 : 46; a.push((50 + rr * Math.cos(ang)).toFixed(1) + ',' + (53 + rr * Math.sin(ang)).toFixed(1)); } return a.join(' ');
            })();
            el.setAttribute('points', pts);
        }
        el.setAttribute('class', 'shapegrid-fill shapegrid-fill--' + c);
        svg.appendChild(el);
        return svg;
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false, leaveSettle: true,
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
        var pz = makePuzzle(level, api.rand), n = pz.n, N = n * n;
        api.info = pz;
        console.log('[形色不相鄰] 第 ' + level + ' 關：' + n + '×' + n + '，先放好 ' + pz.given.filter(function (v) { return v >= 0; }).length + ' 個');
        var W = stage.clientWidth || 472, H = stage.clientHeight || 700;
        var chip = n >= 5 ? 52 : 60, perRow = Math.floor((W * 0.96 + 6) / (chip + 6)), trayRows = Math.ceil(N / perRow);
        var cell = Math.min(116, Math.floor((W * 0.92 - (n - 1) * 6) / n), Math.floor((H - trayRows * (chip + 6) - 150 - (n - 1) * 6) / n));
        var g = pz.given.slice(), hinted = {}, pick = -1, hintsLeft = HINTS, solved = false, flagged = -1;

        var wrap = h('div', { 'class': 'shapegrid-wrap' });
        var board = h('div', { 'class': 'shapegrid-board' });
        board.style.setProperty('--shapegrid-n', n);
        board.style.setProperty('--shapegrid-cell', cell + 'px');
        var cells = [];
        for (var k = 0; k < N; k++) {
            var cl = h('div', { 'class': 'shapegrid-cell' });
            (function (kk) { kit.onTap(cl, function () { tapCell(kk); }); })(k);
            board.appendChild(cl); cells.push(cl);
        }
        var tip = h('div', { 'class': 'shapegrid-tip', text: '形狀一樣、顏色一樣的，都不能相鄰' });
        var tray = h('div', { 'class': 'shapegrid-tray' });
        tray.style.setProperty('--shapegrid-chip', chip + 'px');
        var tools = h('div', { 'class': 'shapegrid-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line shapegrid-tool', type: 'button', text: '提示 ' + hintsLeft });
        var btnReset = h('button', { 'class': 'btn btn--line shapegrid-tool', type: 'button', text: '重來' });
        kit.onTap(btnHint, useHint);
        kit.onTap(btnReset, reset);
        if (HINTS > 0) tools.appendChild(btnHint);
        tools.appendChild(btnReset);
        wrap.appendChild(board); wrap.appendChild(tip); wrap.appendChild(tray); wrap.appendChild(tools);
        stage.appendChild(wrap);

        function paint() {
            var vs = violations(g, n), bad = {};
            vs.forEach(function (v) { bad[v.a] = true; bad[v.b] = true; });
            for (var k = 0; k < N; k++) {
                var el = cells[k], cls = 'shapegrid-cell';
                if (pz.given[k] >= 0) cls += ' shapegrid-cell--given';
                else if (hinted[k]) cls += ' shapegrid-cell--hinted';
                else if (g[k] < 0) cls += ' shapegrid-cell--empty';
                if (bad[k]) cls += ' shapegrid-cell--bad';
                if (k === flagged) cls += ' shapegrid-cell--flag';
                if (solved) cls += ' shapegrid-cell--ok';
                el.className = cls;
                el.innerHTML = '';
                if (g[k] >= 0) el.appendChild(shapeSvg(shapeOf(g[k], n), colorOf(g[k], n)));
            }
            tray.innerHTML = '';
            var used = {}; g.forEach(function (p) { if (p >= 0) used[p] = true; });
            for (var p = 0; p < N; p++) {
                if (used[p]) continue;
                var b = h('div', { 'class': 'shapegrid-chip' + (p === pick ? ' shapegrid-chip--sel' : '') });
                b.appendChild(shapeSvg(shapeOf(p, n), colorOf(p, n)));
                (function (pp) { kit.onTap(b, function () { if (!solved) { pick = pick === pp ? -1 : pp; paint(); } }); })(p);
                tray.appendChild(b);
            }
            if (!solved) tip.textContent = vs.length ? whyText(vs[0], g, n) : (pick >= 0 ? '再點一個空格放進去' : '形狀一樣、顏色一樣的，都不能相鄰');
            tip.className = 'shapegrid-tip' + (vs.length && !solved ? ' shapegrid-tip--bad' : '');
        }
        function tapCell(k) {
            if (solved || pz.given[k] >= 0 || hinted[k]) return;
            flagged = -1;
            if (pick >= 0) { g[k] = pick; pick = -1; }
            else if (g[k] >= 0) g[k] = -1;
            else { tip.textContent = '先點下面的一個圖形'; return; }
            paint();
            if (g.every(function (p) { return p >= 0; }) && !violations(g, n).length) win();
        }
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            var r = solve(g, n, null, NODE_LIMIT), k;
            if (r.sol) {
                for (k = 0; k < N; k++) if (g[k] < 0) break;
                if (k >= N) return;
                hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
                g[k] = r.sol[k]; hinted[k] = true; pick = -1;
                paint(); tip.textContent = '黃框的這一格替你放好了';
                if (g.every(function (p) { return p >= 0; }) && !violations(g, n).length) win();
                return;
            }
            /* 目前的擺法擺不完：用「先放好的＋提示放的」找一種擺法，標出跟它不一樣的那一格 */
            var base = g.map(function (p, q) { return pz.given[q] >= 0 || hinted[q] ? p : -1; });
            var r2 = solve(base, n, null, NODE_LIMIT), target = r2.sol || pz.sol;
            for (k = 0; k < N; k++) if (g[k] >= 0 && pz.given[k] < 0 && !hinted[k] && g[k] !== target[k]) break;
            if (k >= N) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            flagged = k; paint();
            tip.textContent = '照現在這樣擺不完了，閃動的這一格先拿起來';
        }
        function reset() {
            if (solved) return;
            g = pz.given.map(function (p, q) { return hinted[q] ? g[q] : p; });
            pick = -1; flagged = -1; paint();
        }
        function win() {
            solved = true; pick = -1; paint();
            tip.textContent = '全部擺好了，沒有相鄰的！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }
        api.solve = function () { g = pz.sol.slice(); paint(); win(); };
        api.wrong = function () {           /* 驗證用：放一個跟鄰居衝突的 */
            for (var k = 0; k < N; k++) if (pz.given[k] < 0) {
                var nb = neighbors(k, n).filter(function (q) { return g[q] >= 0; })[0];
                if (nb == null) continue;
                var used = {}; g.forEach(function (p) { if (p >= 0) used[p] = true; });
                for (var p = 0; p < N; p++) if (!used[p] && !canTouch(p, g[nb], n)) { g[k] = p; paint(); return; }
            }
        };
        api.state = function () { return { g: g.slice(), pick: pick, solved: solved, hintsLeft: hintsLeft }; };
        paint();
    }

    var G = {
        id: ID,
        name: '形色不相鄰',
        rule: '九宮格（之後是 16 格、25 格）。下面有一盒圖形，**每種形狀配每種顏色剛好一個**。把全部的圖形擺進格子：**形狀一樣或顏色一樣的兩個，不可以左右相鄰，也不可以上下相鄰。**點下面的圖形，再點格子放進去；點自己放的圖形可以拿回來。違規的兩格會變紅。沒有時間限制，也不會失敗；全部擺完而且沒有違規就過關，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, shapeOf: shapeOf, colorOf: colorOf, canTouch: canTouch, neighbors: neighbors, violations: violations, solve: solve,
            makePuzzle: makePuzzle, whyText: whyText, rating: rating, STAGES: STAGES, HINTS: HINTS, NODE_LIMIT: NODE_LIMIT, MAX_LEVEL: MAX_LEVEL, SHAPES: SHAPES, COLORS: COLORS
        }
    };
    Reaction.register(G);
})();
