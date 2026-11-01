/* ═══════════════════════════════════════════════════════════════════
   reaction_expiry.js — 秒反應・保存期限（原創篇 530「保存期限」，照使用者的修改：不遮日期，改成判斷過期了沒）
   樣式：css/games/reaction_expiry.css（class 一律以「expiry-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：上面寫著「今天」（後面的關卡還有現在幾點）。冰箱裡有幾樣食物，每樣標著**製造日期＋保存幾天**，
     有些是**製造時間＋保存幾小時**（24、36、48、72 小時）。點每一樣食物，標成「沒過期」或「過期」，全部標好按「確定」。
     **標錯一樣這一局就結束**，會列出每一樣的到期日。
   · 規則（畫面上也寫著）：製造日期＋保存天數＝到期日，**到期日當天還可以吃，隔天起才算過期**；
     保存小時：製造時間＋保存小時＝到期時間，現在已經超過就是過期。
   · 難度在「跨月加天數」：大小月（31 天、30 天）、2 月 28 天（閏年 29 天）、跨年。
       第 1～4 關都在同一個月裡 → 第 5 關起「今天」靠近月初，一定要跨月 → 第 6 關起有小時制 → 第 8 關起常常是 3 月初（要跨 2 月）
       → 第 12 關起會跨年（今天是 1 月初）→ 第 20 關起有閏年（2028 年）；保存天數最長 7 天 → 90 天、食物 3 → 7 樣（線性）。
     到期日離今天只差前後 0～3 天，數錯一天（例如把每個月都當 30 天）就會判斷錯。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'expiry';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;
    var ITEMS = [3, 7];                         /* 食物幾樣：第 1 關 → 到頂（舞台高 667px，最多放得下 7 樣） */
    var SHELF_MAX = [7, 90];                    /* 保存天數最多幾天：第 1 關 → 到頂 */
    var SHELF_DAYS = [2, 3, 4, 5, 6, 7, 10, 12, 14, 15, 20, 21, 25, 28, 30, 35, 40, 45, 60, 90];   /* 保存天數從這些挑 */
    var SHELF_HOURS = [12, 24, 36, 48, 72];     /* 保存小時從這些挑 */
    var SAME_MONTH_TO = 4;                      /* 第幾關以前都不跨月 */
    var HOURS_FROM = 6;                         /* 第幾關起有「保存幾小時」 */
    var HOURS_P = 0.35;                         /* 每樣食物是小時制的機會 */
    var MARCH_FROM = 8;                         /* 第幾關起「今天」常常是 3 月初（要跨 2 月） */
    var NEWYEAR_FROM = 12;                      /* 第幾關起會跨年 */
    var LEAP_FROM = 20;                         /* 第幾關起有閏年 */
    var NEAR_DAYS = 3;                          /* 到期日離今天最多差幾天 */
    var MAX_LEVEL = 90;
    var PASS_DELAY_MS = 1500;
    var FAIL_HOLD_MS = 7000;
    var FOODS = [                               /* [名稱, 圖示, 可以用小時制] */
        ['鮮奶', '🥛', false], ['吐司', '🍞', false], ['雞蛋', '🥚', false], ['奶油', '🧈', false], ['優酪乳', '🥤', false],
        ['布丁', '🍮', false], ['水餃', '🥟', false], ['起司', '🧀', false], ['生菜', '🥬', false], ['草莓', '🍓', false],
        ['便當', '🍱', true], ['飯糰', '🍙', true], ['三明治', '🥪', true], ['蛋糕', '🍰', true], ['壽司', '🍣', true], ['涼麵', '🍜', true]
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 日期用「從 2000-01-01 算起第幾天」的整數處理，換算用 UTC 的 Date（不受時區、夏令時間影響） */
    function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
    function ymd(n) { var dt = new Date(n * 86400000); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; }
    function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
    function monthLen(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
    function md(n) { var t = ymd(n); return t.m + '/' + t.d; }
    /* 幾點 → 「凌晨 3 點」「上午 9 點」「中午 12 點」「下午 3 點」「晚上 8 點」 */
    function hourText(hh) {
        if (hh < 6) return '凌晨 ' + (hh === 0 ? 12 : hh) + ' 點';
        if (hh < 12) return '上午 ' + hh + ' 點';
        if (hh === 12) return '中午 12 點';
        if (hh < 18) return '下午 ' + (hh - 12) + ' 點';
        return '晚上 ' + (hh - 12) + ' 點';
    }
    /* 一樣食物過期了沒：天數制看「今天 > 到期日」；小時制看「現在 > 到期時間」（時間都換成「第幾小時」） */
    function isExpired(item, now) {
        if (item.kind === 'day') return now.day > item.mfg + item.n;
        return now.day * 24 + now.hour > item.mfg * 24 + item.mfgHour + item.n;
    }
    /* 到期日（天數制）或到期時間（小時制）的文字 */
    function dueText(item) {
        if (item.kind === 'day') return '到期 ' + md(item.mfg + item.n);
        var t = item.mfg * 24 + item.mfgHour + item.n;
        return '到期 ' + md(Math.floor(t / 24)) + ' ' + hourText(t % 24);
    }
    /* 這一關的「今天」：{ day, hour } */
    function pickToday(level, rand) {
        var y = kit.pick([2026, 2027], rand), m = kit.randInt(1, 12, rand), d;
        if (level <= SAME_MONTH_TO) d = kit.randInt(16, 26, rand);
        else d = rand() < 0.75 ? kit.randInt(1, 4, rand) : kit.randInt(8, 26, rand);
        if (level >= MARCH_FROM && rand() < 0.5) { m = 3; d = kit.randInt(1, 3, rand); }
        if (level >= NEWYEAR_FROM && rand() < 0.25) { m = 1; d = kit.randInt(1, 4, rand); }
        if (level >= LEAP_FROM && m === 3 && rand() < 0.5) y = 2028;
        return { day: dayNum(y, m, d), hour: kit.randInt(8, 20, rand) };
    }
    /* 出一題：{ now, items:[{ name, icon, kind:'day'|'hour', mfg（第幾天）, mfgHour, n（天或小時）, expired }] } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var count = Math.round(kit.ramp(level, ITEMS[0], ITEMS[1], RAMP_LEVELS));
        var shelfMax = kit.ramp(level, SHELF_MAX[0], SHELF_MAX[1], RAMP_LEVELS);
        for (var tr = 0; tr < 300; tr++) {
            var now = pickToday(level, rand), t = ymd(now.day);
            var foods = kit.shuffle(FOODS, rand).slice(0, count), items = [], okAll = true;
            foods.forEach(function (f) {
                if (!okAll) return;
                var useHour = f[2] && level >= HOURS_FROM && rand() < HOURS_P, it = null;
                for (var k = 0; k < 60 && !it; k++) {
                    if (useHour) {
                        var H = kit.pick(SHELF_HOURS, rand), dh = kit.randInt(1, 20, rand) * (rand() < 0.5 ? -1 : 1);
                        var due = now.day * 24 + now.hour + dh, start = due - H;
                        it = { name: f[0], icon: f[1], kind: 'hour', mfg: Math.floor(start / 24), mfgHour: ((start % 24) + 24) % 24, n: H };
                    } else {
                        var days = SHELF_DAYS.filter(function (x) { return x <= shelfMax; }), n = kit.pick(days, rand);
                        var dd = kit.randInt(-NEAR_DAYS, NEAR_DAYS, rand), mfg = now.day + dd - n, a = ymd(mfg), b = ymd(mfg + n);
                        if (level <= SAME_MONTH_TO && (a.m !== t.m || b.m !== t.m)) continue;      /* 前幾關：製造日、到期日、今天都在同一個月 */
                        it = { name: f[0], icon: f[1], kind: 'day', mfg: mfg, mfgHour: 0, n: n };
                    }
                }
                if (!it) { okAll = false; return; }
                it.expired = isExpired(it, now);
                items.push(it);
            });
            if (!okAll) continue;
            var nExp = items.filter(function (x) { return x.expired; }).length;
            if (nExp === 0 || nExp === items.length) continue;                  /* 不要全部都過期或全部都沒過期 */
            if (level > SAME_MONTH_TO && !items.some(function (x) { return crossesMonth(x); })) continue;    /* 第 5 關起至少一樣要跨月 */
            return { now: now, items: items };
        }
        return { now: now, items: items };
    }
    /* 這樣食物從製造到到期有沒有跨月 */
    function crossesMonth(item) {
        var endDay = item.kind === 'day' ? item.mfg + item.n : Math.floor((item.mfg * 24 + item.mfgHour + item.n) / 24);
        var a = ymd(item.mfg), b = ymd(endDay);
        return a.m !== b.m || a.y !== b.y;
    }
    /* 玩家的標記（true＝過期）全部對嗎；回傳標錯的那幾樣的索引 */
    function wrongOnes(pz, marks) { var out = []; pz.items.forEach(function (it, i) { if (marks[i] !== it.expired) out.push(i); }); return out; }
    function rating(n) {
        if (n >= 25) return '冰箱管家！';
        if (n >= 12) return '大小月記得很熟！';
        if (n >= 5) return '越來越有感覺了！';
        return '大月 31 天：1、3、5、7、8、10、12 月；2 月 28 天（閏年 29 天）';
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
        var pz = makePuzzle(level, api.rand), n = pz.items.length, t = ymd(pz.now.day);
        api.info = pz;
        console.log('[保存期限] 第 ' + level + ' 關：今天 ' + t.y + '/' + t.m + '/' + t.d + '，' + n + ' 樣');
        var H = stage.clientHeight || 700;
        var hasHour = pz.items.some(function (x) { return x.kind === 'hour'; });
        /* 每樣食物一列：舞台高扣掉「今天」的框、說明、確定鈕與間距，平均分給每一列 */
        var rowH = Math.max(54, Math.min(88, Math.floor((H - (hasHour ? 84 : 46) - 28 - 62 - 40 - (n - 1) * 6) / n)));
        var marks = pz.items.map(function () { return null; }), over = false;

        var wrap = h('div', { 'class': 'expiry-wrap' });
        wrap.style.setProperty('--expiry-row', rowH + 'px');
        var today = h('div', { 'class': 'expiry-today' }, [
            h('div', { 'class': 'expiry-today__d', text: '今天 ' + t.y + ' 年 ' + t.m + ' 月 ' + t.d + ' 日' }),
            hasHour ? h('div', { 'class': 'expiry-today__h', text: '現在 ' + hourText(pz.now.hour) }) : null
        ].filter(Boolean));
        var note = h('div', { 'class': 'expiry-note', text: '到期日當天還能吃，隔天起才過期' });
        var list = h('div', { 'class': 'expiry-list' });
        var rows = [], btns = [];
        var shelfEls = [];
        pz.items.forEach(function (it, i) {
            var made = it.kind === 'day' ? '製造 ' + md(it.mfg) : '製造 ' + md(it.mfg) + ' ' + hourText(it.mfgHour);
            var keep = '保存 ' + it.n + (it.kind === 'day' ? ' 天' : ' 小時');
            var b = h('button', { 'class': 'btn btn--line expiry-mark', type: 'button', text: '？' });
            kit.onTap(b, function () { toggle(i); });
            var food = h('div', { 'class': 'expiry-food' }, [h('div', { 'class': 'expiry-icon', text: it.icon }), h('div', { 'class': 'expiry-name', text: it.name })]);
            var shelf = h('div', { 'class': 'expiry-label expiry-label--keep', text: keep });
            var info = h('div', { 'class': 'expiry-info' }, [h('div', { 'class': 'expiry-label', text: made }), shelf]);
            var row = h('div', { 'class': 'expiry-row' }, [food, info, b]);
            list.appendChild(row); rows.push(row); btns.push(b); shelfEls.push(shelf);
        });
        var btnOk = h('button', { 'class': 'btn btn--primary expiry-ok', type: 'button', text: '確定' });
        kit.onTap(btnOk, submit);
        wrap.appendChild(today); wrap.appendChild(note); wrap.appendChild(list); wrap.appendChild(btnOk);
        stage.appendChild(wrap);

        function paint() {
            btns.forEach(function (b, i) {
                var m = marks[i];
                b.textContent = m == null ? '？' : m ? '過期' : '沒過期';
                b.className = 'btn btn--line expiry-mark' + (m == null ? '' : m ? ' expiry-mark--bad' : ' expiry-mark--good');
            });
            var all = marks.every(function (m) { return m != null; });
            btnOk.disabled = !all || over;
            btnOk.textContent = all ? '確定' : '還有 ' + marks.filter(function (m) { return m == null; }).length + ' 樣沒標';
        }
        /* 點一下輪流：？ → 沒過期 → 過期 → 沒過期 … */
        function toggle(i) { if (over) return; marks[i] = marks[i] == null ? false : !marks[i]; paint(); }
        function submit() {
            if (over || marks.some(function (m) { return m == null; })) return;
            over = true; paint();
            var bad = wrongOnes(pz, marks);
            pz.items.forEach(function (it, i) {
                shelfEls[i].textContent = dueText(it);                  /* 揭曉：第二行換成到期日 */
                shelfEls[i].classList.add('expiry-label--due');
                if (bad.indexOf(i) >= 0) rows[i].classList.add('expiry-row--wrong');
            });
            if (!bad.length) { list.classList.add('expiry-list--ok'); kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }
            var lines = bad.map(function (i) { var it = pz.items[i]; return it.name + '：' + dueText(it) + '，' + (it.expired ? '已經過期' : '還沒過期'); });
            kit.flash(stage, false, api.my);
            api.fail({ delay: FAIL_HOLD_MS, lines: lines });
        }
        api.solve = function () { marks = pz.items.map(function (it) { return it.expired; }); paint(); submit(); };
        api.wrong = function () { marks = pz.items.map(function (it) { return it.expired; }); marks[0] = !marks[0]; paint(); submit(); };
        api.state = function () { return { marks: marks.slice(), over: over }; };
        paint();
    }

    var G = {
        id: ID,
        name: '保存期限',
        rule: '上面寫著今天的日期（有些關卡還有現在幾點）。冰箱裡每樣食物標著**製造日期和保存幾天**（有些是保存幾小時）。**製造日期加上保存天數就是到期日，到期日當天還可以吃，隔天起才算過期。**點每一樣食物，標成「沒過期」或「過期」，全部標好按「確定」。**標錯一樣就結束**。小心大小月和 2 月！沒有時間限制，慢慢算。',
        mount: mount,
        score: SCORE,
        test: {
            dayNum: dayNum, ymd: ymd, isLeap: isLeap, monthLen: monthLen, md: md, hourText: hourText, isExpired: isExpired, dueText: dueText,
            pickToday: pickToday, makePuzzle: makePuzzle, crossesMonth: crossesMonth, wrongOnes: wrongOnes, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ITEMS: ITEMS, SAME_MONTH_TO: SAME_MONTH_TO, HOURS_FROM: HOURS_FROM, MARCH_FROM: MARCH_FROM, LEAP_FROM: LEAP_FROM, NEAR_DAYS: NEAR_DAYS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
