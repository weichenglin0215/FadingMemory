/* ═══════════════════════════════════════════════════════════════════
   reaction_nim.js — 秒反應・取火柴（深思篇 474「取火柴」Nim；復活 #137「搶二十一」）
   樣式：css/games/reaction_nim.css（class 一律以「nim-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：桌上有幾堆火柴（一排一堆）。你和電腦輪流，每回合**只能從同一堆拿走任意根（至少 1 根）**，**拿走最後一根的人贏**
     （後面幾關改成拿最後一根的人輸）。你先手。點一根火柴＝選取它和它右邊所有的火柴，再按「拿走」。
   · **每一關的開局都是「先手必勝」**，電腦每一步都走得很準；只要你走錯一步（讓電腦有辦法一路保持必勝），這一關就結束，並告訴你錯在哪。
     電腦只會在「自己已經輸定了」的局面下亂走，所以只要你每一步都走對，一定贏。
   · 關卡：第 1～4 關 單堆、一次最多拿 3 根（搶 21）→ 第 5～10 關 兩堆 → 第 11～20 關 三堆（經典 3-5-7 那一類）→
     第 21～25 關 四堆 → 第 26～30 關 四堆而且「拿最後一根的人輸」。堆數與根數線性增加。
   · 頓悟：Nim 和——把各堆根數寫成二進位，「每一位數的 1 的個數都是偶數」的局面（XOR＝0）對下一個拿的人是輸的。
     每一步把局面拿成這樣就贏。失敗時畫面上會列出每一堆的二進位和 XOR。
   · 實作：不寫死公式，而是對「局面」做記憶化的完整搜尋（isWinning）：單堆限拿、普通規則、拿最後一根輸的規則都用同一個函式判斷。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'nim';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* to＝這個階段的最後一關；piles＝幾堆；maxTake＝一次最多拿幾根（0＝不限）；misere＝拿最後一根的人輸；size＝每堆最多幾根：階段第 1 關 → 最後一關 */
        { to: 4, piles: 1, maxTake: 3, misere: false, size: [9, 21] },
        { to: 10, piles: 2, maxTake: 0, misere: false, size: [3, 8] },
        { to: 20, piles: 3, maxTake: 0, misere: false, size: [3, 7] },
        { to: 25, piles: 4, maxTake: 0, misere: false, size: [3, 8] },
        { to: 30, piles: 4, maxTake: 0, misere: true, size: [3, 8] }
    ];
    var COMPUTER_THINK_MS = 800;                /* 電腦「思考」多久才出手 */
    var COMPUTER_SHOW_MS = 700;                 /* 電腦選好要拿的火柴之後，停多久才真的拿走 */
    var PASS_DELAY_MS = 1400;                       /* 答對（過關）後停多久才換下一關（毫秒，1400 毫秒＝1.4 秒） */
    var FAIL_HOLD_MS = 6000;                    /* 失敗時顯示 XOR 說明的時間 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var MATCH_MAX_W = 26;                       /* 火柴棒最寬幾 px */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: Math.min(level, STAGES[i].to) - from + 1, len: STAGES[i].to - from + 1 };
            from = STAGES[i].to + 1;
        }
    }
    /* 局面（各堆根數）的記憶化搜尋：輪到的人是否「有辦法贏」？
       普通規則：沒有火柴可拿＝輪到的人輸（上一個人拿走最後一根）；拿最後一根輸的規則：沒有火柴可拿＝輪到的人贏。 */
    var memo = {};
    function key(piles, maxTake, misere) { return (misere ? 'm' : 'n') + maxTake + ':' + piles.filter(function (p) { return p > 0; }).sort(function (a, b) { return a - b; }).join(','); }
    function isWinning(piles, maxTake, misere) {
        var k = key(piles, maxTake, misere);
        if (k in memo) return memo[k];
        var total = 0; piles.forEach(function (p) { total += p; });
        if (total === 0) return (memo[k] = !!misere);
        var res = false;
        for (var i = 0; i < piles.length && !res; i++) {
            var lim = maxTake ? Math.min(piles[i], maxTake) : piles[i];
            for (var t = 1; t <= lim; t++) {
                var next = piles.slice(); next[i] -= t;
                if (!isWinning(next, maxTake, misere)) { res = true; break; }
            }
        }
        return (memo[k] = res);
    }
    /* 所有走法 [{ pile, take }]；winningMoves：走完之後對方（下一個輪到的人）輸定了的走法 */
    function movesOf(piles, maxTake) {
        var out = [];
        piles.forEach(function (p, i) { var lim = maxTake ? Math.min(p, maxTake) : p; for (var t = 1; t <= lim; t++) out.push({ pile: i, take: t }); });
        return out;
    }
    function applyMove(piles, mv) { var n = piles.slice(); n[mv.pile] -= mv.take; return n; }
    function winningMoves(piles, maxTake, misere) { return movesOf(piles, maxTake).filter(function (mv) { return !isWinning(applyMove(piles, mv), maxTake, misere); }); }
    function xorOf(piles) { var x = 0; piles.forEach(function (p) { x ^= p; }); return x; }
    function toBin(n, w) { var s = n.toString(2); while (s.length < w) s = '0' + s; return s; }
    function total(piles) { return piles.reduce(function (a, b) { return a + b; }, 0); }

    /* 出一關：{ piles, maxTake, misere, level }——一定是「輪到你而且你有必勝走法」的局面 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var s = stageOf(level), st = s.st, hi = Math.round(kit.ramp(s.idx, st.size[0], st.size[1], Math.max(2, s.len)));
        for (var tr = 0; tr < 500; tr++) {
            var piles = [], i;
            if (st.piles === 1) piles.push(kit.randInt(Math.max(5, hi - 3), hi, rand));
            else for (i = 0; i < st.piles; i++) piles.push(kit.randInt(1, hi, rand));
            if (total(piles) < 4) continue;
            if (st.piles > 1 && piles.every(function (p) { return p === piles[0]; })) continue;     /* 全部一樣大太好猜 */
            if (isWinning(piles, st.maxTake, st.misere)) return { piles: piles, maxTake: st.maxTake, misere: st.misere, level: level };
        }
        return { piles: st.piles === 1 ? [hi - (hi % 4 === 0 ? 1 : 0)] : [1, 2, 3, 4].slice(0, st.piles).map(function (x) { return Math.min(x + 1, hi); }), maxTake: st.maxTake, misere: st.misere, level: level };
    }
    /* 電腦出手：贏得了就走必勝的那一步；輸定了就隨機走（不挑最大或最小，免得有規律） */
    function computerMove(piles, maxTake, misere, rand) {
        rand = rand || Math.random;
        var win = winningMoves(piles, maxTake, misere);
        if (win.length) return kit.pick(win, rand);
        return kit.pick(movesOf(piles, maxTake), rand);
    }
    function rating(n) {
        if (n >= 25) return '取火柴高手！';
        if (n >= 12) return '你掌握二進位了！';
        if (n >= 5) return '越來越有感覺了！';
        return '想一想：把每堆根數寫成二進位，讓每一位的 1 都成雙！';
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
        var pz = makePuzzle(level, api.rand), maxTake = pz.maxTake, misere = pz.misere;
        api.info = pz;
        console.log('[取火柴] 第 ' + level + ' 關：' + pz.piles.join('、') + (maxTake ? '（限拿 ' + maxTake + '）' : '') + (misere ? '，拿最後一根輸' : ''));
        var piles = pz.piles.slice(), sel = null, busy = false, over = false;     /* sel：{ pile, count }（從該堆右邊算起要拿幾根） */
        var maxPile = Math.max.apply(null, pz.piles);
        var W = stage.clientWidth || 472;
        var mw = Math.min(MATCH_MAX_W, Math.floor((W - 110) / maxPile));

        var wrap = h('div', { 'class': 'nim-wrap' });
        var banner = h('div', { 'class': 'nim-banner', text: misere ? '拿到最後一根的人【輸】' : '拿到最後一根的人【贏】' });
        var note = h('div', { 'class': 'nim-note', text: maxTake ? '每回合最多拿 ' + maxTake + ' 根（一堆）' : '每回合從「同一堆」拿走任意根' });
        var rows = h('div', { 'class': 'nim-rows' });
        var turn = h('div', { 'class': 'nim-turn', text: '輪到你：點一根火柴，選它和它右邊的' });
        var reveal = h('div', { 'class': 'nim-reveal' });
        var btns = h('div', { 'class': 'nim-btns' });
        var btnTake = h('button', { 'class': 'btn btn--primary nim-btn', type: 'button', text: '拿走' });
        var btnClear = h('button', { 'class': 'btn btn--line nim-btn', type: 'button', text: '取消選取' });
        kit.onTap(btnTake, take);
        kit.onTap(btnClear, function () { if (!busy) { sel = null; paint(); } });
        btns.appendChild(btnClear); btns.appendChild(btnTake);
        wrap.appendChild(banner); wrap.appendChild(note); wrap.appendChild(rows); wrap.appendChild(turn); wrap.appendChild(reveal); wrap.appendChild(btns);
        stage.appendChild(wrap);
        if (level === 11 && kit.once('nim.binary')) turn.textContent = '想一想二進位：每堆根數寫成二進位，讓每一位的 1 成雙';

        var rowEls = [], matchEls = [], origin = pz.piles.slice();
        piles.forEach(function (n, pi) {
            var row = h('div', { 'class': 'nim-row' });
            row.appendChild(h('div', { 'class': 'nim-label', text: piles.length > 1 ? String(pi + 1) : '' }));
            var ms = [];
            for (var k = 0; k < n; k++) {
                var m = h('div', { 'class': 'nim-match' }, [h('i', { 'class': 'nim-head' })]);
                m.style.width = mw + 'px';
                (function (p, kk) { kit.onTap(m, function () { choose(p, kk); }); })(pi, k);
                row.appendChild(m); ms.push(m);
            }
            rows.appendChild(row); rowEls.push(row); matchEls.push(ms);
        });

        /* 這一堆還剩幾根：火柴 0..piles[p]-1 還在桌上，之後的已被拿走 */
        function choose(p, k) {
            if (busy || over) return;
            var cnt = piles[p] - k;
            if (k >= piles[p]) return;
            if (maxTake && cnt > maxTake) cnt = maxTake;
            if (sel && sel.pile === p && sel.count === cnt) sel = null; else sel = { pile: p, count: cnt };
            paint();
        }
        function paint() {
            piles.forEach(function (n, p) {
                matchEls[p].forEach(function (m, k) {
                    var cls = 'nim-match';
                    if (k >= n) cls += ' nim-match--gone';
                    else if (sel && sel.pile === p && k >= n - sel.count) cls += ' nim-match--sel';
                    m.className = cls;
                });
            });
            btnTake.textContent = sel ? '拿走 ' + sel.count + ' 根' : '拿走';
            btnTake.disabled = !sel || busy;
            btnClear.disabled = !sel || busy;
        }
        function take() {
            if (!sel || busy || over) return;
            var mv = { pile: sel.pile, take: sel.count }, before = piles.slice();
            piles = applyMove(piles, mv); sel = null; paint();
            var left = total(piles);
            if (left === 0) {
                over = true;
                if (!misere) { turn.textContent = '你拿走了最後一根，你贏了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); }
                else failWith(before, mv, '你拿走了最後一根——這一關拿最後一根的人輸');
                return;
            }
            if (isWinning(piles, maxTake, misere)) { failWith(before, mv, null); return; }       /* 你走錯了：電腦有辦法一路保持必勝 */
            busy = true; paint(); turn.textContent = '電腦思考中…';
            api.after(COMPUTER_THINK_MS, computerTurn);
        }
        function computerTurn() {
            var mv = computerMove(piles, maxTake, misere, api.rand);
            var els = matchEls[mv.pile].slice(piles[mv.pile] - mv.take, piles[mv.pile]);
            els.forEach(function (m) { m.classList.add('nim-match--cpu'); });
            turn.textContent = '電腦從第 ' + (mv.pile + 1) + ' 堆拿 ' + mv.take + ' 根';
            api.after(COMPUTER_SHOW_MS, function () {
                piles = applyMove(piles, mv);
                els.forEach(function (m) { m.classList.remove('nim-match--cpu'); });
                busy = false; paint();
                if (total(piles) === 0) {          /* 電腦拿走最後一根：只會發生在「拿最後一根輸」的規則（它輸定了） */
                    over = true; turn.textContent = '電腦拿走了最後一根，你贏了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return;
                }
                turn.textContent = '輪到你：點一根火柴，選它和它右邊的';
            });
        }
        /* 失敗：顯示你走錯的那一步，以及（普通規則、不限拿幾根時）每一堆的二進位與 XOR */
        function failWith(before, mv, special) {
            over = true; busy = true; btns.style.display = 'none'; paint();          /* 結束了：拿掉按鈕，讓下面的說明有位置 */
            var good = winningMoves(before, maxTake, misere), lines = [];
            var after = applyMove(before, mv);
            var text = special ? special + '。' : '你拿完之後，電腦能一路保持必勝。';
            if (good.length) text += '比較好的走法：第 ' + (good[0].pile + 1) + ' 堆拿 ' + good[0].take + ' 根。';
            turn.textContent = text;
            lines.push(text);
            if (!maxTake && !misere) {
                var w = Math.max(3, Math.max.apply(null, before).toString(2).length), x = xorOf(after);
                reveal.innerHTML = '';
                reveal.appendChild(h('div', { 'class': 'nim-reveal__title', text: '拿完後的各堆（二進位）' }));
                after.forEach(function (n, i) { reveal.appendChild(h('div', { 'class': 'nim-reveal__row', text: '第 ' + (i + 1) + ' 堆　' + n + ' 根　' + toBin(n, w) })); });
                reveal.appendChild(h('div', { 'class': 'nim-reveal__row nim-reveal__row--xor', text: 'XOR　' + toBin(x, w) + (x === 0 ? '' : '（不是 0）') }));
                lines.push('你拿完後 XOR＝' + x + (x === 0 ? '' : '，不是 0'));
            }
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: lines });
        }
        api.solve = function () {                  /* 驗證用：走一步必勝的路，直到贏 */
            if (over || busy) return;
            var good = winningMoves(piles, maxTake, misere);
            if (!good.length) return;
            var mv = good[0]; sel = { pile: mv.pile, count: mv.take }; take();
        };
        api.wrong = function () {                  /* 驗證用：走一步會讓電腦保持必勝的路 */
            if (over || busy) return;
            var bad = movesOf(piles, maxTake).filter(function (mv) { return isWinning(applyMove(piles, mv), maxTake, misere); });
            var mv = bad.length ? bad[0] : movesOf(piles, maxTake)[0]; sel = { pile: mv.pile, count: mv.take }; take();
        };
        api.state = function () { return { piles: piles.slice(), busy: busy, over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '取火柴',
        rule: '桌上有幾堆火柴（一排一堆）。**你和電腦輪流，每回合只能從「同一堆」拿走任意根（至少 1 根）；拿走最後一根的人贏**（後面幾關相反：拿走最後一根的人輸）。你先手，點一根火柴會選取它和它右邊所有的火柴，再按「拿走」。**每一關你都有必勝的走法**，電腦每一步都會抓住你的失誤；只要你有一步走錯，這一關就結束，並告訴你錯在哪。提示：把每堆的根數寫成二進位看看。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, isWinning: isWinning, movesOf: movesOf, applyMove: applyMove, winningMoves: winningMoves, xorOf: xorOf, makePuzzle: makePuzzle,
            computerMove: computerMove, rating: rating, STAGES: STAGES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
