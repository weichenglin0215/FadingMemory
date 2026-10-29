/* ═══════════════════════════════════════════════════════════════════
   reaction_timepair.js — 秒反應・時間連連看（企劃 406）
   畫面上混著**指針時鐘**和**電子時鐘**（電子鐘是 24 小時制，例如 15:15）。**把顯示同一個時間的指針鐘和電子鐘點成一對**（先點一個、再點一個）。
   指針鐘沒有上下午：下午 3:15 的電子鐘「15:15」要配「3:15」的指針鐘。全部配完就過關；配錯就結束，時間到也結束（限時 30 → 60 秒）。
   ───────────────────────────────────────────────────────────────────
   · 配對的規則（isMatch）：電子鐘的 h24 時 m 分，和指針鐘的 h12 時 m 分是同一個時間 ⇔ m 相同，而且 h24 除以 12 的餘數 ＝ h12 除以 12 的餘數（12 時和 0 時、12 點整是同一個指針位置）。
   · 指針鐘怎麼畫（analogAngles）：分針的角度 ＝ 分 × 6°；時針的角度 ＝ ((時 mod 12) ＋ 分 ÷ 60) × 30°（從 12 點的方向順時針算）。
   · 兩種誘餌（makeLevel）：
       A「指針互換」：一對是 (h:m)、另一對是「時針和分針互換位置」的時間（9:15 ↔ 3:45：9:15 時針在 9、分針在 3；3:45 時針在 3、分針在 9），兩個指針鐘看起來幾乎一樣，要看哪根是長針；
       B「24 小時制」：一對是下午 3:15（電子鐘 15:15）、另一對是 5:15（電子鐘 05:15）——把 15 減 10 就會配錯。
     出題時，這兩種誘餌的組數隨關卡增加（A：0 → 3 組、B：0 → 2 組，每組佔 2 對）；其餘的時間集中在同一段（越後面越近）。分鐘一律是 5 的倍數（指針鐘才讀得出來）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：配對數 3 → 8、誘餌組數增加、時間越來越集中（散布範圍 6 → 2.5 小時）、限時 30 → 60 秒。
   · 揭曉（配錯時）：你配的指針鐘和電子鐘並排放大，寫出兩個各是幾點幾分；正確的搭檔用綠色標出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'timepair';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var PAIRS = [3, 8];                         /* 配對數（時鐘各幾個）：第 1 關 → 到頂（四捨五入） */
    var TRAP_A = [0, 3];                        /* 「指針互換」誘餌的組數（每組 2 對）：第 1 關 → 到頂（無條件捨去） */
    var TRAP_B = [0, 2];                        /* 「24 小時制」誘餌的組數（每組 2 對）：第 1 關 → 到頂（無條件捨去） */
    var SPREAD_H = [6, 2.5];                    /* 其餘時間散布的範圍（小時）：第 1 關 → 到頂（越小越接近） */
    var LIMIT_S = [30, 60];                     /* 限時（秒）：第 1 關 → 到頂 */
    var STEP_MIN = 5;                           /* 分鐘一律是這個數的倍數 */
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function pairsFor(level) { return Math.round(ramp(level, PAIRS)); }
    function trapAFor(level) { return Math.floor(ramp(level, TRAP_A) + 1e-9); }
    function trapBFor(level) { return Math.floor(ramp(level, TRAP_B) + 1e-9); }
    function spreadFor(level) { return Math.round(ramp(level, SPREAD_H) * 100) / 100; }
    function limitFor(level) { return Math.round(ramp(level, LIMIT_S)); }
    /* 24 小時制的「時」→ 12 小時制（12 點整：0 → 12、12 → 12） */
    function h12of(h24) { return h24 % 12 === 0 ? 12 : h24 % 12; }
    function pad2(v) { return (v < 10 ? '0' : '') + v; }
    function digitalText(h24, m) { return pad2(h24) + ':' + pad2(m); }
    function analogText(h12, m) { return h12 + ':' + pad2(m); }
    /* 指針的角度（度，從 12 點方向順時針）：{ hour, minute } */
    function analogAngles(h12, m) { return { hour: ((h12 % 12) + m / 60) * 30, minute: m * 6 }; }
    /* 電子鐘（h24, m）和指針鐘（h12, m2）是不是同一個時間 */
    function isMatch(a, d) { return a.m === d.m && (a.h12 % 12) === (d.h24 % 12); }
    /* 「指針互換」的搭檔：(h:m) 的時針和分針互換——時針指到 m÷5 點、分針指到 h×5 分；時間不是 5 的倍數、或換了還是同一個時間就沒有（回傳 null） */
    function swapPartner(h12, m) {
        if (m % 5 !== 0) return null;
        var nh = m / 5 === 0 ? 12 : m / 5, nm = (h12 % 12) * 5;
        if (nh === h12 && nm === m) return null;
        return { h12: nh, m: nm };
    }
    /* 分鐘數（從 12:00 起算，0～719）：用來比較兩個指針鐘時間有多近 */
    function minutesOf(h12, m) { return (h12 % 12) * 60 + m; }
    /* 出一關：{ level, n, pairs（[{ id, h12, m, h24, trap }]，trap＝'A'｜'B'｜null）, items（打亂順序的所有時鐘：[{ id, kind:'a'｜'d', pair, h12, m, h24 }]）, limit（秒）, trapsA, trapsB, spread } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = pairsFor(level), na = trapAFor(level), nb = trapBFor(level), spread = spreadFor(level), used = {}, times = [], tries = 0;
        function add(h12, m, trap, pm) { var key = h12 + ':' + m; if (used[key]) return false; used[key] = 1; times.push({ h12: h12, m: m, trap: trap, pm: pm }); return true; }
        var base = kit.randInt(0, 143, rand) * 5;                                    /* 這一關的中心時間（分鐘，0～719，5 的倍數） */
        function randTime() { var off = Math.round(kit.randFloat(-spread, spread, rand) * 12) * 5, t = (((base + off) % 720) + 720) % 720; return { h12: Math.floor(t / 60) === 0 ? 12 : Math.floor(t / 60), m: t % 60 }; }
        /* A：指針互換的兩對 */
        for (var i = 0; i < na && times.length + 2 <= n && tries < 2000; tries++) { var t = randTime(), p = swapPartner(t.h12, t.m); if (!p || used[t.h12 + ':' + t.m] || used[p.h12 + ':' + p.m]) continue; add(t.h12, t.m, 'A'); add(p.h12, p.m, 'A'); i++; }
        /* B：24 小時制的兩對（同分鐘、相差 2 小時） */
        for (var j = 0; j < nb && times.length + 2 <= n && tries < 4000; tries++) { var u = randTime(), h2 = u.h12 + 2 > 12 ? u.h12 + 2 - 12 : u.h12 + 2; if (used[u.h12 + ':' + u.m] || used[h2 + ':' + u.m]) continue; add(u.h12, u.m, 'B', true); add(h2, u.m, 'B', false); j++; }          /* 前一個的電子鐘是下午（15:15），後一個是上午（05:15） */
        /* 其餘：集中在 base 附近的隨機時間 */
        while (times.length < n && tries < 8000) { tries++; var r = randTime(); add(r.h12, r.m, null); }
        while (times.length < n) { var rr = { h12: kit.randInt(1, 12, rand), m: kit.randInt(0, 11, rand) * 5 }; add(rr.h12, rr.m, null); }
        /* 電子鐘的小時（24 小時制）：B 誘餌的兩對照上面決定的上午／下午；其餘的隨機上午或下午 */
        var pairs = times.map(function (tm, id) { var pm = tm.trap === 'B' ? tm.pm : rand() < 0.5; return { id: id, h12: tm.h12, m: tm.m, h24: (tm.h12 % 12) + (pm ? 12 : 0), trap: tm.trap }; });
        var items = [];
        pairs.forEach(function (p) { items.push({ kind: 'a', pair: p.id, h12: p.h12, m: p.m, h24: p.h24 }); items.push({ kind: 'd', pair: p.id, h12: p.h12, m: p.m, h24: p.h24 }); });
        items = kit.shuffle(items, rand); items.forEach(function (it, i) { it.id = i; });
        return { level: level, n: n, pairs: pairs, items: items, limit: limitFor(level), trapsA: na, trapsB: nb, spread: spread };
    }
    /* 配對失敗的說明：你選的指針鐘 a 和電子鐘 d */
    function whyText(a, d) {
        return '配錯了！指針鐘是 ' + analogText(a.h12, a.m) + '，電子鐘 ' + digitalText(d.h24, d.m) + ' 對應的指針鐘是 ' + analogText(h12of(d.h24), d.m);
    }
    function rating(n) {
        if (n >= 15) return '時間大師！';
        if (n >= 9) return '看鐘很準！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '電子鐘 15:15 是下午 3:15！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'tpr-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 指針鐘（SVG，viewBox −50～50）：錶面、12 個刻度、數字 12／3／6／9、時針（短粗）、分針（長細） */
    function analogSvg(h12, m, size) {
        var svg = kit.svg('svg', { 'class': 'tpr-analog', viewBox: '-50 -50 100 100', width: size, height: size }), ang = analogAngles(h12, m);
        kit.svg('circle', { 'class': 'tpr-face', cx: 0, cy: 0, r: 47 }, svg);
        for (var k = 0; k < 12; k++) { var a = k * 30 * Math.PI / 180, r1 = k % 3 === 0 ? 36 : 40, r2 = 44; kit.svg('line', { 'class': 'tpr-tick' + (k % 3 === 0 ? ' tpr-tick--big' : ''), x1: (r1 * Math.sin(a)).toFixed(2), y1: (-r1 * Math.cos(a)).toFixed(2), x2: (r2 * Math.sin(a)).toFixed(2), y2: (-r2 * Math.cos(a)).toFixed(2) }, svg); }
        [[12, 0, -29], [3, 29, 4], [6, 0, 33], [9, -29, 4]].forEach(function (d) { var t = kit.svg('text', { 'class': 'tpr-num', x: d[1], y: d[2] }, svg); t.textContent = d[0]; });
        kit.svg('line', { 'class': 'tpr-hand tpr-hand--h', x1: 0, y1: 4, x2: 0, y2: -22, transform: 'rotate(' + ang.hour.toFixed(2) + ')' }, svg);
        kit.svg('line', { 'class': 'tpr-hand tpr-hand--m', x1: 0, y1: 6, x2: 0, y2: -35, transform: 'rotate(' + ang.minute.toFixed(2) + ')' }, svg);
        kit.svg('circle', { 'class': 'tpr-hub', cx: 0, cy: 0, r: 3.2 }, svg);
        return svg;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[時間連連看] 第 ' + level + ' 關：' + q.n + ' 對（指針互換誘餌 ' + q.trapsA + ' 組、24 小時制誘餌 ' + q.trapsB + ' 組）；散布 ±' + q.spread + ' 小時；限時 ' + q.limit + ' 秒；' + q.pairs.map(function (p) { return analogText(p.h12, p.m) + '↔' + digitalText(p.h24, p.m) + (p.trap ? '(' + p.trap + ')' : ''); }).join('、'));

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'tpr-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note tpr-tip', text: level === 1 ? '先點指針鐘、再點同一個時間的電子鐘（15:15＝3:15）' : '指針鐘配同一個時間的電子鐘' });
        field.appendChild(tip);
        var cols = q.items.length <= 6 ? 3 : 4, gap = 8, cw = Math.floor((W - 24 - (cols - 1) * gap) / cols), rows = Math.ceil(q.items.length / cols), ch = Math.min(cw, Math.floor((H - 220 - (rows - 1) * gap) / rows));
        var grid = h('div', { 'class': 'tpr-grid' }); grid.style.cssText = 'top:' + (q.items.length <= 6 ? 120 : 76) + 'px;grid-template-columns:repeat(' + cols + ',' + cw + 'px);gap:' + gap + 'px;'; field.appendChild(grid);
        var cards = q.items.map(function (it) {
            var el = h('div', { 'class': 'tpr-card tpr-card--' + it.kind }); el.style.cssText = 'width:' + cw + 'px;height:' + ch + 'px;';
            if (it.kind === 'a') el.appendChild(analogSvg(it.h12, it.m, Math.min(cw, ch) - 8));
            else el.appendChild(h('div', { 'class': 'tpr-digital', text: digitalText(it.h24, it.m) }));
            grid.appendChild(el); kit.onTap(el, function () { choose(it.id); }); return el;
        });
        var info = h('div', { 'class': 'qz-note tpr-info', text: '' }); field.appendChild(info);
        if (level === 1 && kit.once('timepair.hint')) { var first = q.items.filter(function (it) { return it.kind === 'a'; })[0]; kit.hintOn(stage, cards[first.id], { mode: 'tap', delay: 900, text: '先點指針鐘' }); }

        var sel = null, done = {}, left = q.n, phase = 'play';
        api.timer(q.limit * 1000, function () { timeUp(); });
        function choose(id) {
            if (phase !== 'play' || api.over || done[id]) return;
            var it = q.items[id];
            if (sel == null) { sel = id; cards[id].classList.add('tpr-card--sel'); Sfx.play('click'); return; }
            if (sel === id) { cards[id].classList.remove('tpr-card--sel'); sel = null; return; }
            var other = q.items[sel];
            if (other.kind === it.kind) { cards[sel].classList.remove('tpr-card--sel'); sel = id; cards[id].classList.add('tpr-card--sel'); Sfx.play('click'); return; }       /* 同一種：改選這一個 */
            var a = it.kind === 'a' ? it : other, d = it.kind === 'd' ? it : other;
            if (isMatch(a, d)) {
                [sel, id].forEach(function (k) { done[k] = true; cards[k].classList.remove('tpr-card--sel'); cards[k].classList.add('tpr-card--ok'); });
                sel = null; left--; Sfx.play('ok');
                if (left === 0) { phase = 'end'; api.stopTimer(); info.textContent = '全部配對成功！'; info.classList.add('tpr-info--ok'); kit.flash(stage, true, api.my); api.pass({ delay: 1500 }); }
                return;
            }
            fail(a, d);
        }
        /* 配錯：兩個時鐘並排放大，寫出各是幾點；正確的搭檔標綠 */
        function fail(a, d) {
            phase = 'end'; api.stopTimer();
            var why = whyText(a, d), ap = q.items.filter(function (x) { return x.kind === 'd' && x.pair === a.pair; })[0], dp = q.items.filter(function (x) { return x.kind === 'a' && x.pair === d.pair; })[0];
            cards[a.id].classList.add('tpr-card--bad'); cards[d.id].classList.add('tpr-card--bad'); if (ap) cards[ap.id].classList.add('tpr-card--right'); if (dp) cards[dp.id].classList.add('tpr-card--right');
            grid.style.display = 'none'; tip.style.display = 'none';
            var box = h('div', { 'class': 'tpr-cmp' }), c1 = h('div', { 'class': 'tpr-cmp__c' }), c2 = h('div', { 'class': 'tpr-cmp__c' });
            c1.appendChild(analogSvg(a.h12, a.m, 150)); c1.appendChild(h('div', { 'class': 'tpr-cmp__t', text: '指針鐘 ' + analogText(a.h12, a.m) })); c1.appendChild(h('div', { 'class': 'tpr-cmp__s', text: a.h12 + ' 點 ' + a.m + ' 分' }));
            c2.appendChild(h('div', { 'class': 'tpr-digital tpr-digital--big', text: digitalText(d.h24, d.m) })); c2.appendChild(h('div', { 'class': 'tpr-cmp__t', text: '電子鐘 ' + digitalText(d.h24, d.m) })); c2.appendChild(h('div', { 'class': 'tpr-cmp__s', text: (d.h24 >= 12 ? '下午 ' : '上午 ') + h12of(d.h24) + ' 點 ' + d.m + ' 分（指針鐘 ' + analogText(h12of(d.h24), d.m) + '）' }));
            box.appendChild(c1); box.appendChild(h('div', { 'class': 'tpr-cmp__vs', text: '≠' })); box.appendChild(c2); field.appendChild(box);
            info.textContent = why; info.classList.add('tpr-info--bad'); info.style.top = '420px';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '電子鐘 ' + digitalText(a.h24, a.m) + ' 才是指針鐘 ' + analogText(a.h12, a.m) + ' 的搭檔', '24 小時制：15:15 ＝ 下午 3:15（減 12，不是減 10）'] });
        }
        function timeUp() {
            if (phase !== 'play' || api.over) return; phase = 'end';
            info.textContent = '時間到！還有 ' + left + ' 對沒配完'; info.classList.add('tpr-info--bad'); kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: ['時間到！還有 ' + left + ' 對沒配完'] });
        }
        /* 驗證用：每次呼叫配對一對（先點指針鐘、再點它的電子鐘）；wrong＝故意配錯（把指針鐘和別組的電子鐘配）；可重複呼叫 */
        api.solve = function () { if (phase !== 'play') return; var p = q.pairs.filter(function (x) { return !done[q.items.filter(function (it) { return it.kind === 'a' && it.pair === x.id; })[0].id]; })[0]; if (!p) return; var a = q.items.filter(function (it) { return it.kind === 'a' && it.pair === p.id; })[0], d = q.items.filter(function (it) { return it.kind === 'd' && it.pair === p.id; })[0]; choose(a.id); choose(d.id); };
        api.wrong = function () { if (phase !== 'play') return; var a = q.items.filter(function (it) { return it.kind === 'a'; })[0], d = q.items.filter(function (it) { return it.kind === 'd' && it.pair !== a.pair; })[0]; choose(a.id); choose(d.id); };
    }

    var G = {
        id: ID,
        name: '時間連連看',
        rule: '畫面上混著指針鐘和電子鐘（電子鐘是 24 小時制，例如 15:15）。**先點一個、再點一個，把顯示同一個時間的指針鐘和電子鐘配成一對**。指針鐘沒有上下午：**電子鐘 15:15 是下午 3:15，要配 3:15 的指針鐘**（不是 5:15）。小心**時針和分針互換**的時間（9:15 和 3:45 的指針鐘看起來很像）。全部配完就過關，配錯或時間到就結束。越後面，時鐘越多、時間越接近、限時越長（30 → 60 秒）。',
        mount: mount,
        score: SCORE,
        test: {
            pairsFor: pairsFor, trapAFor: trapAFor, trapBFor: trapBFor, spreadFor: spreadFor, limitFor: limitFor, h12of: h12of, digitalText: digitalText, analogText: analogText, analogAngles: analogAngles, isMatch: isMatch, swapPartner: swapPartner, minutesOf: minutesOf, makeLevel: makeLevel, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PAIRS: PAIRS, TRAP_A: TRAP_A, TRAP_B: TRAP_B, SPREAD_H: SPREAD_H, LIMIT_S: LIMIT_S, STEP_MIN: STEP_MIN, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
