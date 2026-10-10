/* ═══════════════════════════════════════════════════════════════════
   reaction_whosaid.js — 秒反應・誰說的（企劃 164）
   幾個不同顏色的小人輪流說話，每說一句，頭上會出現漫畫的對話泡泡，泡泡裡寫著一個數字。
   說完之後問：「紅色的小人說過哪些數字？」下面有 0～9 十顆數字按鈕，依序按出那個顏色的小人說過的數字。
   記的是「來源」（誰說的），不只是數字本身。關卡制：按錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 難度線性（RAMP_LEVELS 關走到頂）：小人 2 → 5 個；每個小人說的數字 1 → 3 個（所以總共說 2 → 15 句）；
     每一句泡泡出現的時間 0.9 秒 → 0.6 秒；作答限時 ＝ (ANS_BASE ＋ ANS_PER × 要按幾個數字) × 倍率。
   · 說話的順序：每個小人說的次數相同，整個順序隨機打亂（同一個小人可以連著說兩次）。
   · 按數字時每按一個就判定：按錯馬上結束，按對了會填進上方的格子；全部按對就過關。
   · 揭曉：每個小人說過的數字全部列出來。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'whosaid';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var PEOPLE = [2, 5];                        /* 小人幾個：第 1 關 → 到頂 */
    var SAYS = [1, 3];                          /* 每個小人說幾個數字：第 1 關 → 到頂 */
    var SAY_MS = [900, 600];                    /* 每一句的泡泡出現多久（毫秒）：第 1 關 → 到頂 */
    var GAP_MS = 220;                           /* 兩句之間的空檔（毫秒） */
    var ANS_BASE = 4000, ANS_PER = 1800;        /* 作答限時（毫秒）＝ (ANS_BASE ＋ ANS_PER × 要按幾個數字) × 倍率 */
    var ANS_MUL = [1.2, 0.8];                   /* 倍率：第 1 關 → 到頂 */
    var MAX_LEVEL = 60;
    /* 小人的顏色（名字、色相、飽和度、亮度）：紅、藍、綠、黃、紫，彼此夠不一樣 */
    var COLORS = [
        { n: '紅', h: 4, s: 76, l: 52 }, { n: '藍', h: 212, s: 72, l: 52 }, { n: '綠', h: 135, s: 55, l: 42 },
        { n: '黃', h: 46, s: 90, l: 50 }, { n: '紫', h: 282, s: 52, l: 52 }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function peopleFor(level) { return kit.clamp(Math.round(kit.ramp(level, PEOPLE[0], PEOPLE[1], RAMP_LEVELS)), PEOPLE[0], PEOPLE[1]); }
    function saysFor(level) { return kit.clamp(Math.round(kit.ramp(level, SAYS[0], SAYS[1], RAMP_LEVELS)), SAYS[0], SAYS[1]); }
    function sayMs(level) { return Math.round(kit.ramp(level, SAY_MS[0], SAY_MS[1], RAMP_LEVELS)); }
    function ansMs(level) { return Math.round((ANS_BASE + ANS_PER * saysFor(level)) * kit.ramp(level, ANS_MUL[0], ANS_MUL[1], RAMP_LEVELS)); }
    /* 出一關：{ people（顏色清單）, events:[{ who 第幾個小人, digit }]（說話順序）, says（每人幾句）, ask（問的是第幾個小人）, expect（該小人說過的數字，依說話順序） } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = peopleFor(level), m = saysFor(level), i, j;
        var people = kit.sample(COLORS, n, rand);
        var events = [];
        for (i = 0; i < n; i++) for (j = 0; j < m; j++) events.push({ who: i, digit: kit.randInt(0, 9, rand) });
        events = kit.shuffle(events, rand);
        var ask = kit.randInt(0, n - 1, rand);
        var expect = events.filter(function (e) { return e.who === ask; }).map(function (e) { return e.digit; });
        return { people: people, events: events, says: m, ask: ask, expect: expect };
    }
    /* 每個小人說過的數字（依說話順序），揭曉用 */
    function spoken(q) {
        return q.people.map(function (p, i) { return q.events.filter(function (e) { return e.who === i; }).map(function (e) { return e.digit; }); });
    }
    function rating(n) {
        if (n >= 25) return '耳聰目明！';
        if (n >= 15) return '記憶力很強！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看清楚誰說了什麼，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 小人的圖：頭（圓）＋身體（圓角梯形）；顏色就是身分 */
    function personSvg(p) {
        var fill = kit.hsl(p.h, p.s, p.l), edge = kit.hsl(p.h, p.s, Math.max(12, p.l - 24));
        return '<svg viewBox="0 0 80 110" aria-hidden="true"><circle cx="40" cy="26" r="20" fill="#FFE3B8" stroke="' + edge + '" stroke-width="3"/>' +
            '<circle cx="33" cy="25" r="2.6" fill="#4A3B1E"/><circle cx="47" cy="25" r="2.6" fill="#4A3B1E"/>' +
            '<path d="M32 34 Q40 40 48 34" fill="none" stroke="#4A3B1E" stroke-width="2.4" stroke-linecap="round"/>' +
            '<path d="M14 106 L18 58 Q40 46 62 58 L66 106 Z" fill="' + fill + '" stroke="' + edge + '" stroke-width="3" stroke-linejoin="round"/></svg>';
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        var sp = spoken(q);
        console.log('[誰說的] 第 ' + level + ' 關：' + q.people.length + ' 個小人、每人 ' + q.says + ' 句；順序 ' + q.events.map(function (e) { return q.people[e.who].n + e.digit; }).join(' ') + '；問 ' + q.people[q.ask].n + '，答案 ' + q.expect.join('') + '；每句 ' + sayMs(level) + ' ms，限時 ' + ansMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var n = q.people.length, pw = Math.min(100, Math.floor((W - 20) / n)), top = 170;
        var tip = h('div', { 'class': 'qz-note wsd-tip', text: '請看小人說了什麼數字' });
        stage.appendChild(tip);
        var persons = q.people.map(function (p, i) {
            var el = h('div', { 'class': 'wsd-person' });
            el.style.width = pw + 'px';
            el.style.left = Math.round((W - n * pw) / 2 + i * pw) + 'px'; el.style.top = top + 'px';
            el.innerHTML = '<div class="wsd-bubble"></div>' + personSvg(p) + '<div class="wsd-name" style="color:' + kit.hsl(p.h, p.s, Math.max(20, p.l - 14)) + '">' + p.n + '</div>';
            stage.appendChild(el);
            return el;
        });
        var slots = h('div', { 'class': 'wsd-slots' });
        var slotEls = q.expect.map(function () { var s = h('div', { 'class': 'wsd-slot', text: '' }); slots.appendChild(s); return s; });
        slots.style.visibility = 'hidden';
        stage.appendChild(slots);
        var phase = 'say', got = 0, padBtns = null;
        /* 依序讓每個小人說話 */
        var t = 500;
        q.events.forEach(function (e) {
            api.after(t, function () {
                persons.forEach(function (p) { p.classList.remove('wsd-person--say'); });
                var el = persons[e.who];
                el.classList.add('wsd-person--say');
                el.querySelector('.wsd-bubble').textContent = String(e.digit);
                Sfx.play('tick');
            });
            api.after(t + sayMs(level), function () {
                persons[e.who].classList.remove('wsd-person--say');
                persons[e.who].querySelector('.wsd-bubble').textContent = '';
            });
            t += sayMs(level) + GAP_MS;
        });
        api.after(t + 150, function () {
            phase = 'ask';
            var c = q.people[q.ask];
            tip.innerHTML = '請依序按出 <span class="wsd-who" style="background:' + kit.hsl(c.h, c.s, c.l) + '">' + c.n + '色小人</span> 說過的數字';
            slots.style.visibility = '';
            persons[q.ask].classList.add('wsd-person--ask');
            var items = [];
            for (var d = 0; d <= 9; d++) (function (d) { items.push({ text: String(d), kind: 'sky', cls: 'wsd-btn', onTap: function () { press(d); } }); })(d);
            padBtns = kit.btnGrid(stage, items, { cols: 5, h: 84, gap: 10 }).btns;
            api.timer(ansMs(level), function () { reveal(null); });
            if (level === 1 && kit.once('whosaid.hint')) kit.hintOn(stage, padBtns[q.expect[0]], { mode: 'tap', delay: 600, text: '請點擊數字' });
        });

        function press(d) {
            if (api.over || phase !== 'ask') return;
            if (d !== q.expect[got]) { reveal(d); return; }
            slotEls[got].textContent = String(d); slotEls[got].classList.add('wsd-slot--ok');
            got++;
            if (got >= q.expect.length) { phase = 'done'; reveal('ok'); }
        }
        function reveal(d) {
            if (api.over) return;
            phase = 'done';
            persons.forEach(function (p, i) { p.querySelector('.wsd-bubble').textContent = sp[i].join(' '); p.classList.add('wsd-person--list'); });
            q.expect.forEach(function (v, k) { if (!slotEls[k].textContent) { slotEls[k].textContent = String(v); slotEls[k].classList.add('wsd-slot--miss'); } });
            if (d === 'ok') { kit.flash(stage, true, api.my); api.pass({ delay: 1400 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2600, lines: [
                (d == null ? '時間到！' : '按錯了（你按了 ' + d + '）') + '，' + q.people[q.ask].n + '色小人說過的是 ' + q.expect.join(' '),
                q.people.map(function (p, i) { return p.n + '：' + sp[i].join(' '); }).join('　')
            ] });
        }
        api.solve = function () { if (phase !== 'ask') return; q.expect.forEach(function (v, k) { slotEls[k].textContent = String(v); slotEls[k].classList.add('wsd-slot--ok'); }); got = q.expect.length; reveal('ok'); };
        api.wrong = function () { if (phase !== 'ask') return; reveal((q.expect[0] + 1) % 10); };
    }

    var G = {
        id: ID,
        name: '誰說的',
        rule: '幾個不同顏色的小人輪流說話，頭上的泡泡會出現一個數字。說完後會問某個顏色的小人說過哪些數字，請用下面的數字按鈕依序按出來。按錯或來不及就結束，看你能過幾關。越後面，小人越多、說的數字也越多！',
        mount: mount,
        score: SCORE,
        test: {
            peopleFor: peopleFor, saysFor: saysFor, sayMs: sayMs, ansMs: ansMs, makeLevel: makeLevel, spoken: spoken, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PEOPLE: PEOPLE, SAYS: SAYS, SAY_MS: SAY_MS, GAP_MS: GAP_MS, MAX_LEVEL: MAX_LEVEL, COLORS: COLORS
        }
    };
    Reaction.register(G);
})();
