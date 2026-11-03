/* ═══════════════════════════════════════════════════════════════════
   reaction_sushi.js — 秒反應・迴轉壽司（企劃 393）
   樣式：css/games/reaction_sushi.css（這款專屬的 class 一律以「sushi-」開頭；共用元件在 css/reaction_common.css）
   迴轉壽司的輸送帶。**盤子的顏色代表價格**（白 30、紅 40、藍 60、金 100；第 10 關起加 50 元的綠盤），**價目表一直貼在畫面上**。
   上方寫「**預算剛好 280 元**」。**盤子從輸送帶經過時，點它就拿下來**；拿下來的盤子疊在旁邊（只看得到最上面一個，**總金額不會顯示**）。
   輸送帶轉完一圈（時間條跑完），或你按「夠了」，**拿的盤子要剛好是預算**才過關；多了、少了都失敗。輸送帶不會停，要邊算邊決定。
   ───────────────────────────────────────────────────────────────────
   · 一圈的盤子（makeLevel）：這一圈依序有 L 個盤子（8 → 24）。出題時**先挑好一組「剛好湊得出預算」的盤子**（m 個，3 → 9），
     預算＝這組的價錢總和，所以**一定有解**；這組盤子分散在整圈（不會全擠在開頭或最後一個）。其他盤子是干擾（隨機的價錢），
     所以後面的盤子不一定湊得出——拿太晚就湊不到。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：每圈盤子數 8 → 24、要湊的盤子數 3 → 9（預算越大）、盤子之間的間隔 1.2 → 0.7 秒（輸送帶速度 130 → 330 px／秒）、
     第 10 關起多了 50 元的綠盤（顏色多一種）。
   · 拿盤子：盤子在畫面上（已經進來、還沒出去）時，點到它就拿下來。點空白的地方沒有作用。
   · 揭曉：拿的盤子攤開，一盤一盤累加「3 盤共 130 元…290 元，多了 10 元」；並寫出一種剛好湊得出預算的拿法。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'sushi'：選單、成績、存檔都靠它；樣式在 css/games/reaction_sushi.css，裡面的 class 名稱一律以 sushi- 開頭。 */
    'use strict';

    var ID = 'sushi';                                   /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var PLATES = [8, 24];                      /* 一圈有幾個盤子：第 1 關 → 到頂（四捨五入） */
    var PICK = [3, 9];                          /* 要湊的盤子數（解的大小）：第 1 關 → 到頂（四捨五入） */
    var GAP_S = [1.2, 0.7];                     /* 相鄰兩個盤子經過同一點的間隔（秒）：第 1 關 → 到頂 */
    var SPEED = [130, 330];                     /* 輸送帶的速度（px／秒）：第 1 關 → 到頂 */
    var PRICE_BASE = [30, 40, 60, 100];         /* 一開始的價錢：白、紅、藍、金 */
    var PRICE_LATER = [30, 40, 50, 60, 100];    /* 第 LATER_FROM 關起多了 50 元的綠盤 */
    var LATER_FROM = 10;                            /* 第幾關起改用後面那組盤子價錢（PRICE_LATER） */
    var PLATE_D = 76;                           /* 盤子的直徑（px） */
    var HIT_PAD = 8;                            /* 點盤子的容許範圍（px） */
    var LEAD_S = 0.8;                           /* 開場先等多久，第一個盤子才從右邊進來（秒） */
    var END_PAD_S = 0.6;                        /* 最後一個盤子離開畫面之後，多等一下才算「轉完一圈」 */
    var SOLVE_CAP = 99;                             /* 解題搜尋的上限（目前程式裡沒有用到這個設定） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var COLOR_OF = { 30: 'white', 40: 'red', 50: 'green', 60: 'blue', 100: 'gold' };  /* 盤子價錢對應的顏色 class：30 白、40 紅、50 綠、60 藍、100 金 */
    var COLOR_NAME = { 30: '白', 40: '紅', 50: '綠', 60: '藍', 100: '金' };  /* 盤子價錢對應的顏色中文名稱 */
    var SUSHI = ['salmon', 'egg', 'shrimp'];        /* 壽司的種類：鮭魚、玉子、蝦子 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function platesFor(level) { return Math.round(ramp(level, PLATES)); }  /* Math.round：四捨五入成整數 */
    function pickFor(level) { return Math.min(Math.round(ramp(level, PICK)), platesFor(level) - 2); }  /* Math.round：四捨五入成整數 */
    function gapFor(level) { return Math.round(ramp(level, GAP_S) * 1000) / 1000; }
    function speedFor(level) { return Math.round(ramp(level, SPEED)); }
    function pricesFor(level) { return level >= LATER_FROM ? PRICE_LATER : PRICE_BASE; }
    /* 出一關：{ level, prices（這一關的價錢表）, plates（依序經過的盤子：[{ price, sushi }]）, solution（剛好湊得出預算的盤子編號，由小到大）, target（預算）, gap, speed, laps（整圈的毫秒數） } */
    function makeLevel(level, rand, W) {
        rand = rand || Math.random; W = W || 472;
        var L = platesFor(level), m = pickFor(level), prices = pricesFor(level), gap = gapFor(level), speed = speedFor(level), plates = [], i;
        for (i = 0; i < L; i++) plates.push({ price: kit.pick(prices, rand), sushi: kit.pick(SUSHI, rand) });  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        /* 解：m 個盤子，分散在整圈（不挑最後一個盤子；把 0～L−2 分成 m 段，每段挑一個），價錢總和＝預算 */
        var sol = [], seg = (L - 1) / m;
        for (i = 0; i < m; i++) { var lo = Math.floor(i * seg), hi = Math.max(lo, Math.min(L - 2, Math.floor((i + 1) * seg) - 1)); sol.push(kit.randInt(lo, hi, rand)); }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        sol = sol.filter(function (v, k) { return sol.indexOf(v) === k; }).sort(function (a, b) { return a - b; });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        var target = 0; sol.forEach(function (k) { target += plates[k].price; });  /* forEach：對陣列的每個元素各做一次 */
        return { level: level, prices: prices, plates: plates, solution: sol, target: target, gap: gap, speed: speed, lap: lapMs(L, gap, speed, W) };
    }
    /* 輸送帶「轉完一圈」要多久（毫秒）：第一個盤子 LEAD_S 秒後才從右邊進來；最後一個盤子（第 L−1 個）進來之後還要走過整個畫面才離開 */
    function lapMs(L, gap, speed, W) { return Math.round((LEAD_S + (L - 1) * gap + (W + PLATE_D) / speed + END_PAD_S) * 1000); }
    /* 第 i 個盤子在 t 秒時的 x 座標（盤子中心）：從畫面右邊外面（W ＋ PLATE_D/2）進來，往左走 */
    function plateX(i, t, gap, speed, W) { return W + PLATE_D / 2 - speed * (t - LEAD_S - i * gap); }
    /* 這個盤子在 t 秒時有沒有在畫面上（可以點） */
    function visibleAt(i, t, gap, speed, W) { var x = plateX(i, t, gap, speed, W); return x >= -PLATE_D / 4 && x <= W + PLATE_D / 4; }
    /* 拿了 taken（盤子編號的集合）的總金額與判定：{ sum, result: 'ok'｜'few'｜'many', diff } */
    function judge(q, taken) {
        var s = 0; taken.forEach(function (k) { s += q.plates[k].price; });  /* forEach：對陣列的每個元素各做一次 */
        return { sum: s, result: s === q.target ? 'ok' : (s < q.target ? 'few' : 'many'), diff: s - q.target };
    }
    /* 有幾種拿法剛好湊到預算（動態規劃，只用來測試和說明；盤子不多） */
    function countSolutions(q) {
        var ways = {}; ways[0] = 1;
        q.plates.forEach(function (p) { var nw = {}; Object.keys(ways).forEach(function (s) { nw[s] = (nw[s] || 0) + ways[s]; var t = +s + p.price; if (t <= q.target) nw[t] = (nw[t] || 0) + ways[s]; }); ways = nw; });
        return ways[q.target] || 0;
    }
    function whyText(r, q) {
        if (r.result === 'ok') return '剛剛好 ' + q.target + ' 元！';
        if (r.result === 'few') return '拿了 ' + r.sum + ' 元，預算 ' + q.target + ' 元——少了 ' + (-r.diff) + ' 元';
        return '拿了 ' + r.sum + ' 元，預算 ' + q.target + ' 元——多了 ' + r.diff + ' 元';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '迴轉壽司達人！';
        if (n >= 9) return '心算很快！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '看價目表、邊拿邊加！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'sushi-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一個盤子（div）：圓盤（顏色依價錢）、中間一塊壽司（鮭魚／玉子／蝦），不顯示價錢——價錢要看價目表 */
    function plateEl(p, mini) {
        var el = h('div', { 'class': 'sushi-plate sushi-p' + COLOR_OF[p.price] + (mini ? ' sushi-plate--mini' : '') });
        el.appendChild(h('div', { 'class': 'sushi-rice' })); el.appendChild(h('div', { 'class': 'sushi-top sushi-top--' + p.sushi }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        return el;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var q = makeLevel(level, api.rand, W);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[迴轉壽司] 第 ' + level + ' 關：預算 ' + q.target + ' 元；一圈 ' + q.plates.length + ' 盤（' + q.plates.map(function (p) { return p.price; }).join(',') + '）；剛好的拿法（盤子編號） ' + q.solution.join(',') + '；速度 ' + q.speed + ' px/秒、間隔 ' + q.gap + ' 秒；一圈 ' + q.lap + ' 毫秒；共 ' + countSolutions(q) + ' 種湊法');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var field = h('div', { 'class': 'sushi-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 價目表：一直貼在畫面上 */
        var legend = h('div', { 'class': 'sushi-legend' });
        q.prices.forEach(function (pr) { var it = h('div', { 'class': 'sushi-legend__i' }); it.appendChild(h('div', { 'class': 'sushi-dot sushi-p' + COLOR_OF[pr] })); it.appendChild(h('div', { 'class': 'sushi-legend__t', text: pr + '元' })); legend.appendChild(it); });
        field.appendChild(legend);
        var goal = h('div', { 'class': 'sushi-goal' });
        goal.appendChild(h('span', { 'class': 'sushi-goal__t', text: '預算剛好 ' })); goal.appendChild(h('span', { 'class': 'sushi-goal__n', text: String(q.target) })); goal.appendChild(h('span', { 'class': 'sushi-goal__t', text: ' 元' }));
        field.appendChild(goal);
        /* 輸送帶與盤子 */
        var beltTop = 190, belt = h('div', { 'class': 'sushi-belt' }); belt.style.top = (beltTop + PLATE_D / 2 + 4) + 'px'; field.appendChild(belt);
        var lane = h('div', { 'class': 'sushi-lane' }); lane.style.cssText = 'top:' + beltTop + 'px;height:' + PLATE_D + 'px;'; field.appendChild(lane);
        var els = q.plates.map(function (p, i) { var el = plateEl(p, false); el.style.cssText = 'width:' + PLATE_D + 'px;height:' + PLATE_D + 'px;display:none;'; el.dataset.i = String(i); lane.appendChild(el); return el; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var taken = [], phase = 'play', stackBox = h('div', { 'class': 'sushi-stack' });
        stackBox.style.cssText = 'left:24px;top:' + (beltTop + PLATE_D + 40) + 'px;'; stackBox.appendChild(h('div', { 'class': 'sushi-stack__t', text: '拿下來的' })); var stackTop = h('div', { 'class': 'sushi-stack__top' }); stackBox.appendChild(stackTop); field.appendChild(stackBox);
        var info = h('div', { 'class': 'qz-note sushi-info', text: level === 1 ? '盤子經過時點它拿下來，剛好湊到預算！' : '邊拿邊加，剛好就按「夠了」' }); info.style.top = (beltTop + PLATE_D + 150) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '夠了！', kind: 'primary', cls: 'sushi-btn', onTap: function () { finish('done'); } }], { cols: 1, h: 92, bottom: 12 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        if (level === 1 && kit.once('sushi.hint')) api.after(Math.round((LEAD_S + 0.8) * 1000), function () { if (phase === 'play') kit.hintOn(stage, null, { mode: 'tap', x: W * 0.62, y: lane.offsetTop + PLATE_D / 2, delay: 200, text: '盤子經過時點它' }); });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        var t0 = performance.now();                     /* performance.now()：高精度的時間（毫秒），計時用 */
        function nowS() { return (performance.now() - t0) / 1000; }  /* performance.now()：高精度的時間（毫秒），計時用 */
        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint(t) {
            q.plates.forEach(function (p, i) {
                if (taken.indexOf(i) >= 0) return;      /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                var x = plateX(i, t, q.gap, q.speed, W);
                if (!visibleAt(i, t, q.gap, q.speed, W) && (x < 0 || x > W + PLATE_D)) { els[i].style.display = 'none'; return; }
                els[i].style.display = 'block'; els[i].style.transform = 'translate3d(' + (x - PLATE_D / 2).toFixed(1) + 'px,0,0)';
            });
        }
        api.my.loop(function (now) { if (phase !== 'play' || api.over || !stage.isConnected) return false; paint(nowS()); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
        api.timer(q.lap, function () { finish('lap'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 拿盤子：點到盤子（比外框多 HIT_PAD）就拿下來 */
        lane.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (phase !== 'play' || api.over) return;
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            var r = lane.getBoundingClientRect(), px = e.clientX - r.left, t = nowS(), best = -1, bd = 1e9;  /* getBoundingClientRect：取得元素在螢幕上的位置與大小（算點擊位置、版面用） */
            q.plates.forEach(function (p, i) { if (taken.indexOf(i) >= 0 || !visibleAt(i, t, q.gap, q.speed, W)) return; var d = Math.abs(px - plateX(i, t, q.gap, q.speed, W)); if (d <= PLATE_D / 2 + HIT_PAD && d < bd) { bd = d; best = i; } });  /* Math.abs：取絕對值（去掉負號） */
            if (best >= 0) take(best);
        });
        function take(i) {
            if (phase !== 'play' || taken.indexOf(i) >= 0) return;
            taken.push(i); els[i].style.display = 'none'; Sfx.play('click');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            stackTop.innerHTML = ''; stackTop.appendChild(plateEl(q.plates[i], true));  /* innerHTML = ''：把元素裡面的東西全部清掉 */
        }
        /* 結束：攤開拿的盤子，一盤一盤累加；寫出一種剛好的拿法 */
        function finish(kind) {
            if (phase !== 'play' || api.over) return;
            phase = 'end'; api.stopTimer();
            var r = judge(q, taken), why = whyText(r, q);
            btn.btns[0].classList.add('sushi-btn--off'); lane.style.display = 'none'; belt.style.display = 'none'; stackBox.style.display = 'none';  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            showSpread();
            info.textContent = why; info.style.top = ''; info.style.bottom = '116px';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (r.result === 'ok') { info.classList.add('sushi-info--ok'); kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 2200 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            info.classList.add('sushi-info--bad'); kit.flash(stage, false, api.my);  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            var way = q.solution.map(function (k) { return q.plates[k].price; }).join('＋') + ' ＝ ' + q.target;  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            api.fail({ delay: 4400, lines: [why, '一種剛好的拿法（第 ' + q.solution.map(function (k) { return k + 1; }).join('、') + ' 個盤子）：' + way, '你拿了 ' + taken.length + ' 盤：' + (taken.length ? taken.slice().sort(function (a, b) { return a - b; }).map(function (k) { return q.plates[k].price; }).join('＋') : '（沒拿）') + ' ＝ ' + r.sum] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        function showSpread() {
            var box = h('div', { 'class': 'sushi-spread' }); box.style.top = '170px';
            var list = taken.slice().sort(function (a, b) { return a - b; }), cols = 5, cw = Math.floor((W - 24 - (cols - 1) * 6) / cols), run = 0;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            if (!list.length) box.appendChild(h('div', { 'class': 'sushi-spread__none', text: '一個盤子都沒拿' }));
            list.forEach(function (k) {
                run += q.plates[k].price; var cell = h('div', { 'class': 'sushi-cell' }), m = plateEl(q.plates[k], true); m.style.cssText = 'position:relative;width:' + cw + 'px;height:' + cw + 'px;';
                cell.appendChild(m); cell.appendChild(h('div', { 'class': 'sushi-cell__p', text: q.plates[k].price + '元' })); cell.appendChild(h('div', { 'class': 'sushi-cell__s', text: String(run) })); cell.style.width = cw + 'px'; box.appendChild(cell);
            });
            field.appendChild(box);
        }
        /* 驗證用：在每個「剛好那一組」的盤子剛進到畫面的時間拿下來，全部拿完就按「夠了」（solve，不真的點）；wrong＝拿一個不在解裡的盤子再按夠了；可重複呼叫（只排一次） */
        var armed = false;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () {
            if (armed || phase !== 'play') return; armed = true;
            q.solution.forEach(function (k, n) { var tk = LEAD_S + k * q.gap + (PLATE_D / 2 + 50) / q.speed;          /* 盤子剛進到畫面（離右邊緣 50px）就拿，驗證才不會等太久 */ api.after(Math.max(0, Math.round((tk - nowS()) * 1000)), function () { take(k); if (n === q.solution.length - 1) api.after(120, function () { finish('done'); }); }); });
        };
        api.wrong = function () { if (armed || phase !== 'play') return; armed = true; api.after(300, function () { finish('done'); }); };  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '迴轉壽司',
        rule: '迴轉壽司的輸送帶，**盤子的顏色代表價格**（白 30、紅 40、藍 60、金 100，價目表貼在上面）。上面寫著預算（例如「剛好 280 元」）。**盤子經過時點它就拿下來**，拿下來的疊在旁邊，只看得到最上面一個，總金額不顯示。輸送帶轉完一圈（或你按「夠了」），**拿的盤子要剛好是預算**。輸送帶不會停，要邊算邊決定，拿太晚就湊不到。**第 10 關起多了 50 元的綠盤**。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            platesFor: platesFor, pickFor: pickFor, gapFor: gapFor, speedFor: speedFor, pricesFor: pricesFor, makeLevel: makeLevel, lapMs: lapMs, plateX: plateX, visibleAt: visibleAt, judge: judge, countSolutions: countSolutions, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PLATES: PLATES, PICK: PICK, GAP_S: GAP_S, SPEED: SPEED, PRICE_BASE: PRICE_BASE, PRICE_LATER: PRICE_LATER, LATER_FROM: LATER_FROM, PLATE_D: PLATE_D, HIT_PAD: HIT_PAD, LEAD_S: LEAD_S, MAX_LEVEL: MAX_LEVEL, COLOR_OF: COLOR_OF
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
