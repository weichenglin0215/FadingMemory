/* ═══════════════════════════════════════════════════════════════════
   reaction_boxstack.js — 秒反應・疊箱子（原創篇 538「疊箱子」，照使用者的修改）
   樣式：css/games/reaction_boxstack.css（class 一律以「boxstack-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：倉庫的架子每格放一箱，規矩：**越下面越重、越右邊越重**（每一箱都比它上面那箱重、比它左邊那箱重）。
     **有幾箱已經貼好重量、放在固定的位置**（深色的箱子，不能動），其他重量在下面的清單上。
     點清單上的重量、再點空格放進去；點自己放的箱子可以拿回來。放得違反規矩，違反的那兩箱會變紅。
   · 使用者的意見：如果沒有先固定幾箱，照重量從左上排到右下一定會過關、沒有難度。所以：
       ① 每題都先固定幾箱（剛好讓答案只剩一種的最少箱數，前面的關卡多給一兩箱暖身）；
       ② **出題器把「剩下的重量照大小一排一排填、一直行一直行填、或照斜線填就剛好對」的題目全部丟掉**——
          實測（note/原創篇實驗/exp_impl8.cjs ②）只給最少箱數時，3×3 有 68% 的題目照大小排就對，這些都不出。
   · 頓悟：一箱的左上方那一整塊都比它輕、右下方那一整塊都比它重，所以「左上方有幾箱」就是它的下限，
     再用固定的箱子夾：夾在 3 公斤和 8 公斤中間、又要比左上方 2 箱重……一格一格縮小範圍。
   · 關卡：3×3（第 1～8 關）→ 3×4（第 9～16 關）→ 4×4（第 17～24 關）→ 4×5（第 25 關起）。
   · 沒有時間限制、不會失敗（自由解題）；全部放好而且都符合規矩就過關（答案唯一）；按左上角「返回」結束，成績＝解開幾題。
   · 提示（每題 HINTS 次）：有放錯的箱子就標出它；都沒放錯就替你放好一箱（標成黃色）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'boxstack';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；r×c＝架子幾層幾格；extra＝比「最少箱數」多固定幾箱：階段第一關 → 最後一關 */
        { to: 8, r: 3, c: 3, extra: [1, 0] },
        { to: 16, r: 3, c: 4, extra: [1, 0] },
        { to: 24, r: 4, c: 4, extra: [2, 0] },
        { to: 9999, r: 4, c: 5, extra: [2, 0] }
    ];
    var HINTS = 3;
    var TRIES = 300;
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1400;
    var CELL_MAX = 96;                          /* 架上每格最大邊長（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: level - from + 1, len: Math.min(STAGES[i].to, from + 9) - from + 1 };
            from = STAGES[i].to + 1;
        }
    }
    /* 隨機產生一種合法擺法：每次在「可以放的角落」（上面和左邊都放好了的空格）隨機挑一格放下一個重量 */
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
    /* 照固定的箱子（given[k]＝重量，0＝空格），數有幾種填法（最多數到 limit）。
       做法：重量 1、2、3… 依序放；有固定位置的重量只能放在那一格，其他重量放在「上面和左邊都放好了」的空格 */
    function countFill(r, c, given, limit) {
        var N = r * c, pos = {}, g = [], n = 0, k;
        for (k = 0; k < N; k++) { g.push(0); if (given[k]) pos[given[k]] = k; }
        function ok(k) { var i = Math.floor(k / c), j = k % c; return !g[k] && (i === 0 || g[k - c]) && (j === 0 || g[k - 1]); }
        (function rec(v) {
            if (n >= limit) return;
            if (v > N) { n++; return; }
            if (pos[v] != null) { if (ok(pos[v])) { g[pos[v]] = v; rec(v + 1); g[pos[v]] = 0; } return; }
            for (var q = 0; q < N; q++) if (!given[q] && ok(q)) { g[q] = v; rec(v + 1); g[q] = 0; if (n >= limit) return; }
        })(1);
        return n;
    }
    /* 偷懶的填法：剩下的重量由小到大，照某個順序填進空格。order：'row' 一排一排、'col' 一直行一直行、'diag' 照斜線 */
    function naiveFill(r, c, given, order) {
        var N = r * c, used = {}, rest = [], cells = [], k, v, i, j, s;
        for (k = 0; k < N; k++) if (given[k]) used[given[k]] = true;
        for (v = 1; v <= N; v++) if (!used[v]) rest.push(v);
        if (order === 'row') for (k = 0; k < N; k++) cells.push(k);
        else if (order === 'col') for (j = 0; j < c; j++) for (i = 0; i < r; i++) cells.push(i * c + j);
        else for (s = 0; s <= r + c - 2; s++) for (i = 0; i < r; i++) { j = s - i; if (j >= 0 && j < c) cells.push(i * c + j); }
        var g = given.slice(), q = 0;
        cells.forEach(function (k2) { if (!g[k2]) g[k2] = rest[q++]; });
        return g;
    }
    function sameArr(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
    /* 偷懶的填法有沒有剛好對 */
    function naiveWorks(r, c, given, sol) {
        return ['row', 'col', 'diag'].some(function (o) { return sameArr(naiveFill(r, c, given, o), sol); });
    }
    /* 違反規矩的相鄰兩格：[[上或左, 下或右], …]（只看兩格都有箱子的） */
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
    /* 出一題：{ r, c, sol[], given[]（0＝空格） } —— 答案唯一、偷懶的填法都不對 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), st = s.st, r = st.r, c = st.c, N = r * c, last = null;
        var extra = Math.round(kit.ramp(s.idx, st.extra[0], st.extra[1], Math.max(2, s.len)));
        for (var tr = 0; tr < TRIES; tr++) {
            var sol = randomStack(r, c, rand), given = [], k;
            for (k = 0; k < N; k++) given.push(0);
            var order = kit.shuffle(Array.from({ length: N }, function (_, i) { return i; }), rand);
            for (var a = 0; a < N && countFill(r, c, given, 2) !== 1; a++) given[order[a]] = sol[order[a]];   /* 一箱一箱固定，直到唯一 */
            kit.shuffle(Array.from({ length: N }, function (_, i) { return i; }), rand).forEach(function (q) {        /* 再拿掉多餘的 */
                if (!given[q]) return;
                var v = given[q]; given[q] = 0;
                if (countFill(r, c, given, 2) !== 1) given[q] = v;
            });
            var free = order.filter(function (q) { return !given[q]; });
            for (var e = 0; e < extra && e < free.length - 2; e++) given[free[e]] = sol[free[e]];   /* 前面的關卡多固定幾箱暖身 */
            last = { r: r, c: c, sol: sol, given: given };
            if (!naiveWorks(r, c, given, sol)) return last;
        }
        return last;
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
        var pz = makePuzzle(level, api.rand), r = pz.r, c = pz.c, N = r * c;
        api.info = pz;
        console.log('[疊箱子] 第 ' + level + ' 關：' + r + '×' + c + '，固定 ' + pz.given.filter(Boolean).length + ' 箱');
        var W = stage.clientWidth || 472;
        var cell = Math.min(CELL_MAX, Math.floor((W * 0.86 - c * 6) / c));
        var g = pz.given.slice(), hinted = {}, pick = 0, hintsLeft = HINTS, solved = false, flagged = -1;

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
        shelfBox.appendChild(h('div', { 'class': 'boxstack-arrow boxstack-arrow--right', text: '越右邊越重 →' }));
        var row = h('div', { 'class': 'boxstack-shelfrow' }, [shelf, h('div', { 'class': 'boxstack-arrow boxstack-arrow--down', text: '越下面越重 ↓' })]);
        shelfBox.appendChild(row);
        var tray = h('div', { 'class': 'boxstack-tray' });
        var tip = h('div', { 'class': 'boxstack-tip', text: '點下面的重量，再點空格放進去' });
        var tools = h('div', { 'class': 'boxstack-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line boxstack-tool', type: 'button', text: '提示 ' + hintsLeft });
        var btnReset = h('button', { 'class': 'btn btn--line boxstack-tool', type: 'button', text: '重來' });
        kit.onTap(btnHint, useHint);
        kit.onTap(btnReset, reset);
        if (HINTS > 0) tools.appendChild(btnHint);
        tools.appendChild(btnReset);
        wrap.appendChild(shelfBox); wrap.appendChild(tip); wrap.appendChild(tray); wrap.appendChild(tools);
        stage.appendChild(wrap);

        function placedSet() { var s = {}; g.forEach(function (v) { if (v) s[v] = true; }); return s; }
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
            var used = placedSet();
            for (var v = 1; v <= N; v++) {
                if (used[v]) continue;
                var b = h('div', { 'class': 'boxstack-chip' + (v === pick ? ' boxstack-chip--sel' : ''), text: String(v) });
                (function (vv) { kit.onTap(b, function () { if (!solved) { pick = pick === vv ? 0 : vv; paint(); } }); })(v);
                tray.appendChild(b);
            }
            if (vs.length && !solved) tip.textContent = '紅色的兩箱違反規矩：上面的要比下面輕、左邊的要比右邊輕';
        }
        function tapCell(k) {
            if (solved || pz.given[k] || hinted[k]) return;
            flagged = -1;
            if (pick) {                                  /* 放進去（原本有箱子就換回清單） */
                g[k] = pick; pick = 0;
            } else if (g[k]) {                            /* 沒選重量：把這箱拿回清單 */
                g[k] = 0;
            } else { tip.textContent = '先點下面的一個重量'; return; }
            tip.textContent = '點下面的重量，再點空格放進去';
            paint();
            if (g.every(Boolean) && !violations(r, c, g).length) win();
        }
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            var wrong = -1, empty = -1, k;
            for (k = 0; k < N; k++) {
                if (pz.given[k] || hinted[k]) continue;
                if (g[k] && g[k] !== pz.sol[k] && wrong < 0) wrong = k;
                if (g[k] !== pz.sol[k] && empty < 0) empty = k;
            }
            if (wrong < 0 && empty < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            if (wrong >= 0) { flagged = wrong; tip.textContent = '閃動的這一箱放錯了'; paint(); return; }
            /* 都沒放錯：替玩家放好一箱（那個重量如果放在別格，先拿回來） */
            var v = pz.sol[empty];
            for (k = 0; k < N; k++) if (g[k] === v && !pz.given[k]) g[k] = 0;
            g[empty] = v; hinted[empty] = true; pick = 0;
            tip.textContent = '黃色的這一箱是 ' + v + ' 公斤';
            paint();
            if (g.every(Boolean) && !violations(r, c, g).length) win();
        }
        function reset() { if (solved) return; g = pz.given.slice(); Object.keys(hinted).forEach(function (k) { g[k] = pz.sol[k]; }); pick = 0; flagged = -1; paint(); }
        function win() {
            solved = true; pick = 0; paint();
            tip.textContent = '每一箱都比上面、左邊的重！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }
        api.solve = function () { g = pz.sol.slice(); paint(); win(); };
        api.wrong = function () {           /* 驗證用：放一箱違反規矩的 */
            for (var k = 0; k < N; k++) if (!pz.given[k]) { g[k] = N; break; }
            paint();
        };
        api.state = function () { return { g: g.slice(), pick: pick, solved: solved, hintsLeft: hintsLeft }; };
        paint();
    }

    var G = {
        id: ID,
        name: '疊箱子',
        rule: '倉庫的架子每格放一箱，規矩是**越下面越重、越右邊越重**：每一箱都要比它上面那箱重、也比它左邊那箱重。**深色的箱子已經貼好重量、固定在那裡**，其他的重量在下面的清單上。點清單上的重量、再點空格放進去；點自己放的箱子可以拿回來。答案只有一種，照大小隨便排是排不對的。沒有時間限制，也不會失敗；全部放對就過關，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, randomStack: randomStack, countFill: countFill, naiveFill: naiveFill, naiveWorks: naiveWorks, violations: violations,
            makePuzzle: makePuzzle, rating: rating, STAGES: STAGES, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
