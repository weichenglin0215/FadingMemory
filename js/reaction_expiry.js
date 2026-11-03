/* ═══════════════════════════════════════════════════════════════════
   reaction_expiry.js — 秒反應・保存期限（原創篇 530「保存期限」，照使用者的修改：不遮日期，改成判斷過期了沒）
   樣式：css/games/reaction_expiry.css（class 一律以「expiry-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法（V1.43.0 起每一關只有一個問題）：最上面用大字寫著「今天」（後面的關卡還有現在幾點）。
     中間一樣食物，標著**製造日期＋保存幾天**，有些是**製造時間＋保存幾小時**（12、24、36、48、72 小時）。
     最下面兩顆大按鈕：左邊「已過期」、右邊「未過期」，按下去就是你的答案。
     按下去之後有一段「審判」：先停一下「判定中…」，再亮出到期日——**沒過期的到期日用綠字，過期的用鮮紅字並蓋上「已過期」鋼印**
     （鋼印在到期日旁邊，不會蓋住到期日）；保存天數維持藍色。**答錯這一局就結束**。
   · 限時（V1.43.1）：每一關的時間從 TIME[0] 秒線性縮短到 TIME[1] 秒（15 → 9 秒），上面的時間條倒數；時間到了＝失敗（直接亮出到期日與算式）。
   · 規則（畫面上也寫著）：製造日期＋保存天數＝到期日，**到期日當天還可以吃，隔天起才算過期**；
     保存小時：製造時間＋保存小時＝到期時間，現在已經超過就是過期。
   · 難度在「跨月加天數」：大小月（31 天、30 天）、2 月 28 天（閏年 29 天）、跨年。
       第 1～4 關都在同一個月裡 → 第 5 關起「今天」靠近月初，一定要跨月 → 第 6 關起有小時制 → 第 8 關起常常是 3 月初（要跨 2 月）
       → 第 12 關起會跨年（今天是 1 月初）→ 第 20 關起有閏年（2028 年）；保存天數最長 7 天 → 90 天（線性）。
     到期日離今天只差前後 0～3 天，數錯一天（例如把每個月都當 30 天）就會判斷錯。
     每一關「過期／沒過期」各一半機會（出題時先抽好答案再湊日期）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'expiry'：選單、成績、存檔都靠它；樣式在 css/games/reaction_expiry.css，裡面的 class 名稱一律以 expiry- 開頭。 */
    'use strict';

    var ID = 'expiry';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var ITEMS = [1, 1];                         /* 食物幾樣：第 1 關 → 到頂（V1.43.0：每關只有一個問題；畫面只畫第一樣） */
    var SHELF_MAX = [7, 90];                    /* 保存天數最多幾天：第 1 關 → 到頂 */
    var SHELF_DAYS = [2, 3, 4, 5, 6, 7, 10, 12, 14, 15, 20, 21, 25, 28, 30, 35, 40, 45, 60, 90];   /* 保存天數從這些挑 */
    var SHELF_HOURS = [12, 24, 36, 48, 72];     /* 保存小時從這些挑 */
    var SAME_MONTH_TO = 4;                      /* 第幾關以前都不跨月 */
    var HOURS_FROM = 6;                         /* 第幾關起有「保存幾小時」 */
    var HOURS_P = 0.35;                         /* 這一題是小時制的機會 */
    var MARCH_FROM = 8;                         /* 第幾關起「今天」常常是 3 月初（要跨 2 月） */
    var NEWYEAR_FROM = 12;                      /* 第幾關起會跨年 */
    var LEAP_FROM = 20;                         /* 第幾關起有閏年 */
    var NEAR_DAYS = 3;                          /* 到期日離今天最多差幾天 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var JUDGE_MS = 800;                         /* 審判：按下答案之後「判定中…」停多久才亮出到期日 */
    var PASS_DELAY_MS = 2800;                   /* 答對：亮出到期日之後再停多久才換下一關（要讓玩家看清楚） */
    var FAIL_HOLD_MS = 6000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，6000 毫秒＝6 秒），讓玩家先看清楚答案 */
    var TIME = [15, 9];                         /* 每一關限時（秒）：第 1 關 → 第 RAMP_LEVELS 關（線性）；時間到了＝失敗（V1.43.1） */
    var FOODS = [                               /* [名稱, 圖示, 可以用小時制] */
        ['鮮奶', '🥛', false], ['吐司', '🍞', false], ['雞蛋', '🥚', false], ['奶油', '🧈', false], ['優酪乳', '🥤', false],
        ['布丁', '🍮', false], ['水餃', '🥟', false], ['起司', '🧀', false], ['生菜', '🥬', false], ['草莓', '🍓', false],
        ['便當', '🍱', true], ['飯糰', '🍙', true], ['三明治', '🥪', true], ['蛋糕', '🍰', true], ['壽司', '🍣', true], ['涼麵', '🍜', true]
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeFor(level) { return kit.ramp(level, TIME[0], TIME[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 日期用「從 2000-01-01 算起第幾天」的整數處理，換算用 UTC 的 Date（不受時區、夏令時間影響） */
    function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }  /* Math.round：四捨五入成整數 */
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
    /* 到期日（天數制）或到期時間（小時制）的文字（不含「到期」兩個字，畫面上另外放標籤）：'11/8'、'11/8 下午 3 點' */
    function dueDate(item) {
        if (item.kind === 'day') return md(item.mfg + item.n);
        var t = item.mfg * 24 + item.mfgHour + item.n;
        return md(Math.floor(t / 24)) + ' ' + hourText(t % 24);  /* Math.floor：無條件捨去成整數 */
    }
    function dueText(item) { return '到期 ' + dueDate(item); }
    /* 這一關的「今天」：{ day, hour } */
    function pickToday(level, rand) {
        var y = kit.pick([2026, 2027], rand), m = kit.randInt(1, 12, rand), d;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (level <= SAME_MONTH_TO) d = kit.randInt(16, 26, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        else d = rand() < 0.75 ? kit.randInt(1, 4, rand) : kit.randInt(8, 26, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        if (level >= MARCH_FROM && rand() < 0.5) { m = 3; d = kit.randInt(1, 3, rand); }
        if (level >= NEWYEAR_FROM && rand() < 0.25) { m = 1; d = kit.randInt(1, 4, rand); }
        if (level >= LEAP_FROM && m === 3 && rand() < 0.5) y = 2028;
        return { day: dayNum(y, m, d), hour: kit.randInt(8, 20, rand) };
    }
    /* 出一題：{ now, items:[{ name, icon, kind:'day'|'hour', mfg（第幾天）, mfgHour, n（天或小時）, expired }] }
       items 的長度是 ITEMS 算出來的（現在都是 1）。只有一樣時，過期／沒過期各一半機會；兩樣以上不要全部都過期或全部都沒過期 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var count = Math.round(kit.ramp(level, ITEMS[0], ITEMS[1], RAMP_LEVELS));  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        var shelfMax = kit.ramp(level, SHELF_MAX[0], SHELF_MAX[1], RAMP_LEVELS);
        var wantExpired = rand() < 0.5;                 /* 答案先抽好（只有一樣時用），再湊日期；不能每次重試都重抽，不然會偏向「沒過期」 */
        for (var tr = 0; tr < 3000; tr++) {
            var now = pickToday(level, rand), t = ymd(now.day);
            var pool = kit.shuffle(FOODS, rand), used = {}, items = [], okAll = true;  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            for (var i = 0; i < count && okAll; i++) {
                var useHour = level >= HOURS_FROM && rand() < HOURS_P;
                var cand = pool.filter(function (f) { return !used[f[0]] && (!useHour || f[2]); });  /* filter：留下符合條件的元素，回傳新陣列 */
                if (!cand.length) { useHour = false; cand = pool.filter(function (f) { return !used[f[0]]; }); }  /* filter：留下符合條件的元素，回傳新陣列 */
                var f = cand[0], it = null;
                used[f[0]] = true;
                for (var k = 0; k < 60 && !it; k++) {
                    if (useHour) {
                        var H = kit.pick(SHELF_HOURS, rand), dh = kit.randInt(1, 20, rand) * (rand() < 0.5 ? -1 : 1);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
                        var due = now.day * 24 + now.hour + dh, start = due - H;
                        it = { name: f[0], icon: f[1], kind: 'hour', mfg: Math.floor(start / 24), mfgHour: ((start % 24) + 24) % 24, n: H };  /* Math.floor：無條件捨去成整數 */
                    } else {
                        var days = SHELF_DAYS.filter(function (x) { return x <= shelfMax; }), n = kit.pick(days, rand);
                        var dd = kit.randInt(-NEAR_DAYS, NEAR_DAYS, rand), mfg = now.day + dd - n, a = ymd(mfg), b = ymd(mfg + n);
                        if (level <= SAME_MONTH_TO && (a.m !== t.m || b.m !== t.m)) continue;      /* 前幾關：製造日、到期日、今天都在同一個月 */
                        it = { name: f[0], icon: f[1], kind: 'day', mfg: mfg, mfgHour: 0, n: n };
                    }
                }
                if (!it) { okAll = false; break; }
                it.expired = isExpired(it, now);
                items.push(it);
            }
            if (!okAll) continue;
            if (count === 1) { if (items[0].expired !== wantExpired) continue; }
            else {
                var nExp = items.filter(function (x) { return x.expired; }).length;
                if (nExp === 0 || nExp === items.length) continue;
            }
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
    function wrongOnes(pz, marks) { var out = []; pz.items.forEach(function (it, i) { if (marks[i] !== it.expired) out.push(i); }); return out; }  /* forEach：對陣列的每個元素各做一次 */
    /* 一句話說明為什麼：「11/3 ＋ 5 天 ＝ 11/8 到期；今天 11/10，已經過了」 */
    function explain(item, now) {
        if (item.kind === 'day') {
            var due = item.mfg + item.n;
            return md(item.mfg) + ' ＋ ' + item.n + ' 天 ＝ ' + md(due) + ' 到期；今天 ' + md(now.day) + (now.day > due ? '，已經過了' : (now.day === due ? '，到期日當天還能吃' : '，還沒到')) ;
        }
        return md(item.mfg) + ' ' + hourText(item.mfgHour) + ' ＋ ' + item.n + ' 小時 ＝ ' + dueDate(item) + ' 到期；現在 ' + md(now.day) + ' ' + hourText(now.hour) + (isExpired(item, now) ? '，已經過了' : '，還沒到');
    }
    /* 結算畫面的評語：依成績回傳一句話 */
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

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var pz = makePuzzle(level, api.rand), it = pz.items[0], t = ymd(pz.now.day);
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[保存期限] 第 ' + level + ' 關：今天 ' + t.y + '/' + t.m + '/' + t.d + '，' + it.name + '，' + (it.expired ? '已過期' : '未過期'));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var hasHour = it.kind === 'hour';
        var answer = null, over = false;                          /* answer：true＝你按「已過期」、false＝「未過期」 */

        var wrap = h('div', { 'class': 'expiry-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        /* 今天：大字，字級量好之後剛好佔滿整個寬度（fitToday） */
        var todayD = h('div', { 'class': 'expiry-today__d', text: t.y + ' 年 ' + t.m + ' 月 ' + t.d + ' 日' });
        var today = h('div', { 'class': 'expiry-today' }, [
            h('div', { 'class': 'expiry-today__lbl', text: '今天' }),
            todayD,
            hasHour ? h('div', { 'class': 'expiry-today__h', text: '現在 ' + hourText(pz.now.hour) }) : null
        ].filter(Boolean));
        var note = h('div', { 'class': 'expiry-note', text: '到期日當天還能吃，隔天起才過期' });

        var made = it.kind === 'day' ? '製造 ' + md(it.mfg) : '製造 ' + md(it.mfg) + ' ' + hourText(it.mfgHour);
        var keep = '保存 ' + it.n + (it.kind === 'day' ? ' 天' : ' 小時');
        var food = h('div', { 'class': 'expiry-food' }, [h('div', { 'class': 'expiry-icon', text: it.icon }), h('div', { 'class': 'expiry-name', text: it.name })]);
        var info = h('div', { 'class': 'expiry-info' }, [h('div', { 'class': 'expiry-label expiry-label--made', text: made }), h('div', { 'class': 'expiry-label expiry-label--keep', text: keep })]);
        /* 審判區：按下答案之前是「？」，按下後先「判定中…」，再亮出到期日（綠／紅）；過期的旁邊蓋「已過期」鋼印（鋼印在到期日旁邊，不蓋住它） */
        var dueTxt = h('div', { 'class': 'expiry-due__t', text: '到期日？' });
        var stamp = h('div', { 'class': 'expiry-stamp', text: '已過期' });
        var due = h('div', { 'class': 'expiry-due' }, [dueTxt, stamp]);
        var why = h('div', { 'class': 'expiry-why' });
        var card = h('div', { 'class': 'expiry-card' }, [h('div', { 'class': 'expiry-card__top' }, [food, info]), due, why]);
        var ask = h('div', { 'class': 'expiry-ask', text: '這個過期了嗎？' });

        var bExp = h('button', { 'class': 'btn expiry-btn expiry-btn--bad', type: 'button', text: '已過期' });
        var bFresh = h('button', { 'class': 'btn expiry-btn expiry-btn--good', type: 'button', text: '未過期' });
        kit.onTap(bExp, function () { choose(true); }); /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(bFresh, function () { choose(false); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        var btns = h('div', { 'class': 'expiry-btns' }, [bExp, bFresh]);
        wrap.appendChild(today); wrap.appendChild(note); wrap.appendChild(card); wrap.appendChild(ask); wrap.appendChild(btns);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        stage.appendChild(wrap);                        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */

        /* 把「今天」的日期字級調到剛好佔滿寬度（量 40px 時的寬度，等比例放大／縮小；字型載入完成後再量一次） */
        function fitToday() {
            var W = (stage.clientWidth || 472) - 28;
            todayD.style.fontSize = '40px';
            todayD.style.display = 'inline-block';
            var w = todayD.scrollWidth;
            if (w > 0) todayD.style.fontSize = Math.max(28, Math.floor(40 * W / w)) + 'px';
        }
        fitToday();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!over) fitToday(); });

        /* 按下答案：先停一下「判定中…」，再亮出到期日與鋼印；對就過關、錯就結算 */
        function choose(v) {
            if (over) return;
            over = true; answer = v; api.stopTimer();
            bExp.disabled = bFresh.disabled = true;
            (v ? bExp : bFresh).classList.add('expiry-btn--picked');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            dueTxt.textContent = '判定中…'; due.classList.add('expiry-due--judging');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            api.after(JUDGE_MS, reveal);                /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        }
        function reveal() {
            var right = answer === it.expired;
            due.classList.remove('expiry-due--judging');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            due.classList.add(it.expired ? 'expiry-due--bad' : 'expiry-due--ok');
            dueTxt.textContent = dueText(it);           /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (it.expired) stamp.classList.add('expiry-stamp--on');
            why.textContent = explain(it, pz.now);
            card.classList.add(right ? 'expiry-card--right' : 'expiry-card--wrong');
            if (right) { kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            if (answer === null) ask.textContent = '時間到了，來不及回答';
            else {
                (answer ? bExp : bFresh).classList.add('expiry-btn--wrong');
                ask.textContent = '你按了「' + (answer ? '已過期' : '未過期') + '」，答錯了';
            }
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: FAIL_HOLD_MS, lines: [it.name + '：' + dueText(it) + '，' + (it.expired ? '已經過期' : '還沒過期'), explain(it, pz.now)] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 時間到：不算答案，直接亮出到期日與算式，結算 */
        function timeUp() {
            if (over) return;
            over = true; answer = null;
            bExp.disabled = bFresh.disabled = true;
            reveal();
        }
        api.timeout = timeUp;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { choose(it.expired); };
        api.wrong = function () { choose(!it.expired); };
        api.state = function () { return { answer: answer, over: over }; };
        api.timer(Math.round(timeFor(level) * 1000), timeUp);  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '保存期限',
        rule: '最上面用大字寫著**今天的日期**（有些關卡還有現在幾點）。中間是一樣食物，標著製造日期和保存幾天（有些是保存幾小時）。**製造日期加上保存天數就是到期日，到期日當天還可以吃，隔天起才算過期。**每一關只有一個問題：**按下面的「已過期」或「未過期」**。按下去之後會亮出到期日：沒過期是綠字，過期是紅字並蓋上「已過期」鋼印。**答錯就結束**。小心大小月和 2 月！每一關有時間限制（上面的時間條），時間到了也算失敗。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            dayNum: dayNum, ymd: ymd, isLeap: isLeap, monthLen: monthLen, md: md, hourText: hourText, isExpired: isExpired, dueText: dueText, dueDate: dueDate, explain: explain,
            pickToday: pickToday, timeFor: timeFor, TIME: TIME, makePuzzle: makePuzzle, crossesMonth: crossesMonth, wrongOnes: wrongOnes, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, ITEMS: ITEMS, SAME_MONTH_TO: SAME_MONTH_TO, HOURS_FROM: HOURS_FROM, MARCH_FROM: MARCH_FROM, LEAP_FROM: LEAP_FROM, NEAR_DAYS: NEAR_DAYS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
