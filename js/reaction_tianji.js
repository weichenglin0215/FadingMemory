/* ═══════════════════════════════════════════════════════════════════
   reaction_tianji.js — 秒反應・田忌賽馬（深思篇 477「田忌賽馬」）
   樣式：css/games/reaction_tianji.css（class 一律以「tianji-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：對方的 N 匹馬已經排好出場順序（每匹馬有一個戰力數字，一開始就看得到）。你有 N 匹馬，**排出你的出場順序**；
     N 場比賽，每一場戰力高的贏。**你要贏到「這一關最多能贏的場數」**。點一匹馬、再點另一匹馬，兩匹互換位置；排好按「確定出陣」，再逐場揭曉。
   · 頓悟：以下制上——用你最弱的馬去對他最強的（輸掉那一場），用你的強馬去對他的中等馬（贏）。
     「強對強」「照順序對」都不是最好的。第 1 關就是歷史上那一局：對方 9、6、3，你 8、5、2，最多贏 2 場。
   · 關卡：3 匹（第 1～5 關）→ 5 匹（第 6～15 關）→ 7 匹（第 16～25 關）→ 9 匹（第 26 關起）。
     每一關出題都保證：最多能贏的場數 ≥ 1、而且比「強對強」和「照排名一對一」的排法多（所以不能偷懶）；最多也不會是全贏（不然就太簡單）。
   · 判定：贏的場數 ＝ 最多能贏的場數才過關（贏得比較少就結束，並把最好的排法顯示出來）。
     最多能贏幾場用貪心法算（把雙方由弱到強排，我的馬能贏就配給對方目前最弱的），這是標準的最大配對。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'tianji';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [{ n: 3, to: 5 }, { n: 5, to: 15 }, { n: 7, to: 25 }, { n: 9, to: 9999 }];     /* 每一邊幾匹馬：n、這個階段的最後一關 to */
    var STRENGTH_MAX = 99;                      /* 戰力數字的最大值（最小是 1） */
    var GAP_MIN = [6, 1];                       /* 同一邊相鄰兩匹馬至少差多少戰力：第 1 關 → 第 30 關（差得少，越難分）*/
    var RAMP_LEVELS = 30;
    var TRIES = 3000;
    var REVEAL_STEP_MS = 700;                   /* 逐場揭曉，每一場停多久 */
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 6000;
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(level) {
        level = Math.max(1, level);
        for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i].n;
    }
    function gapFor(level) { return Math.round(kit.ramp(level, GAP_MIN[0], GAP_MIN[1], RAMP_LEVELS)); }
    /* 這個排法贏幾場：mine[i] 對 theirs[i]，戰力高者贏（不會平手，因為雙方的數字都不重複） */
    function winsOf(mine, theirs) { var w = 0; for (var i = 0; i < theirs.length; i++) if (mine[i] > theirs[i]) w++; return w; }
    /* 最多能贏幾場，以及一種最好的排法 → { wins, order（order[i] = 對上對方第 i 位的我方戰力）} */
    function bestArrangement(mine, theirs) {
        var n = theirs.length, tIdx = theirs.map(function (_, i) { return i; }).sort(function (a, b) { return theirs[a] - theirs[b]; });
        var mSorted = mine.slice().sort(function (a, b) { return a - b; });
        var order = new Array(n).fill(null), left = [], j = 0;
        mSorted.forEach(function (m) { if (j < n && m > theirs[tIdx[j]]) { order[tIdx[j]] = m; j++; } else left.push(m); });
        for (var i = 0; i < n; i++) if (order[i] === null) order[i] = left.shift();
        return { wins: j, order: order };
    }
    /* 「強對強」：對方由強到弱，我方也由強到弱一對一（照排名配對） */
    function rankMatch(mine, theirs) {
        var n = theirs.length, tIdx = theirs.map(function (_, i) { return i; }).sort(function (a, b) { return theirs[b] - theirs[a]; });
        var mSorted = mine.slice().sort(function (a, b) { return b - a; }), order = new Array(n);
        tIdx.forEach(function (ti, k) { order[ti] = mSorted[k]; });
        return order;
    }
    /* 隨機挑 n 個不重複、彼此至少差 gap 的戰力（由小到大） */
    function pickStrengths(n, gap, rand) {
        for (var tr = 0; tr < 200; tr++) {
            var s = {}, arr = [];
            while (arr.length < n) { var v = kit.randInt(1, STRENGTH_MAX, rand); if (!s[v]) { s[v] = 1; arr.push(v); } }
            arr.sort(function (a, b) { return a - b; });
            var ok = true; for (var i = 1; i < n; i++) if (arr[i] - arr[i - 1] < gap) ok = false;
            if (ok) return arr;
        }
        var base = []; for (var k = 0; k < n; k++) base.push(1 + k * Math.floor((STRENGTH_MAX - 1) / n)); return base;
    }
    /* 出一關：{ n, theirs（對方出場順序）, mine（你的馬，打散的順序）, best（最多贏幾場）, bestOrder }
       第 1 關固定是歷史上那一局（對方 9、6、3，你 8、5、2）。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var n = sizeFor(level);
        if (level === 1) {
            var th = [9, 6, 3], mi = kit.shuffle([8, 5, 2], rand);
            var b0 = bestArrangement(mi, th);
            return { n: 3, theirs: th, mine: mi, best: b0.wins, bestOrder: b0.order, level: level };
        }
        var gap = gapFor(level), fallback = null;
        for (var tr = 0; tr < TRIES; tr++) {
            var t = kit.shuffle(pickStrengths(n, gap, rand), rand), m = pickStrengths(n, gap, rand);
            var b = bestArrangement(m, t), naive = winsOf(rankMatch(m, t), t), same = winsOf(kit.shuffle(m, rand), t);
            var pz = { n: n, theirs: t, mine: kit.shuffle(m, rand), best: b.wins, bestOrder: b.order, level: level };
            if (b.wins >= 1 && b.wins < n && b.wins > naive) return pz;
            if (!fallback && b.wins >= 1 && b.wins < n) fallback = pz;
        }
        return fallback || { n: n, theirs: [9, 6, 3], mine: [8, 5, 2], best: 2, bestOrder: [2, 8, 5], level: level, n3: true };
    }
    function rating(n) {
        if (n >= 25) return '田忌再世！';
        if (n >= 12) return '你很會排兵布陣！';
        if (n >= 5) return '越來越有感覺了！';
        return '想一想：用你最弱的馬去對他最強的，輸一場、贏更多場！';
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
        var pz = makePuzzle(level, api.rand), n = pz.n;
        api.info = pz;
        console.log('[田忌賽馬] 第 ' + level + ' 關：' + n + ' 匹；對方 ' + pz.theirs.join(',') + '；你 ' + pz.mine.join(',') + '；最多贏 ' + pz.best + ' 場');
        var arr = pz.mine.slice(), sel = -1, busy = false, over = false;
        var W = stage.clientWidth || 472;
        var cw = Math.min(88, Math.floor((W * 0.96) / n) - 6);

        var wrap = h('div', { 'class': 'tianji-wrap' });
        var goal = h('div', { 'class': 'tianji-goal', text: '目標：贏 ' + pz.best + ' 場（最多）' });
        var lblT = h('div', { 'class': 'tianji-label', text: '對方出場順序（固定）' });
        var rowT = h('div', { 'class': 'tianji-row' });
        var marks = h('div', { 'class': 'tianji-row tianji-row--marks' });
        var lblM = h('div', { 'class': 'tianji-label', text: '你的出場順序（點兩匹互換）' });
        var rowM = h('div', { 'class': 'tianji-row' });
        var result = h('div', { 'class': 'tianji-result' });
        var btns = h('div', { 'class': 'tianji-btns' });
        var btnGo = h('button', { 'class': 'btn btn--primary tianji-btn', type: 'button', text: '確定出陣' });
        kit.onTap(btnGo, confirm);
        btns.appendChild(btnGo);
        wrap.appendChild(goal); wrap.appendChild(lblT); wrap.appendChild(rowT); wrap.appendChild(marks); wrap.appendChild(lblM); wrap.appendChild(rowM); wrap.appendChild(result); wrap.appendChild(btns);
        stage.appendChild(wrap);

        function horse(v, cls) {
            var c = h('div', { 'class': 'tianji-horse' + (cls ? ' ' + cls : '') }, [h('span', { 'class': 'tianji-horse__icon', text: '🐎' }), h('span', { 'class': 'tianji-horse__n', text: String(v) })]);
            c.style.width = cw + 'px';
            return c;
        }
        var theirEls = pz.theirs.map(function (v) { var e = horse(v, 'tianji-horse--them'); rowT.appendChild(e); return e; });
        var markEls = pz.theirs.map(function (_, i) { var e = h('div', { 'class': 'tianji-mark', text: String(i + 1) }); e.style.width = cw + 'px'; marks.appendChild(e); return e; });
        var mineEls = [];
        function paint() {
            rowM.innerHTML = ''; mineEls = [];
            arr.forEach(function (v, i) {
                var e = horse(v, 'tianji-horse--mine' + (i === sel ? ' tianji-horse--sel' : ''));
                kit.onTap(e, function () { choose(i); });
                rowM.appendChild(e); mineEls.push(e);
            });
            btnGo.disabled = busy || over;
        }
        function choose(i) {
            if (busy || over) return;
            if (sel < 0) sel = i;
            else if (sel === i) sel = -1;
            else { var t = arr[sel]; arr[sel] = arr[i]; arr[i] = t; sel = -1; }
            paint();
        }
        function confirm() {
            if (busy || over) return;
            busy = true; sel = -1; paint();
            var wins = 0, k = 0;
            result.textContent = '逐場比賽…';
            (function step() {
                if (k >= n) { finish(wins); return; }
                var i = k++, win = arr[i] > pz.theirs[i];
                if (win) wins++;
                theirEls[i].classList.add(win ? 'tianji-horse--lose' : 'tianji-horse--win');
                mineEls[i].classList.add(win ? 'tianji-horse--win' : 'tianji-horse--lose');
                markEls[i].textContent = win ? '勝' : '敗';
                markEls[i].classList.add(win ? 'tianji-mark--win' : 'tianji-mark--lose');
                Sfx.play(win ? 'ok' : 'bad');
                result.textContent = '目前贏 ' + wins + ' 場';
                api.after(REVEAL_STEP_MS, step);
            })();
        }
        function finish(wins) {
            over = true; btns.style.display = 'none';
            if (wins >= pz.best) { result.textContent = '贏了 ' + wins + ' 場，達到最多的 ' + pz.best + ' 場！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }
            var text = '你贏了 ' + wins + ' 場，最多可贏 ' + pz.best + ' 場。';
            result.textContent = text;
            /* 揭曉：把最好的排法顯示在你那一排的下面 */
            var lbl = h('div', { 'class': 'tianji-label tianji-label--best', text: '最好的排法（贏 ' + pz.best + ' 場）' });
            var row = h('div', { 'class': 'tianji-row' });
            pz.bestOrder.forEach(function (v, i) { var e = horse(v, 'tianji-horse--best' + (v > pz.theirs[i] ? ' tianji-horse--win' : '')); row.appendChild(e); });
            wrap.insertBefore(lbl, result); wrap.insertBefore(row, result);
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: [text] });
        }
        api.solve = function () { if (over || busy) return; arr = pz.bestOrder.slice(); paint(); confirm(); };
        api.wrong = function () { if (over || busy) return; arr = rankMatch(pz.mine, pz.theirs); if (winsOf(arr, pz.theirs) >= pz.best) arr = pz.theirs.map(function () { return 0; }).map(function (_, i) { return pz.bestOrder[(i + 1) % n]; }); paint(); confirm(); };
        api.state = function () { return { arr: arr.slice(), busy: busy, over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '田忌賽馬',
        rule: '對方的馬已經排好出場順序，每匹馬有一個**戰力數字**（一開始就看得到）。你也有同樣多匹馬，**排出你的出場順序**；每一場戰力高的贏。**你要贏到「這一關最多能贏的場數」**。點一匹馬，再點另一匹馬，兩匹會互換位置；排好按「確定出陣」，會逐場揭曉。贏得比較少，這一關就結束，並把最好的排法給你看。提示：不要「強對強」，想一想歷史上田忌是怎麼贏齊威王的。',
        mount: mount,
        score: SCORE,
        test: {
            STAGES: STAGES, sizeFor: sizeFor, gapFor: gapFor, winsOf: winsOf, bestArrangement: bestArrangement, rankMatch: rankMatch, pickStrengths: pickStrengths,
            makePuzzle: makePuzzle, rating: rating, GAP_MIN: GAP_MIN, RAMP_LEVELS: RAMP_LEVELS, STRENGTH_MAX: STRENGTH_MAX, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
