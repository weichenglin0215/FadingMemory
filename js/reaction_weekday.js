/* ═══════════════════════════════════════════════════════════════════
   reaction_weekday.js — 秒反應・推星期幾（企劃 253）
   樣式：css/games/reaction_weekday.css（這款專屬的 class 一律以「weekday-」開頭；共用元件在 css/reaction_common.css）
   上方是老式撕日曆：「2026 年 3 月 5 日 星期四」。下面問「2026 年 3 月 27 日是星期幾？」，點七顆星期按鈕。
   ───────────────────────────────────────────────────────────────────
   · 算法：相差 n 天，星期就往後（或往前）移 n 除以 7 的餘數。先算天數、再取餘數——要知道各月有幾天（大小月、2 月 28／29 天）。
   · 日期用真正的曆法（JavaScript 的 Date.UTC）算，所以閏年（2028）、跨月、跨年都是對的；「已知那天」的星期是真的。
   · 題型（typesFor）隨關卡增加，後面的關卡把前面太簡單的題型拿掉：
       'same' 同一個月、差 7 的倍數附近（7k + 餘數 −2～+2）——第 1～7 關
       'cross' 往後跨一個月（要用大小月算天數）——第 4 關起
       'back' 往回推（目標日在已知日之前）——第 6 關起
       'year' 跨年（12 月 ↔ 1 月）——第 10 關起
       'far' 相差幾個月（45～FAR_MAX 天，最多 FAR_MAX 隨關卡增加）——第 14 關起
     非 'same' 的題型，畫面上方一直放著「大小月口訣」。
   · 誘餌：忘了某個月是 31 天（當 30 天算）、或把 2 月當 30 天，答案會差 1 天——七顆按鈕本來就包含這些「差一天」的星期。
   · 難度（線性）：限時 12 → 6 秒（TIME_S）；題型逐步加進來；far 的最大天數 90 → 330（FAR_MAX）。
   · 答錯時畫出月曆（相差的月份在兩個以內才畫），從已知那天一格一格數到目標，再寫出「天數 ＝ 幾週又幾天」的算式。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'weekday'：選單、成績、存檔都靠它；樣式在 css/games/reaction_weekday.css，裡面的 class 名稱一律以 weekday- 開頭。 */
    'use strict';

    var ID = 'weekday';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TIME_S = [12, 6];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var FROM = { cross: 4, back: 6, year: 10, far: 14 };   /* 各題型從第幾關開始出現 */
    var SAME_UNTIL = 7;                         /* 'same'（同月）題型出到第幾關（之後拿掉） */
    var FAR_MAX = [90, 330];                    /* 'far' 題型相差的最大天數：第 1 關 → 到頂 */
    var FAR_MIN = 45;                               /* far 題型相差的最少天數（最多天數見上面的 FAR_MAX） */
    var YEARS = [2025, 2031];                   /* 題目的年份範圍（含 2028 閏年） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var NAMES = ['日', '一', '二', '三', '四', '五', '六'];         /* 星期的字（日＝0，跟 Date.getUTCDay 一致） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function farMax(level) { return Math.round(kit.ramp(level, FAR_MAX[0], FAR_MAX[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function dayName(w) { return '星期' + NAMES[w]; }
    function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }                       /* 某年某月有幾天（m 是 1～12） */
    function dow(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }                    /* 星期幾（日＝0） */
    function addDays(dt, n) { var t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
    function diffDays(a, b) { return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000); }  /* Math.round：四捨五入成整數 */
    function mod7(n) { return ((n % 7) + 7) % 7; }
    function withW(dt) { return { y: dt.y, m: dt.m, d: dt.d, w: dow(dt.y, dt.m, dt.d) }; }
    /* 這一關可以出哪些題型 */
    function typesFor(level) {
        var t = [];
        if (level <= SAME_UNTIL) t.push('same');
        if (level >= FROM.cross) t.push('cross');
        if (level >= FROM.back) t.push('back');
        if (level >= FROM.year) t.push('year');
        if (level >= FROM.far) t.push('far');
        return t;
    }
    /* 兩個日期之間（含頭尾）有哪些月份：[{y, m}…] */
    function monthsBetween(a, b) {
        var out = [], y = a.y, m = a.m;
        while (y < b.y || (y === b.y && m <= b.m)) { out.push({ y: y, m: m }); m++; if (m > 12) { m = 1; y++; } }
        return out;
    }
    /* 往後的一組日期：{ from, to }（to 在 from 之後） */
    function forwardPair(type, year, rand) {
        var m, d, off, t, dim;
        if (type === 'same') {
            for (var g = 0; g < 100; g++) {
                m = kit.randInt(1, 12, rand); dim = daysIn(year, m);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                off = 7 * kit.randInt(1, 3, rand) + kit.randInt(-2, 2, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                if (off < 1 || off > dim - 1) continue;
                d = kit.randInt(1, dim - off, rand);
                return { from: { y: year, m: m, d: d }, to: { y: year, m: m, d: d + off } };
            }
            return { from: { y: year, m: 3, d: 5 }, to: { y: year, m: 3, d: 27 } };
        }
        if (type === 'cross') {                          /* 已知日在月底附近、目標在下個月初：跨月（不跨年） */
            m = kit.randInt(1, 11, rand); dim = daysIn(year, m);
            d = kit.randInt(Math.max(1, dim - 19), dim, rand);
            t = kit.randInt(1, Math.min(15, daysIn(year, m + 1)), rand);
            return { from: { y: year, m: m, d: d }, to: { y: year, m: m + 1, d: t } };
        }
        if (type === 'year') {                           /* 12 月底 → 隔年 1 月初 */
            d = kit.randInt(15, 31, rand); t = kit.randInt(1, 14, rand);
            return { from: { y: year, m: 12, d: d }, to: { y: year + 1, m: 1, d: t } };
        }
        /* 'far'：隨便一天，往後 FAR_MIN～上限 天 */
        return null;
    }
    /* 出一關：{ known, target（都含 w＝星期）, offset（目標 − 已知 的天數，可負）, type, months（兩個日期之間的月份）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var type = kit.pick(typesFor(level), rand), year = kit.randInt(YEARS[0], YEARS[1] - 1, rand), pair, known, target;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (type === 'far') {
            var span = kit.randInt(FAR_MIN, Math.max(FAR_MIN, farMax(level)), rand), back = rand() < 0.5;
            var start = addDays({ y: year, m: 1, d: 1 }, kit.randInt(0, 364, rand));
            known = start; target = addDays(start, back ? -span : span);
        } else {
            var base = type === 'back' ? kit.pick(['same', 'cross'].concat(level >= FROM.year ? ['year'] : []), rand) : type;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            pair = forwardPair(base, year, rand);
            if (type === 'back') { known = pair.to; target = pair.from; } else { known = pair.from; target = pair.to; }
        }
        known = withW(known); target = withW(target);
        var lo = diffDays(known, target) >= 0 ? known : target, hi = lo === known ? target : known;
        return { known: known, target: target, offset: diffDays(known, target), type: type, months: monthsBetween(lo, hi), level: level };
    }
    /* 說明算式：相差 n 天 ＝ w 週又 r 天，星期 K 往後（前）數 r 天 ＝ 星期 T */
    function explainText(q) {
        var n = Math.abs(q.offset), w = Math.floor(n / 7), r = n % 7, dir = q.offset > 0 ? '往後' : '往前';  /* Math.floor：無條件捨去成整數 */
        if (r === 0) return '相差 ' + n + ' 天＝整整 ' + w + ' 週，星期不變，還是' + dayName(q.target.w);
        return '相差 ' + n + ' 天＝' + (w ? w + ' 週又 ' : '') + r + ' 天，' + dayName(q.known.w) + dir + '數 ' + r + ' 天＝' + dayName(q.target.w);
    }
    function dateText(dt) { return dt.y + ' 年 ' + dt.m + ' 月 ' + dt.d + ' 日'; }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '活月曆！';
        if (n >= 15) return '日子算得很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先算相差幾天，再除以 7 看餘數！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'weekday-stage',
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
        var q = makeLevel(level, api.rand), K = q.known, T = q.target;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[推星期幾] 第 ' + level + ' 關（' + q.type + '）：' + dateText(K) + dayName(K.w) + ' → ' + dateText(T) + '？答案 ' + dayName(T.w) + '（相差 ' + q.offset + ' 天）；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        stage.appendChild(h('div', { 'class': 'qz-note weekday-tip', text: '推推看：下面那天是星期幾？' }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 大小月口訣（要跨月的題型才放） */
        if (q.type !== 'same') {
            stage.appendChild(h('div', { 'class': 'weekday-memo' }, [  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
                h('div', { text: '大月 31 天：1 3 5 7 8 10 12' }),
                h('div', { text: '小月 30 天：4 6 9 11' }),
                h('div', { text: '2 月：28 天（閏年 29 天）' })
            ]));
        }
        /* 撕日曆：已知的那一天 */
        var page = h('div', { 'class': 'weekday-page' }, [
            h('div', { 'class': 'weekday-page__top', text: K.y + ' 年 ' + K.m + ' 月' }),
            h('div', { 'class': 'weekday-page__day', text: String(K.d) }),
            h('div', { 'class': 'weekday-page__wd', text: dayName(K.w) })
        ]);
        var ask = h('div', { 'class': 'weekday-ask' }, [h('div', { text: dateText(T) }), h('div', { text: '是星期幾？' })]);
        /* 內容區：有大小月口訣時往下移（口訣佔 3 行），沒有時往上靠 */
        var body = h('div', { 'class': 'weekday-body' });
        body.style.top = (q.type !== 'same' ? 160 : 70) + 'px';
        stage.appendChild(body);
        body.appendChild(page); body.appendChild(ask);
        var info = h('div', { 'class': 'qz-note weekday-info', text: '' });
        body.appendChild(info);
        var done = false, picked = -1;
        var grid = kit.btnGrid(stage, NAMES.map(function (n, i) { return { text: n, kind: 'line', cls: 'weekday-opt', onTap: function () { judge(i); } }; }), { cols: 7, h: 100, gap: 6 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        var btns = grid.btns;
        api.timer(timeMs(level), function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('weekday.hint')) kit.hintOn(stage, btns[T.w], { mode: 'tap', delay: 700, text: '先算相差幾天，再除以 7' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (done || api.over) return;
            done = true; picked = i;
            var ok = i === T.w;
            btns[T.w].classList.add('weekday-opt--ok'); /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (i >= 0 && !ok) btns[i].classList.add('weekday-opt--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (ok) {
                info.textContent = explainText(q);      /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 1600 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            var steps = revealCalendar();
            info.textContent = (i >= 0 ? '你選了' + dayName(i) + '，' : '時間到！') + '答案是' + dayName(T.w);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            api.after(700 + steps.ms, function () { info.textContent = explainText(q); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            api.fail({ delay: 700 + steps.ms + 2400, lines: [i >= 0 ? '你選了' + dayName(i) + '，答案是' + dayName(T.w) : '時間到！答案是' + dayName(T.w), explainText(q)] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 畫月曆（相差的月份在兩個以內才畫），從已知那天一格一格數到目標；回傳 { ms：動畫總時間 } */
        function revealCalendar() {
            if (q.months.length > 2) return { ms: 0 };
            page.style.display = 'none'; ask.style.display = 'none';
            var cs = q.months.length === 1 ? 40 : 31, cal = h('div', { 'class': 'weekday-cal' }), cells = {};
            q.months.forEach(function (mo) {            /* forEach：對陣列的每個元素各做一次 */
                var box = h('div', { 'class': 'weekday-cal__m' });
                box.appendChild(h('div', { 'class': 'weekday-cal__title', text: mo.y + ' 年 ' + mo.m + ' 月' }));
                var g = h('div', { 'class': 'weekday-cal__grid' });
                g.style.gridTemplateColumns = 'repeat(7, ' + cs + 'px)'; g.style.gridAutoRows = cs + 'px';
                NAMES.forEach(function (n) { g.appendChild(h('div', { 'class': 'weekday-day weekday-day--head', text: n })); });  /* forEach：對陣列的每個元素各做一次 */
                for (var b = 0; b < dow(mo.y, mo.m, 1); b++) g.appendChild(h('div', { 'class': 'weekday-day weekday-day--blank' }));
                for (var d = 1; d <= daysIn(mo.y, mo.m); d++) { var c = h('div', { 'class': 'weekday-day', text: String(d) }); cells[mo.y + '-' + mo.m + '-' + d] = c; g.appendChild(c); }
                box.appendChild(g); cal.appendChild(box);
            });
            body.appendChild(cal);
            /* 一天一天走：從已知那天走到目標（倒著推就往前走） */
            var n = Math.abs(q.offset), dir = q.offset > 0 ? 1 : -1, stepMs = kit.clamp(Math.round(1500 / Math.max(1, n)), 30, 140);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
            cells[K.y + '-' + K.m + '-' + K.d].classList.add('weekday-day--from');
            for (var s = 1; s <= n; s++) (function (s) {
                api.after(500 + s * stepMs, function () {  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                    var dt = addDays(K, dir * s), el = cells[dt.y + '-' + dt.m + '-' + dt.d];
                    el.classList.add(s === n ? 'weekday-day--to' : 'weekday-day--walk'); Sfx.play('tick');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                });
            })(s);
            return { ms: 500 + n * stepMs };
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(T.w); };
        api.wrong = function () { judge((T.w + 1) % 7); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '推星期幾',
        rule: '上面是撕日曆，寫著某一天是星期幾。下面問另一天是星期幾，**點七顆星期按鈕**。**先算兩天相差幾天，再除以 7 看餘數**，星期就往後（或往前）推那麼多天。要小心每個月的天數（大月 31、小月 30、2 月 28 或 29），後面的關卡會**跨月、往回推、跨年**。選錯或來不及就結束，看你能過幾關。越後面，時間越短！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            timeMs: timeMs, farMax: farMax, dayName: dayName, daysIn: daysIn, dow: dow, addDays: addDays, diffDays: diffDays, mod7: mod7, typesFor: typesFor, monthsBetween: monthsBetween,
            forwardPair: forwardPair, makeLevel: makeLevel, explainText: explainText, dateText: dateText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TIME_S: TIME_S, FROM: FROM, SAME_UNTIL: SAME_UNTIL, FAR_MAX: FAR_MAX, FAR_MIN: FAR_MIN, YEARS: YEARS, MAX_LEVEL: MAX_LEVEL, NAMES: NAMES
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
