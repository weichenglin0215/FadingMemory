/* ═══════════════════════════════════════════════════════════════════
   reaction_gaspump.js — 秒反應・加到五百（企劃 273）
   樣式：css/games/reaction_gaspump.css（這款專屬的 class 一律以「gaspump-」開頭；共用元件在 css/reaction_common.css）
   加油站。上方寫「今天 95 無鉛 29.8 元／公升，請加 500 元」。**按住油槍開始加油，畫面只顯示「已加幾公升」（一直跳），金額欄蓋著「？」貼紙**；
   覺得剛好是目標金額就放手。放手後撕掉貼紙：「503.6080 元，多加了 3.6080 元」。誤差在容許範圍內過關。
   ───────────────────────────────────────────────────────────────────
   · 要自己心算：目標金額 ÷ 油價 ＝ 要加幾公升（500 ÷ 29.8 ≈ 16.78 公升），一邊看公升一邊估。
   · 出油速度會加快：按住 t 秒之後的流量 r(t) = r0 + a×t（公升／秒），累計 L(t) = r0×t + a×t²/2。剛按下慢、後面快，快到目標時一不小心就超過。
     每一關的 r0、a 都不同（出題時先決定「大約按幾秒到目標」T 和「加速的程度」q = a×T÷r0，再反推 r0、a），所以不能靠「記住按幾秒」偷吃步；
     最後的流量上限 RATE_MAX（太快誰也停不準）：超過就把 T 拉長。
   · 畫面上的公升數取到小數 2 位（無條件捨去，像真的加油機）；金額 = 畫面上的公升數 × 油價（玩家用看到的數字就算得出來）。
   · 難度（線性）：容許誤差 ±15 元 → ±0.5 元（TOL，第 25 關）；加速程度 0.4 → 1.5（ACCEL）；目標金額 500 → 300／500／800／1000 都有（第 4 關起）；
     油價第 1～5 關是整數（28／30／32），之後 26.9～33.4 元任意一位小數。
   · 放手時油表的最後一位被「推近」（放大）；撕貼紙揭曉金額與誤差（X.XXXX 元）。加滿（超過目標 60%）就自動停手。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'gaspump'：選單、成績、存檔都靠它；樣式在 css/games/reaction_gaspump.css，裡面的 class 名稱一律以 gaspump- 開頭。 */
    'use strict';

    var ID = 'gaspump';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（企劃寫第 25 關容許誤差 ±0.5 元） */
    var TOL = [15, 0.5];                        /* 容許誤差（元）：第 1 關 → 到頂 */
    var ACCEL = [0.4, 1.5];                     /* 加速的程度 q = a×T÷r0（0＝等速）：第 1 關 → 到頂 */
    var T_RANGE = [6, 9];                       /* 大約按幾秒到目標（秒） */
    var RATE_MAX = 4.0;                         /* 最後的流量上限（公升／秒） */
    var T_MAX = 14;                             /* 為了壓低最後流量，最多把 T 拉長到幾秒 */
    var PRICES_EASY = [28, 30, 32];             /* 前幾關的油價（整數，好算） */
    var EASY_LEVELS = 5;                        /* 前幾關用整數油價 */
    var PRICE_RANGE = [26.9, 33.4];             /* 之後的油價範圍（元／公升） */
    var TARGETS = [300, 500, 800, 1000];        /* 目標金額（元）：第 TARGET_FROM 關之前只有 500 */
    var TARGET_FROM = 4;                            /* 第幾關起目標油量才隨機挑（前面的關卡固定是 500） */
    var OVER = 1.6;                             /* 加到目標的幾倍就自動停手（加滿了） */
    var TIME_S = 30;                            /* 每關限時（秒）：整關的上限，免得一直不按 */
    var FUELS = ['95 無鉛', '92 無鉛', '98 無鉛'];        /* 油品名稱：95 無鉛、92 無鉛、98 無鉛 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function tolFor(level) { return Math.round(kit.ramp(level, TOL[0], TOL[1], RAMP_LEVELS) * 10) / 10; }
    function accelFor(level) { return kit.ramp(level, ACCEL[0], ACCEL[1], RAMP_LEVELS); }
    function timeMs() { return TIME_S * 1000; }
    function round1(v) { return Math.round(v * 10) / 10; }
    /* 按住 t 秒之後累計加了幾公升（流量 r0 + a×t） */
    function litersAt(t, r0, a) { return r0 * t + a * t * t / 2; }
    /* 反過來：累計 L 公升要按幾秒（解二次方程式；a＝0 時是等速） */
    function timeFor(L, r0, a) { return a < 1e-12 ? L / r0 : (-r0 + Math.sqrt(r0 * r0 + 2 * a * L)) / a; }
    /* 畫面上的公升數：取到小數 2 位、無條件捨去（加一點點誤差避免浮點數 16.78 變成 16.7799） */
    function shown(L) { return Math.floor(L * 100 + 1e-9) / 100; }
    /* 放手時的結算：金額 ＝ 畫面公升數 × 油價；diff ＝ 金額 − 目標（正＝多加了） */
    function settle(Lshown, price, target, tol) {
        var amount = Lshown * price, diff = amount - target;
        return { amount: amount, diff: diff, ok: Math.abs(diff) <= tol };
    }
    function fmt4(x) { return x.toFixed(4); }
    /* 出一關：{ fuel, price, target, targetL, r0, a, T, q, tol, maxL, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var price = level <= EASY_LEVELS ? kit.pick(PRICES_EASY, rand) : round1(kit.randFloat(PRICE_RANGE[0], PRICE_RANGE[1], rand));
        var target = level < TARGET_FROM ? 500 : kit.pick(TARGETS, rand);
        var targetL = target / price, q = accelFor(level) * kit.randFloat(0.85, 1.15, rand), T = kit.randFloat(T_RANGE[0], T_RANGE[1], rand);
        var r0 = targetL / (T * (1 + q / 2));
        var rEnd = r0 * (1 + q);
        if (rEnd > RATE_MAX) { T = Math.min(T_MAX, T * rEnd / RATE_MAX); r0 = targetL / (T * (1 + q / 2)); }
        var a = q * r0 / T;
        return { fuel: kit.pick(FUELS, rand), price: price, target: target, targetL: targetL, r0: r0, a: a, T: T, q: q, rEnd: r0 + a * T, tol: tolFor(level), maxL: targetL * OVER, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '加油站大師！';
        if (n >= 12) return '手感很準！';
        if (n >= 7) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先算要加幾公升，再看著數字放手！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'gaspump-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 油槍圖示（SVG）：紅色槍身＋黑色握把＋油管 */
    function gunSvg(parent) {
        var s = kit.svg('svg', { 'class': 'gaspump-gun__icon', viewBox: '0 0 96 64', width: 96, height: 64 }, parent);
        kit.svg('path', { 'class': 'gaspump-gun__hose', d: 'M4 54 Q30 60 38 40' }, s);
        kit.svg('path', { 'class': 'gaspump-gun__body', d: 'M30 18 L66 18 L66 12 L84 12 L84 24 L70 24 L70 44 Q70 52 62 52 L44 52 Q36 52 36 44 L36 30 Z' }, s);
        kit.svg('rect', { 'class': 'gaspump-gun__grip', x: 40, y: 34, width: 22, height: 8, rx: 4 }, s);
        kit.svg('rect', { 'class': 'gaspump-gun__nozzle', x: 84, y: 15, width: 10, height: 6, rx: 3 }, s);
        return s;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[加到五百] 第 ' + level + ' 關：' + q.fuel + ' ' + q.price + ' 元／公升，加 ' + q.target + ' 元（約 ' + q.targetL.toFixed(2) + ' 公升）；流量 ' + q.r0.toFixed(2) + ' → ' + q.rEnd.toFixed(2) + ' 公升／秒（約按 ' + q.T.toFixed(1) + ' 秒）；容許 ±' + q.tol + ' 元');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'gaspump-field' });
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note gaspump-tip', text: '按住加油，覺得剛好就放手' }));
        field.appendChild(h('div', { 'class': 'gaspump-card' }, [
            h('div', { 'class': 'gaspump-card__fuel', text: '今天 ' + q.fuel + '　' + q.price + ' 元／公升' }),
            h('div', { 'class': 'gaspump-card__goal' }, [h('span', { text: '請加 ' }), h('b', { text: String(q.target) }), h('span', { text: ' 元' })]),
            h('div', { 'class': 'gaspump-card__tol', text: '誤差要在 ±' + q.tol + ' 元內' })
        ]));
        /* 加油機的數字面板：黑底黃字 */
        var lit = h('div', { 'class': 'gaspump-digits', text: '0.00' });
        var amountBox = h('div', { 'class': 'gaspump-amount', text: '' });
        var sticker = h('div', { 'class': 'gaspump-sticker', text: '？' });
        var panel = h('div', { 'class': 'gaspump-panel' }, [
            h('div', { 'class': 'gaspump-row' }, [h('div', { 'class': 'gaspump-label', text: '已加' }), lit, h('div', { 'class': 'gaspump-unit', text: '公升' })]),
            h('div', { 'class': 'gaspump-row' }, [h('div', { 'class': 'gaspump-label', text: '金額' }), h('div', { 'class': 'gaspump-amountwrap' }, [amountBox, sticker]), h('div', { 'class': 'gaspump-unit', text: '元' })])
        ]);
        field.appendChild(panel);
        var info = h('div', { 'class': 'qz-note gaspump-info', text: '' });
        field.appendChild(info);
        var gun = h('div', { 'class': 'gaspump-gun' });
        gunSvg(gun); gun.appendChild(h('div', { 'class': 'gaspump-gun__text', text: '按住加油' }));
        field.appendChild(gun);

        var L = 0, t = 0, pumping = false, done = false, loop = null, ctl = null;
        api.timer(timeMs(), function () { release(); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('gaspump.hint')) kit.hintOn(stage, gun, { mode: 'hold', delay: 700, text: '按住加油，剛好就放手' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        ctl = kit.hold(gun, {
            down: function () { if (done || api.over) return; pumping = true; gun.classList.add('gaspump-gun--on'); Sfx.play('click'); loop = api.my.loop(frame); },
            up: function () { if (pumping) release(); }
        });
        function frame(now, dt) {
            if (!pumping || done) return false;
            t += Math.min(dt, 50) / 1000;
            L = litersAt(t, q.r0, q.a);
            if (L >= q.maxL) { L = q.maxL; lit.textContent = shown(L).toFixed(2); release(); return false; }
            lit.textContent = shown(L).toFixed(2);
        }
        /* 放手：鏡頭推近油表最後一位 → 撕貼紙揭曉金額與誤差 */
        function release() {
            if (done || api.over) return;
            done = true; pumping = false; gun.classList.remove('gaspump-gun--on');
            if (loop) loop.stop();
            if (ctl) ctl.destroy();
            var Ls = shown(L), r = settle(Ls, q.price, q.target, q.tol);
            lit.textContent = Ls.toFixed(2); lit.classList.add('gaspump-digits--zoom');
            api.after(650, function () {
                sticker.classList.add('gaspump-sticker--off'); amountBox.textContent = fmt4(r.amount);
                var word = r.diff >= 0 ? '多加了' : '少加了';
                info.textContent = word + ' ' + fmt4(Math.abs(r.diff)) + ' 元' + (r.ok ? '，在範圍內！' : '，超出範圍了');
                amountBox.classList.add(r.ok ? 'gaspump-amount--ok' : 'gaspump-amount--bad');
                kit.flash(stage, r.ok, api.my);
                if (r.ok) { api.pass({ delay: 1700 }); return; }
                api.fail({ delay: 2800, lines: [fmt4(r.amount) + ' 元，' + word + ' ' + fmt4(Math.abs(r.diff)) + ' 元', '容許誤差 ±' + q.tol + ' 元（' + q.target + ' 元 ÷ ' + q.price + ' ＝ ' + (q.target / q.price).toFixed(4) + ' 公升）'] });
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { t = timeFor(q.targetL, q.r0, q.a); L = litersAt(t, q.r0, q.a); lit.textContent = shown(L).toFixed(2); release(); };
        api.wrong = function () { t = timeFor(q.targetL * 0.7, q.r0, q.a); L = litersAt(t, q.r0, q.a); lit.textContent = shown(L).toFixed(2); release(); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '加到五百',
        rule: '加油站的油槍。上面寫著油價和要加多少元。**按住油槍開始加油**，畫面上只顯示「已加幾公升」（一直在跳），金額被蓋住了。要自己心算：**金額 ÷ 油價 ＝ 要加幾公升**。**你覺得剛好就放手**，放手後撕掉貼紙揭曉金額，**誤差在容許範圍內才過關**。小心：出油會越來越快（剛按下慢、後面快），而且每一關快慢都不一樣，快到的時候一不小心就超過了！越後面，容許的誤差越小！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            tolFor: tolFor, accelFor: accelFor, timeMs: timeMs, litersAt: litersAt, timeFor: timeFor, shown: shown, settle: settle, fmt4: fmt4, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TOL: TOL, ACCEL: ACCEL, T_RANGE: T_RANGE, RATE_MAX: RATE_MAX, T_MAX: T_MAX, PRICES_EASY: PRICES_EASY, EASY_LEVELS: EASY_LEVELS, PRICE_RANGE: PRICE_RANGE, TARGETS: TARGETS, TARGET_FROM: TARGET_FROM, OVER: OVER, TIME_S: TIME_S, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
