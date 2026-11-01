/* ═══════════════════════════════════════════════════════════════════
   reaction_fifteen.js — 秒反應・搶十五（深思篇 475「搶十五」）
   樣式：css/games/reaction_fifteen.css（class 一律以「fifteen-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：桌上有 1～9 九張牌，**有幾張已經被你和電腦拿走了**。輪到你：兩人輪流各拿一張，**先湊到三張加起來剛好 15 的人贏**。
     點一張牌、按「拿這張」。你拿過的牌在左邊，電腦拿過的在右邊。**每一關都是你有必勝法的局面**，電腦每一步都用最好的防守；
     你只要有一步走錯（不再有必勝法），這一關就結束，並告訴你比較好的一步。
   · 頓悟：它和井字遊戲是**同一個遊戲**——把 1～9 放進 3×3 洛書方陣（8 1 6／3 5 7／4 9 2），任意三張和為 15 就是井字三連線。
     井字遊戲從空盤開始是和局，所以每一關都是「已經拿走幾張牌的必勝局面」；結束時畫面會把你們拿的牌放進洛書方陣，顯示成井字連線。
   · 關卡（必勝需要幾步，實測這個遊戲最長只有 3 步）：第 1～5 關 一步就贏 → 第 6～12 關 兩步 → 第 13～20 關 三步（預先拿走的牌越來越少）→
     第 21～25 關 改成「四張加起來剛好 20」（1～9）→ 第 26～30 關 改成「三張加起來剛好 17」（1～11）。
   · 實作：不寫死策略，對「兩邊各拿了哪幾張」的局面做記憶化的完整搜尋（val）：回傳先手必勝／和局／必輸，以及要幾步（含手順）。
     出題從「雙方輪流拿牌、還沒有人贏」的所有可能局面裡，挑出輪到你而且必勝步數剛好是這一關要的。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fifteen';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var VARIANTS = {
        luoshu: { N: 9, K: 3, T: 15, text: '三張牌加起來剛好 15', short: '三張加起來＝15' },
        four20: { N: 9, K: 4, T: 20, text: '四張牌加起來剛好 20', short: '四張加起來＝20' },
        eleven17: { N: 11, K: 3, T: 17, text: '三張牌加起來剛好 17（牌有 1～11）', short: '三張加起來＝17（牌 1～11）' }
    };
    var STAGES = [                              /* to＝這個階段的最後一關；v＝玩法；d＝你要幾步才能贏（必勝步數，你自己走的步數） */
        { to: 5, v: 'luoshu', d: 1 }, { to: 12, v: 'luoshu', d: 2 }, { to: 20, v: 'luoshu', d: 3 },
        { to: 25, v: 'four20', d: 3 }, { to: 30, v: 'eleven17', d: 3 }
    ];
    var STAGE_LAST_D = { four20: [2, 4], eleven17: [3, 5] };     /* 後面兩個玩法：第 1 關 → 最後一關 要的必勝步數（找不到就退一步） */
    var COMPUTER_THINK_MS = 800;
    var COMPUTER_SHOW_MS = 600;
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 6500;
    var MAX_LEVEL = 90;
    var LUOSHU = [8, 1, 6, 3, 5, 7, 4, 9, 2];   /* 洛書方陣：任一橫排、直行、對角線的三個數加起來都是 15 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    var cache = {};
    function prep(vk) {
        if (cache[vk]) return cache[vk];
        var V = VARIANTS[vk], cards = [], i;
        for (i = 1; i <= V.N; i++) cards.push(i);
        var wins = [];
        (function comb(s, acc) {
            if (acc.length === V.K) { if (acc.reduce(function (a, b) { return a + b; }, 0) === V.T) wins.push(acc.reduce(function (m, c) { return m | (1 << c); }, 0)); return; }
            for (var k = s; k < cards.length; k++) comb(k + 1, acc.concat(cards[k]));
        })(0, []);
        return (cache[vk] = { V: V, cards: cards, wins: wins, memo: {}, positions: null });
    }
    function hasWin(P, mask) { for (var i = 0; i < P.wins.length; i++) if ((mask & P.wins[i]) === P.wins[i]) return true; return false; }
    function winSetOf(P, mask) { for (var i = 0; i < P.wins.length; i++) if ((mask & P.wins[i]) === P.wins[i]) return P.wins[i]; return 0; }
    function maskToCards(m) { var o = []; for (var c = 1; c <= 15; c++) if (m & (1 << c)) o.push(c); return o; }
    /* val(A, B)：A（輪到的人）和 B（對方）各拿了哪些牌（位元遮罩）→ { r: 1 贏／0 和／-1 輸, d: 還要幾「手」（含雙方）} */
    function val(P, A, B) {
        var key = A * 4096 + B;
        if (key in P.memo) return P.memo[key];
        var bestWin = null, anyDraw = false, worst = null, free = 0;
        for (var i = 0; i < P.cards.length; i++) {
            var bit = 1 << P.cards[i];
            if ((A | B) & bit) continue;
            free++;
            if (hasWin(P, A | bit)) { bestWin = 1; continue; }
            var v = val(P, B, A | bit);
            if (v.r === -1) { var d = v.d + 1; bestWin = bestWin === null ? d : Math.min(bestWin, d); }
            else if (v.r === 0) anyDraw = true;
            else { var d2 = v.d + 1; worst = worst === null ? d2 : Math.max(worst, d2); }
        }
        var res;
        if (bestWin !== null) res = { r: 1, d: bestWin };
        else if (!free || anyDraw) res = { r: 0, d: 0 };
        else res = { r: -1, d: worst };
        return (P.memo[key] = res);
    }
    /* 所有「雙方輪流拿牌、還沒有人贏」的局面，其中輪到的人必勝的，依必勝步數（輪到的人自己要走幾步）分類 → positions[步數] = [{A, B, n（已拿幾張）}] */
    function positionsOf(vk) {
        var P = prep(vk);
        if (P.positions) return P.positions;
        var seen = {}, out = {};
        (function walk(A, B, n) {
            var key = A * 4096 + B;
            if (seen[key]) return; seen[key] = true;
            var v = val(P, A, B);
            if (v.r === 1) { var my = Math.ceil(v.d / 2); (out[my] = out[my] || []).push({ A: A, B: B, n: n }); }
            for (var i = 0; i < P.cards.length; i++) {
                var bit = 1 << P.cards[i];
                if ((A | B) & bit || hasWin(P, A | bit)) continue;
                walk(B, A | bit, n + 1);
            }
        })(0, 0, 0);
        return (P.positions = out);
    }
    function specOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) {
                var st = STAGES[i], d = st.d;
                if (STAGE_LAST_D[st.v]) { var r = STAGE_LAST_D[st.v]; d = Math.round(kit.ramp(Math.min(level, st.to) - from + 1, r[0], r[1], st.to - from + 1)); }
                return { v: st.v, d: d };
            }
            from = STAGES[i].to + 1;
        }
    }
    /* 出一關：{ v, A（你的牌）, B（電腦的牌）, n, d }；找不到剛好這個步數的局面就退一步 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var sp = specOf(level), pos = positionsOf(sp.v), d = sp.d;
        while (d > 1 && !(pos[d] && pos[d].length)) d--;
        var pick = kit.pick(pos[d], rand);
        return { v: sp.v, A: pick.A, B: pick.B, n: pick.n, d: d, level: level };
    }
    /* 你拿牌 c 之後的判定：{ win（你贏了）, keep（你還有必勝法）, reply（電腦的最佳防守，沒有就 0）} */
    function afterPlayer(vk, A, B, c) {
        var P = prep(vk), A2 = A | (1 << c);
        if (hasWin(P, A2)) return { win: true, keep: true, reply: 0, A2: A2 };
        var v = val(P, B, A2);                    /* 電腦輪到：電腦輸＝你還有必勝法 */
        if (v.r !== -1) return { win: false, keep: false, reply: 0, A2: A2 };
        return { win: false, keep: true, reply: computerPick(vk, A2, B), A2: A2 };
    }
    /* 電腦出手（在輸定的局面）：挑讓你「最久才贏」的那一張；同樣久就隨機 */
    function computerPick(vk, A, B, rand) {
        rand = rand || Math.random;
        var P = prep(vk), best = -1, pool = [];
        P.cards.forEach(function (c) {
            var bit = 1 << c; if ((A | B) & bit) return;
            var v = val(P, A, B | bit);          /* 輪到你 */
            var d = v.r === 1 ? v.d : (v.r === 0 ? 99 : 100);
            if (d > best) { best = d; pool = [c]; } else if (d === best) pool.push(c);
        });
        return kit.pick(pool, rand);
    }
    /* 你有哪幾張牌是好的走法（拿了之後仍然必勝） */
    function goodMoves(vk, A, B) {
        var P = prep(vk), out = [];
        P.cards.forEach(function (c) { var bit = 1 << c; if ((A | B) & bit) return; var r = afterPlayer(vk, A, B, c); if (r.keep) out.push(c); });
        return out;
    }
    function rating(n) {
        if (n >= 25) return '搶十五高手！';
        if (n >= 12) return '你看穿洛書了！';
        if (n >= 5) return '越來越有感覺了！';
        return '想一想：1～9 擺成 3×3，三張和是 15 就是三連線！';
    }

    /* ═══ 畫面 ═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), vk = pz.v, P = prep(vk), V = P.V;
        api.info = pz;
        console.log('[搶十五] 第 ' + level + ' 關：' + V.text + '；你 ' + maskToCards(pz.A).join(',') + '／電腦 ' + maskToCards(pz.B).join(',') + '；必勝 ' + pz.d + ' 步');
        var A = pz.A, B = pz.B, sel = 0, busy = false, over = false;

        var wrap = h('div', { 'class': 'fifteen-wrap' });
        var goal = h('div', { 'class': 'fifteen-goal' }, [h('div', { 'class': 'fifteen-goal__main', text: V.short }), h('div', { 'class': 'fifteen-goal__sub', text: '先湊到的人贏' })]);
        var cols = h('div', { 'class': 'fifteen-cols' });
        var mineBox = h('div', { 'class': 'fifteen-hand fifteen-hand--mine' }), theirBox = h('div', { 'class': 'fifteen-hand fifteen-hand--cpu' });
        var table = h('div', { 'class': 'fifteen-table' + (V.N > 9 ? ' fifteen-table--wide' : '') });
        var reveal = h('div', { 'class': 'fifteen-reveal' });                         /* 結束時放洛書方陣的地方 */
        var mid = h('div', { 'class': 'fifteen-mid' }, [table, reveal]);
        cols.appendChild(mineBox); cols.appendChild(mid); cols.appendChild(theirBox);
        var turn = h('div', { 'class': 'fifteen-turn', text: '輪到你：點一張牌' });
        var btns = h('div', { 'class': 'fifteen-btns' });
        var btnTake = h('button', { 'class': 'btn btn--primary fifteen-btn', type: 'button', text: '拿這張' });
        kit.onTap(btnTake, take);
        btns.appendChild(btnTake);
        wrap.appendChild(goal); wrap.appendChild(cols); wrap.appendChild(turn); wrap.appendChild(btns);
        stage.appendChild(wrap);

        var tiles = {};
        P.cards.forEach(function (c) {
            var t = h('div', { 'class': 'fifteen-card', text: String(c) });
            kit.onTap(t, function () { choose(c); });
            tiles[c] = t; table.appendChild(t);
        });
        function paint() {
            P.cards.forEach(function (c) {
                var bit = 1 << c, taken = (A | B) & bit;
                tiles[c].className = 'fifteen-card' + (taken ? ' fifteen-card--taken' : '') + (sel === c ? ' fifteen-card--sel' : '');
            });
            mineBox.innerHTML = ''; theirBox.innerHTML = '';
            mineBox.appendChild(h('div', { 'class': 'fifteen-hand__title', text: '你的牌' }));
            theirBox.appendChild(h('div', { 'class': 'fifteen-hand__title', text: '電腦的牌' }));
            maskToCards(A).forEach(function (c) { mineBox.appendChild(h('div', { 'class': 'fifteen-chip fifteen-chip--mine', text: String(c) })); });
            maskToCards(B).forEach(function (c) { theirBox.appendChild(h('div', { 'class': 'fifteen-chip fifteen-chip--cpu', text: String(c) })); });
            btnTake.textContent = sel ? '拿 ' + sel : '拿這張';
            btnTake.disabled = !sel || busy || over;
        }
        function choose(c) {
            if (busy || over || ((A | B) & (1 << c))) return;
            sel = sel === c ? 0 : c; paint();
        }
        function take() {
            if (!sel || busy || over) return;
            var c = sel, r = afterPlayer(vk, A, B, c), before = { A: A, B: B };
            A = r.A2; sel = 0; paint();
            if (r.win) { over = true; btns.style.display = 'none'; turn.textContent = '你湊成了！'; showBoard(winSetOf(P, A), true); kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }
            if (!r.keep) { fail(before, c); return; }
            busy = true; paint(); turn.textContent = '電腦思考中…';
            api.after(COMPUTER_THINK_MS, function () {
                var cc = computerPick(vk, A, B, api.rand);
                tiles[cc].classList.add('fifteen-card--cpu');
                turn.textContent = '電腦拿了 ' + cc;
                api.after(COMPUTER_SHOW_MS, function () { B |= (1 << cc); busy = false; paint(); turn.textContent = '輪到你：點一張牌'; });
            });
        }
        function fail(before, c) {
            over = true; busy = true; btns.style.display = 'none'; paint();
            var good = goodMoves(vk, before.A, before.B);
            var text = '拿 ' + c + ' 之後就沒有必勝法了。' + (good.length ? '比較好的是拿 ' + good.join('、') + '。' : '');
            turn.textContent = text;
            showBoard(0, false);
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: [text] });
        }
        /* 揭曉：玩法是洛書的話，把兩邊拿的牌放進洛書方陣，變成井字遊戲 */
        function showBoard(winMask, won) {
            reveal.innerHTML = '';
            if (vk !== 'luoshu') { if (winMask) reveal.appendChild(h('div', { 'class': 'fifteen-reveal__line', text: '湊成的牌：' + maskToCards(winMask).join(' + ') + ' = ' + V.T })); return; }
            table.style.display = 'none';                  /* 洛書方陣取代桌上的牌，放在同一個位置 */
            var g = h('div', { 'class': 'fifteen-luoshu' });
            LUOSHU.forEach(function (c) {
                var bit = 1 << c, cls = 'fifteen-luoshu__cell' + (winMask & bit ? ' fifteen-luoshu__cell--win' : ''), mark = '';
                if (A & bit) mark = '○'; else if (B & bit) mark = '×';
                g.appendChild(h('div', { 'class': cls }, [h('span', { 'class': 'fifteen-luoshu__n', text: String(c) }), h('span', { 'class': 'fifteen-luoshu__m', text: mark })]));
            });
            reveal.appendChild(g);
            reveal.appendChild(h('div', { 'class': 'fifteen-reveal__line', text: '洛書方陣＝井字遊戲（○你 ×電腦）' }));
        }
        api.solve = function () {                  /* 驗證用：走必勝的一張 */
            if (over || busy) return;
            var g = goodMoves(vk, A, B); if (!g.length) return; sel = g[0]; take();
        };
        api.wrong = function () {                  /* 驗證用：走一張會失去必勝的牌 */
            if (over || busy) return;
            var good = goodMoves(vk, A, B), bad = P.cards.filter(function (c) { return !((A | B) & (1 << c)) && good.indexOf(c) < 0; });
            sel = bad.length ? bad[0] : good[0]; take();
        };
        api.state = function () { return { A: A, B: B, busy: busy, over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '搶十五',
        rule: '桌上有 1～9 九張牌，**有幾張已經被你和電腦拿走了**。輪到你：**兩人輪流各拿一張，先湊到三張加起來剛好 15 的人贏**。點一張牌，再按「拿這張」。**每一關你都有必勝的走法**，電腦每一步都用最好的防守；只要有一步走錯，這一關就結束，並告訴你比較好的一步。後面幾關規則會變（四張加起來 20、牌多到 11）。提示：把 1～9 擺進 3×3 的格子，想想三張和是 15 像不像「三連線」。',
        mount: mount,
        score: SCORE,
        test: {
            VARIANTS: VARIANTS, STAGES: STAGES, prep: prep, hasWin: hasWin, val: val, positionsOf: positionsOf, specOf: specOf, makePuzzle: makePuzzle,
            afterPlayer: afterPlayer, computerPick: computerPick, goodMoves: goodMoves, maskToCards: maskToCards, rating: rating, LUOSHU: LUOSHU, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
