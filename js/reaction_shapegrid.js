/* ═══════════════════════════════════════════════════════════════════
   reaction_shapegrid.js — 秒反應・形色不相鄰（原創篇 542「夜市擺攤」，照使用者的修改改成擺幾何形狀）
   樣式：css/games/reaction_shapegrid.css（class 一律以「shapegrid-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：九宮格（3×3）、16 宮格（4×4）、25 宮格（5×5）。下面有一盒圖形：n 種形狀 × n 種顏色，每種組合剛好一個
     （3×3 就是 3 種形狀 × 3 種顏色＝9 個）。**把全部的圖形擺進格子，形狀相同或顏色相同的兩個，不可以左右相鄰、也不可以上下相鄰**
     （後面的關卡**連斜角也不能相鄰**）。點下面的圖形、再點格子放進去；點自己放的圖形可以拿回來。有些格子一開始就放好了（不能動）。
   · 頓悟（3×3）：正中間那格有 4 個鄰居，要跟它「形狀和顏色都不一樣」——3 種形狀、3 種顏色時，剛好只剩 4 個圖形符合，
     所以中間放什麼一決定，旁邊四格放哪 4 個就決定了；接著四個角落……
     4×4、5×5 時，可以想成「形狀排成一種不相鄰的花樣、顏色排成另一種，兩種疊起來每個組合都不重複」。
   · 使用者的意見（V1.43.0）：「3×3、三種顏色三種形狀，只要從左上角開始依序擺放不同形狀、不同顏色就過關，太簡單。」深度檢查後的結論：
       ① 3×3 的 72 種合格擺法**全部都是同一種「對角線輪流」的花樣**（形狀、顏色各自排成斜線循環），所以這一關本質上就是「找到花樣」，
          沒有辦法靠出題變難；4×4、5×5 只要規則是上下左右，絕大多數的擺法不是花樣，但實測用最笨的「一格一格往下填、卡住就退」
          也只要多試十幾次（4×4 唯一解的題目中位數 24 步、5×5 約 60 步），限制太鬆，完全不需要推理。
       ② 唯一能讓限制變緊的是「**連斜角也不能相鄰**」：4×4 的合格擺法只剩 1152 種、5×5 更少，隨手填幾乎一定卡死，要推理或發現花樣才解得開。
       ③ 再加上「**答案唯一**」：以前只放 2～9 個、擺法有很多種，隨便擺一個合格的就過關；現在每題固定幾個圖形，直到整盤只剩一種擺法
          （最少個數：3×3 約 3 個、4×4 上下左右約 7～8 個、4×4 含斜角約 4 個、5×5 含斜角約 6～7 個），一格一格靠推理才找得出來。
     所以新的階段：3×3（第 1～4 關，上下左右，教規則）→ 4×4 上下左右（第 5～12 關）→ **4×4 連斜角也不能相鄰（第 13～24 關）** →
     **5×5 連斜角也不能相鄰（第 25 關起）**；每個階段一開始多放幾個暖身的圖形（EXTRA），越後面越少（線性），最後只剩「剛好唯一」的最少個數。
   · 限時（V1.43.1，原本是不限時的自由解題）：每一關限時 ＝ TIME_BASE ＋ 空格數 × 每格幾秒（9 → 6 秒，線性），上面的時間條倒數；時間到了＝失敗（把正確答案擺上去）。
     全部擺完、都不相鄰就過關（因為答案唯一，擺得出來的就是答案），成績＝解開幾題。
   · 違規時那兩格變紅，下面寫出是「形狀一樣」還是「顏色一樣」（斜角的會加註「斜角也算」）。
   · 提示（每題 HINTS 次）：從你目前的擺法找一種擺得完的，替你放好一格（黃框）；如果目前的擺法已經擺不完，就標出要拿起來的那一格。
   · 求解器（solve／countSolutions）：每次挑「合法圖形最少的空格」先填（最少候選優先），卡住就退；數解最多數到 2 種、最多搜尋 NODE_LIMIT 步。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'shapegrid';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；n＝邊長；diag＝連斜角也不能相鄰；extra＝比「剛好唯一」的最少個數多放幾個暖身的圖形：階段第一關 → 第 10 關（之後維持） */
        { to: 3, n: 3, diag: false, extra: [1, 0] },
        { to: 10, n: 4, diag: false, extra: [2, 0] },
        { to: 20, n: 4, diag: true, extra: [3, 0] },
        { to: 9999, n: 5, diag: true, extra: [4, 0] }
    ];
    var HINTS = 3;
    var NODE_LIMIT = 300000;                    /* 求解時最多搜尋幾步（超過就當作「不知道」，避免手機卡住） */
    var UNIQ_NODES = 60000;                     /* 出題時檢查「答案唯一」每一次最多搜尋幾步（超過就當作還不唯一，再多放一個） */
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1400;
    var FAIL_HOLD_MS = 6000;
    var TIME_BASE = 25, TIME_CELL = [10, 20];  /* 每一關限時（秒）＝基本 ＋ 每一個空格幾秒（第 1 關 → 第 30 關，線性縮短）；時間到了＝失敗，並亮出答案（V1.43.1） */
    var SHAPES = ['圓形', '三角形', '正方形', '星形', '菱形'];
    var COLORS = ['紅色', '藍色', '綠色', '黃色', '紫色'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeFor(level, empties) { return TIME_BASE + empties * kit.ramp(level, TIME_CELL[0], TIME_CELL[1], 30); }
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
    /* 鄰居：上下左右；diag 為真時連四個斜角也算 */
    function neighbors(k, n, diag) {
        var r = Math.floor(k / n), c = k % n, out = [];
        if (r > 0) out.push(k - n); if (r < n - 1) out.push(k + n); if (c > 0) out.push(k - 1); if (c < n - 1) out.push(k + 1);
        if (diag) {
            if (r > 0 && c > 0) out.push(k - n - 1); if (r > 0 && c < n - 1) out.push(k - n + 1);
            if (r < n - 1 && c > 0) out.push(k + n - 1); if (r < n - 1 && c < n - 1) out.push(k + n + 1);
        }
        return out;
    }
    /* 違規的相鄰兩格：[{ a, b, why:'shape'|'color', diag（是斜角相鄰）}]（g[k]＝圖形編號，−1＝空格；diag 為真時斜角也檢查） */
    function violations(g, n, diag) {
        var out = [], N = n * n;
        for (var k = 0; k < N; k++) {
            if (g[k] < 0) continue;
            var c = k % n, pairs = [[k + 1, false], [k + n, false]];
            if (c === n - 1) pairs[0] = null;
            if (diag) { if (c < n - 1) pairs.push([k + n + 1, true]); if (c > 0) pairs.push([k + n - 1, true]); }
            pairs.forEach(function (pq) {
                if (!pq) return;
                var q = pq[0];
                if (q >= N || g[q] < 0) return;
                if (shapeOf(g[k], n) === shapeOf(g[q], n)) out.push({ a: k, b: q, why: 'shape', diag: pq[1] });
                else if (colorOf(g[k], n) === colorOf(g[q], n)) out.push({ a: k, b: q, why: 'color', diag: pq[1] });
            });
        }
        return out;
    }
    /* 搜尋：從目前的擺法（g，−1＝空格）數有幾種擺得完的（最多數到 limit 種），並記下第一種。
       每一步挑「合法圖形最少」的空格先填（最少候選優先，沒有合法圖形就立刻退回去），比一格一格往下填快得多。
       rand 有給就隨機挑圖形的順序（出題用）；超過 nodeLimit 步就放棄（gaveUp）。回傳 { count, first, gaveUp } */
    function search(g, n, diag, rand, limit, nodeLimit) {
        var N = n * n, used = [], cur = g.slice(), nodes = 0, count = 0, first = null, gaveUp = false, k, p, nbs = [];
        for (p = 0; p < N; p++) used.push(false);
        for (k = 0; k < N; k++) nbs.push(neighbors(k, n, diag));
        for (k = 0; k < N; k++) if (cur[k] >= 0) { if (used[cur[k]]) return { count: 0, first: null, gaveUp: false }; used[cur[k]] = true; }
        if (violations(cur, n, diag).length) return { count: 0, first: null, gaveUp: false };
        function legalOf(k) {
            var out = [];
            for (var q = 0; q < N; q++) {
                if (used[q]) continue;
                var ok = true, nb = nbs[k];
                for (var j = 0; j < nb.length; j++) if (cur[nb[j]] >= 0 && !canTouch(q, cur[nb[j]], n)) { ok = false; break; }
                if (ok) out.push(q);
            }
            return out;
        }
        (function rec() {
            if (count >= limit || gaveUp) return;
            var bestK = -1, best = null, kk;
            for (kk = 0; kk < N; kk++) {
                if (cur[kk] >= 0) continue;
                var cand = legalOf(kk);
                if (!cand.length) return;                          /* 有一格已經沒有圖形可放：這條路走不通 */
                if (!best || cand.length < best.length) { best = cand; bestK = kk; if (cand.length === 1) break; }
            }
            if (bestK < 0) { count++; if (!first) first = cur.slice(); return; }
            if (rand) best = kit.shuffle(best, rand);
            for (var i = 0; i < best.length; i++) {
                if (++nodes > nodeLimit) { gaveUp = true; return; }
                used[best[i]] = true; cur[bestK] = best[i];
                rec();
                used[best[i]] = false; cur[bestK] = -1;
                if (count >= limit || gaveUp) return;
            }
        })();
        return { count: count, first: first, gaveUp: gaveUp };
    }
    /* 從目前的擺法找一種擺得完的。回傳 { sol: 擺法｜null, gaveUp: 是否超過 NODE_LIMIT }（diag：連斜角也不能相鄰） */
    function solve(g, n, rand, limit, diag) {
        var r = search(g, n, !!diag, rand, 1, limit || NODE_LIMIT);
        return { sol: r.first, gaveUp: r.gaveUp };
    }
    /* 有幾種擺法（最多數到 limit 種；gaveUp＝超過 nodeLimit 步，數不清楚） */
    function countSolutions(g, n, diag, limit, nodeLimit) { return search(g, n, !!diag, null, limit || 2, nodeLimit || NODE_LIMIT); }
    function isUnique(g, n, diag, nodeLimit) { var r = countSolutions(g, n, diag, 2, nodeLimit || UNIQ_NODES); return r.count === 1 && !r.gaveUp; }
    /* 出一題：{ n, diag, sol（唯一的擺法）, given[k]（先放好的圖形，−1＝空格） }
       做法：先隨機找一種合格擺法當答案 → 照亂數順序一個一個固定，直到整盤只剩這一種擺法 → 再把多餘的拿掉（最少個數）→
       最後依關卡多放 extra 個暖身的圖形（階段第一關最多，越後面越少）。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), n = s.st.n, diag = !!s.st.diag, N = n * n, sol = null, k, tr;
        var empty = []; for (k = 0; k < N; k++) empty.push(-1);
        for (tr = 0; tr < 20 && !sol; tr++) sol = solve(empty, n, rand, NODE_LIMIT, diag).sol;
        if (!sol) {                                  /* 保底（實測不會用到）：形狀＝(列＋行) mod n、顏色＝(列＋2×行) mod n（只保證上下左右合格） */
            diag = false; sol = []; for (k = 0; k < N; k++) { var r = Math.floor(k / n), c = k % n; sol.push(((r + c) % n) * n + (r + 2 * c) % n); }
        }
        var order = kit.shuffle(Object.keys(sol).map(Number), rand), given = empty.slice();
        for (var a = 0; a < N && !isUnique(given, n, diag); a++) given[order[a]] = sol[order[a]];             /* 一個一個固定，直到唯一 */
        kit.shuffle(order, rand).forEach(function (q) {                                                          /* 再拿掉多餘的 */
            if (given[q] < 0) return;
            var v = given[q]; given[q] = -1;
            if (!isUnique(given, n, diag)) given[q] = v;
        });
        var extra = Math.round(kit.ramp(s.idx, s.st.extra[0], s.st.extra[1], Math.max(2, s.len)));
        var free = order.filter(function (q) { return given[q] < 0; });
        for (var e = 0; e < extra && e < free.length - 2; e++) given[free[e]] = sol[free[e]];
        return { n: n, diag: diag, sol: sol, given: given };
    }
    /* 違規說明的文字 */
    function whyText(v, g, n) { return (v.why === 'shape' ? '兩個都是' + SHAPES[shapeOf(g[v.a], n)] : '兩個都是' + COLORS[colorOf(g[v.a], n)]) + (v.diag ? '，斜角也不能相鄰' : '，不能相鄰'); }
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
        var pz = makePuzzle(level, api.rand), n = pz.n, N = n * n, diag = pz.diag;
        var tipDefault = diag ? '形狀一樣、顏色一樣的，上下左右、斜角都不能相鄰' : '形狀一樣、顏色一樣的，都不能相鄰';
        api.info = pz;
        console.log('[形色不相鄰] 第 ' + level + ' 關：' + n + '×' + n + (diag ? '（含斜角）' : '') + '，先放好 ' + pz.given.filter(function (v) { return v >= 0; }).length + ' 個');
        var W = stage.clientWidth || 472, H = stage.clientHeight || 700;
        var chip = n >= 5 ? 52 : 60, perRow = Math.floor((W * 0.96 + 6) / (chip + 6)), trayRows = Math.ceil(N / perRow);
        var cell = Math.min(116, Math.floor((W * 0.92 - (n - 1) * 6) / n), Math.floor((H - trayRows * (chip + 6) - 150 - (n - 1) * 6) / n));
        var g = pz.given.slice(), hinted = {}, pick = -1, hintsLeft = HINTS, solved = false, flagged = -1, dead = false;

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
        var tip = h('div', { 'class': 'shapegrid-tip', text: tipDefault });
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
            var vs = violations(g, n, diag), bad = {};
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
                (function (pp) { kit.onTap(b, function () { if (!solved && !dead) { pick = pick === pp ? -1 : pp; paint(); } }); })(p);
                tray.appendChild(b);
            }
            if (!solved) tip.textContent = vs.length ? whyText(vs[0], g, n) : (pick >= 0 ? '再點一個空格放進去' : tipDefault);
            tip.className = 'shapegrid-tip' + (vs.length && !solved ? ' shapegrid-tip--bad' : '');
        }
        function tapCell(k) {
            if (solved || dead || pz.given[k] >= 0 || hinted[k]) return;
            flagged = -1;
            if (pick >= 0) { g[k] = pick; pick = -1; }
            else if (g[k] >= 0) g[k] = -1;
            else { tip.textContent = '先點下面的一個圖形'; return; }
            paint();
            if (g.every(function (p) { return p >= 0; }) && !violations(g, n, diag).length) win();
        }
        function useHint() {
            if (solved || dead || hintsLeft <= 0) return;
            var r = solve(g, n, null, NODE_LIMIT, diag), k;
            if (r.sol) {
                for (k = 0; k < N; k++) if (g[k] < 0) break;
                if (k >= N) return;
                hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
                g[k] = r.sol[k]; hinted[k] = true; pick = -1;
                paint(); tip.textContent = '黃框的這一格替你放好了';
                if (g.every(function (p) { return p >= 0; }) && !violations(g, n, diag).length) win();
                return;
            }
            /* 目前的擺法擺不完：用「先放好的＋提示放的」找一種擺法，標出跟它不一樣的那一格 */
            var base = g.map(function (p, q) { return pz.given[q] >= 0 || hinted[q] ? p : -1; });
            var r2 = solve(base, n, null, NODE_LIMIT, diag), target = r2.sol || pz.sol;
            for (k = 0; k < N; k++) if (g[k] >= 0 && pz.given[k] < 0 && !hinted[k] && g[k] !== target[k]) break;
            if (k >= N) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            flagged = k; paint();
            tip.textContent = '照現在這樣擺不完了，閃動的這一格先拿起來';
        }
        function reset() {
            if (solved || dead) return;
            g = pz.given.map(function (p, q) { return hinted[q] ? g[q] : p; });
            pick = -1; flagged = -1; paint();
        }
        /* 時間到：把正確答案擺上去（黃框），結算 */
        function timeUp() {
            if (solved || dead) return;
            dead = true; pick = -1; flagged = -1;
            for (var k = 0; k < N; k++) if (pz.given[k] < 0 && g[k] !== pz.sol[k]) { g[k] = pz.sol[k]; hinted[k] = true; }
            paint();
            tip.textContent = '時間到了！黃框的是正確答案';
            tip.className = 'shapegrid-tip';
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: ['時間到了'] });
        }
        function win() {
            api.stopTimer();
            solved = true; pick = -1; paint();
            tip.textContent = '全部擺好了，沒有相鄰的！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }
        api.solve = function () { g = pz.sol.slice(); paint(); win(); };
        api.wrong = function () {           /* 驗證用：放一個跟鄰居衝突的 */
            for (var k = 0; k < N; k++) if (pz.given[k] < 0) {
                var nb = neighbors(k, n, diag).filter(function (q) { return g[q] >= 0; })[0];
                if (nb == null) continue;
                var used = {}; g.forEach(function (p) { if (p >= 0) used[p] = true; });
                for (var p = 0; p < N; p++) if (!used[p] && !canTouch(p, g[nb], n)) { g[k] = p; paint(); return; }
            }
        };
        api.state = function () { return { g: g.slice(), pick: pick, solved: solved, hintsLeft: hintsLeft, dead: dead }; };
        api.timeout = timeUp;
        api.timer(Math.round(timeFor(level, pz.given.filter(function (v) { return v < 0; }).length) * 1000), timeUp);
        paint();
    }

    var G = {
        id: ID,
        name: '形色不相鄰',
        rule: '九宮格（之後是 16 格、25 格）。下面有一盒圖形，**每種形狀配每種顏色剛好一個**。把全部的圖形擺進格子：**形狀一樣或顏色一樣的兩個，不可以左右相鄰，也不可以上下相鄰**，後面的關卡**連斜角也不能相鄰**，隨手亂擺會卡死，要推理。**每一題的答案只有一種**，先放好的圖形（粗黑框）不能動。點下面的圖形，再點格子放進去；點自己放的圖形可以拿回來，違規的兩格會變紅。每一關有時間限制（上面的時間條，空格越多給的時間越長），時間到了也算失敗；全部擺完而且沒有違規就過關，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, timeFor: timeFor, TIME_BASE: TIME_BASE, TIME_CELL: TIME_CELL, shapeOf: shapeOf, colorOf: colorOf, canTouch: canTouch, neighbors: neighbors, violations: violations, solve: solve, search: search, countSolutions: countSolutions, isUnique: isUnique,
            makePuzzle: makePuzzle, whyText: whyText, rating: rating, STAGES: STAGES, HINTS: HINTS, NODE_LIMIT: NODE_LIMIT, MAX_LEVEL: MAX_LEVEL, SHAPES: SHAPES, COLORS: COLORS
        }
    };
    Reaction.register(G);
})();
