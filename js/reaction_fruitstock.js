/* ═══════════════════════════════════════════════════════════════════
   reaction_fruitstock.js — 秒反應・水果進出貨（原創篇 531「公車人數表」，照使用者的修改改成水果攤的進貨與賣出）
   樣式：css/games/reaction_fruitstock.css（class 一律以「fruitstock-」開頭）；數字鍵盤：js/numpad_lib.js
   ───────────────────────────────────────────────────────────────────
   · 玩法：水果攤上半部是每種水果的資料：名稱、顏色、**1 公斤有幾顆**、早上有幾顆。
     下半部是今天一筆一筆的進貨與賣出，寫法很多種：「賣出 蘋果 5 顆」「進貨 柳丁 2 公斤」「賣出 紅色的 3 顆」「進貨 黃色的 1 公斤」。
     算出**收攤時每種水果剩幾顆**：點那一種水果的「收攤」格子、用數字鍵填，全部填好按「對帳」。**算錯一種這一局就結束**，會列出那一種的算式。
   · 頓悟：先把每一筆換成「哪一種、幾顆」（顏色對到水果、公斤 × 每公斤幾顆），再一種一種加減；
     同一種水果的進出分散在好幾行，要一筆都不漏。
   · 關卡：水果 2 → 5 種、進出 3 → 10 筆（線性）；第 3 關起有「公斤」、第 6 關起有「顏色」（機會都隨關卡增加）；
     第 15 關起有「半公斤」（只出現在每公斤顆數是偶數的水果）。賣出的數量不會超過當時攤上有的。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'fruitstock';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;
    var KINDS = [2, 5];                         /* 水果幾種：第 1 關 → 到頂 */
    var EVENTS = [3, 10];                       /* 進出貨幾筆：第 1 關 → 到頂 */
    var KG_FROM = 3, KG_P = [0.3, 0.5];         /* 第幾關起出現「公斤」、機會（出現那關 → 到頂） */
    var COLOR_FROM = 6, COLOR_P = [0.3, 0.5];   /* 第幾關起出現「顏色」、機會 */
    var HALF_FROM = 15, HALF_P = 0.3;           /* 第幾關起出現「半公斤」、機會（只在每公斤顆數是偶數的水果） */
    var START = [8, 40];                        /* 早上每種有幾顆（亂數範圍） */
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 7000;
    var FRUITS = [                              /* 名稱、圖示、顏色（文字）、顏色的 CSS 變數名尾碼、1 公斤幾顆 */
        { name: '蘋果', icon: '🍎', color: '紅色', c: 'red', perKg: 4 },
        { name: '柳丁', icon: '🍊', color: '橘色', c: 'orange', perKg: 6 },
        { name: '檸檬', icon: '🍋', color: '黃色', c: 'yellow', perKg: 8 },
        { name: '奇異果', icon: '🥝', color: '綠色', c: 'green', perKg: 10 },
        { name: '桃子', icon: '🍑', color: '粉色', c: 'pink', perKg: 5 }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(level) {
        return {
            kinds: Math.round(kit.ramp(level, KINDS[0], KINDS[1], RAMP_LEVELS)),
            events: Math.round(kit.ramp(level, EVENTS[0], EVENTS[1], RAMP_LEVELS))
        };
    }
    /* 某個功能從第 from 關開始出現，機會從 p[0] 走到 p[1]（到頂那關） */
    function chanceOf(level, from, p) { return level < from ? 0 : kit.ramp(level - from + 1, p[0], p[1], Math.max(2, RAMP_LEVELS - from + 1)); }
    /* 一筆進出貨的文字：{ dir:+1 進貨／−1 賣出, f（水果索引）, how:'name'|'color', unit:'pc'|'kg'|'half', amt（顆數或公斤數） } */
    function eventText(ev, fruits) {
        var fr = fruits[ev.f];
        var who = ev.how === 'color' ? fr.color + '的' : fr.name;
        var qty = ev.unit === 'pc' ? ev.amt + ' 顆' : ev.unit === 'half' ? '半公斤' : ev.amt + ' 公斤';
        return (ev.dir > 0 ? '進貨 ' : '賣出 ') + who + ' ' + qty;
    }
    /* 這一筆是幾顆 */
    function piecesOf(ev, fruits) { var k = fruits[ev.f].perKg; return ev.unit === 'pc' ? ev.amt : ev.unit === 'half' ? k / 2 : ev.amt * k; }
    /* 收攤時每種剩幾顆 */
    function finalCounts(pz) {
        var out = pz.start.slice();
        pz.events.forEach(function (ev) { out[ev.f] += ev.dir * piecesOf(ev, pz.fruits); });
        return out;
    }
    /* 出一題：{ fruits, start[], events[], answer[] } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var sz = sizeFor(level), pKg = chanceOf(level, KG_FROM, KG_P), pColor = chanceOf(level, COLOR_FROM, COLOR_P);
        var fruits = kit.shuffle(FRUITS, rand).slice(0, sz.kinds);
        var start = fruits.map(function () { return kit.randInt(START[0], START[1], rand); });
        var now = start.slice(), events = [];
        for (var e = 0; e < sz.events; e++) {
            /* 每種水果至少輪到一次：前 kinds 筆依序各一種，之後隨機 */
            var f = e < fruits.length ? e : kit.randInt(0, fruits.length - 1, rand), fr = fruits[f];
            var unit = 'pc', amt;
            if (level >= HALF_FROM && fr.perKg % 2 === 0 && rand() < HALF_P) { unit = 'half'; amt = 0.5; }
            else if (rand() < pKg) { unit = 'kg'; amt = kit.randInt(1, 3, rand); }
            else amt = kit.randInt(2, 12, rand);
            var pcs = unit === 'pc' ? amt : unit === 'half' ? fr.perKg / 2 : amt * fr.perKg;
            var dir = rand() < 0.45 ? 1 : -1;
            if (dir < 0 && pcs > now[f]) dir = 1;                     /* 攤上不夠賣，就改成進貨 */
            now[f] += dir * pcs;
            events.push({ dir: dir, f: f, how: rand() < pColor ? 'color' : 'name', unit: unit, amt: amt });
        }
        events = kit.shuffle(events, rand);        /* 打亂順序（不然前幾筆剛好是每種水果各一筆） */
        /* 打亂之後要再確認「賣出的不超過當時有的」：照新順序重算一遍，不夠就把那筆改成進貨 */
        now = start.slice();
        events.forEach(function (ev) { var p = piecesOf(ev, fruits); if (ev.dir < 0 && p > now[ev.f]) ev.dir = 1; now[ev.f] += ev.dir * p; });
        var pz = { fruits: fruits, start: start, events: events };
        pz.answer = finalCounts(pz);
        return pz;
    }
    /* 某一種水果的算式：「蘋果：20 ＋ 12 − 5 − 8 ＝ 19 顆」 */
    function workOf(pz, f) {
        var s = pz.fruits[f].name + '：' + pz.start[f];
        pz.events.forEach(function (ev) { if (ev.f === f) s += (ev.dir > 0 ? ' ＋ ' : ' − ') + piecesOf(ev, pz.fruits); });
        return s + ' ＝ ' + pz.answer[f] + ' 顆';
    }
    function rating(n) {
        if (n >= 25) return '水果攤老闆！';
        if (n >= 12) return '帳算得很清楚！';
        if (n >= 5) return '越來越有感覺了！';
        return '先把每一筆換成「哪一種、幾顆」，再一種一種算！';
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
        var pz = makePuzzle(level, api.rand), K = pz.fruits.length;
        api.info = pz;
        console.log('[水果進出貨] 第 ' + level + ' 關：' + K + ' 種、' + pz.events.length + ' 筆');
        /* 版面：舞台高 667px 要放下「水果表（標題＋K 列）＋進出貨（超過 5 筆分兩欄）＋4 排數字鍵＋對帳鈕」，剩下的高度平均分給水果表的每一列 */
        var H = stage.clientHeight || 667, keyH = 42;
        var evRows = pz.events.length > 5 ? Math.ceil(pz.events.length / 2) : pz.events.length;
        var rowH = Math.max(36, Math.min(56, Math.floor((H - 24 - (evRows * 31 + 14) - (4 * keyH + 18) - 52 - 4 * 6 - 4 - K * 4) / K)));
        var ans = pz.fruits.map(function () { return ''; }), sel = 0, over = false;

        var wrap = h('div', { 'class': 'fruitstock-wrap' });
        wrap.style.setProperty('--fruitstock-row', rowH + 'px');
        var table = h('div', { 'class': 'fruitstock-table' });
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '水果' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '顏色' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '1 公斤' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '早上' }));
        table.appendChild(h('div', { 'class': 'fruitstock-th', text: '收攤' }));
        var inputs = [];
        pz.fruits.forEach(function (fr, i) {
            table.appendChild(h('div', { 'class': 'fruitstock-fruit' }, [
                h('span', { 'class': 'fruitstock-icon', text: fr.icon }),
                h('span', { 'class': 'fruitstock-fname', text: fr.name })
            ]));
            table.appendChild(h('div', { 'class': 'fruitstock-td fruitstock-color fruitstock-color--' + fr.c, text: fr.color }));
            table.appendChild(h('div', { 'class': 'fruitstock-td', text: fr.perKg + ' 顆' }));
            table.appendChild(h('div', { 'class': 'fruitstock-td', text: pz.start[i] + ' 顆' }));
            var inp = h('div', { 'class': 'fruitstock-input' });
            kit.onTap(inp, function () { if (!over) { sel = i; paint(); } });
            table.appendChild(inp); inputs.push(inp);
        });
        var evBox = h('div', { 'class': 'fruitstock-events' + (pz.events.length > 5 ? ' fruitstock-events--two' : '') });
        pz.events.forEach(function (ev, i) {
            evBox.appendChild(h('div', { 'class': 'fruitstock-ev fruitstock-ev--' + (ev.dir > 0 ? 'in' : 'out'), text: eventText(ev, pz.fruits) }));
        });
        var btnOk = h('button', { 'class': 'btn btn--primary fruitstock-ok', type: 'button', text: '對帳' });
        kit.onTap(btnOk, submit);
        wrap.appendChild(table); wrap.appendChild(evBox);
        stage.appendChild(wrap);
        var pad = Reaction.numpad(wrap, { keyH: keyH, onKey: onKey });
        wrap.appendChild(btnOk);

        function paint() {
            inputs.forEach(function (el, i) {
                el.textContent = ans[i];
                el.className = 'fruitstock-input' + (i === sel && !over ? ' fruitstock-input--sel' : '') + (ans[i] !== '' ? ' fruitstock-input--filled' : '');
            });
            var left = ans.filter(function (a) { return a === ''; }).length;
            btnOk.disabled = left > 0 || over;
            btnOk.textContent = left ? '還有 ' + left + ' 種沒填' : '對帳';
        }
        function onKey(k) {
            if (over) return;
            if (k === 'clr') ans[sel] = '';
            else if (k === 'del') ans[sel] = ans[sel].slice(0, -1);
            else if (ans[sel].length < 3 && !(ans[sel] === '0')) ans[sel] = ans[sel] + k;
            else if (ans[sel] === '0') ans[sel] = k;
            paint();
        }
        function submit() {
            if (over || ans.some(function (a) { return a === ''; })) return;
            over = true; pad.setEnabled(false);
            var bad = [];
            pz.fruits.forEach(function (fr, i) { if (parseInt(ans[i], 10) !== pz.answer[i]) bad.push(i); });
            paint();
            inputs.forEach(function (el, i) { if (bad.indexOf(i) >= 0) { el.classList.add('fruitstock-input--bad'); el.textContent = ans[i] + '→' + pz.answer[i]; } else el.classList.add('fruitstock-input--ok'); });
            if (!bad.length) { btnOk.textContent = '帳對了！'; kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }
            var lines = bad.map(function (i) { return workOf(pz, i); });
            btnOk.textContent = '帳不對';
            evBox.innerHTML = ''; evBox.className = 'fruitstock-events';          /* 進出貨的位置改成列出算錯的那幾種的算式 */
            lines.forEach(function (t) { evBox.appendChild(h('div', { 'class': 'fruitstock-work', text: t })); });
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: lines });
        }
        api.solve = function () { ans = pz.answer.map(String); paint(); submit(); };
        api.wrong = function () { ans = pz.answer.map(String); ans[0] = String(pz.answer[0] + 1); paint(); submit(); };
        api.state = function () { return { ans: ans.slice(), sel: sel, over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '水果進出貨',
        rule: '水果攤上面寫著每種水果的**顏色、1 公斤有幾顆、早上有幾顆**；下面是今天一筆一筆的**進貨和賣出**，有的寫水果名稱，有的只寫顏色（「紅色的」），有的寫顆數，有的寫公斤。**算出收攤時每種水果剩幾顆**：點「收攤」的格子用數字鍵填，全部填好按「對帳」。**算錯一種就結束**，會列出算式。沒有時間限制，慢慢算。',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, chanceOf: chanceOf, eventText: eventText, piecesOf: piecesOf, finalCounts: finalCounts, makePuzzle: makePuzzle, workOf: workOf, rating: rating,
            FRUITS: FRUITS, RAMP_LEVELS: RAMP_LEVELS, KINDS: KINDS, EVENTS: EVENTS, KG_FROM: KG_FROM, COLOR_FROM: COLOR_FROM, HALF_FROM: HALF_FROM, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
