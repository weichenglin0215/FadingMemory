/* ═══════════════════════════════════════════════════════════════════
   reaction_twinsock.js — 秒反應・雙胞胎襪子（原企劃「057 找出雙胞胎襪子」的復活版）
   樣式：css/games/reaction_twinsock.css（這款專屬的 class 一律以「twinsock-」開頭；共用元件在 css/reaction_common.css）
   一格一格的襪子，左上角那隻是「目標」（不會轉動，格子底色跟別人不一樣）；
   其餘的襪子都在慢慢轉動，其中恰好有一隻跟目標「一模一樣」（底色、條紋數、圓點數都相同），點出它。
   關卡制：答錯或逾時就結束，成績＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   · 格數（寬×高）：第 1 關 2×3，之後 2×4、3×4、3×5、4×5，第 6 關起固定 4×6（最後的難度）。
   · 其他襪子（假的）跟目標只差「一個參數」：底色色相、腿上的條紋數、腳上的圓點數，三擇一，差多少隨關卡線性縮小
     （色相差 HUE_DELTA 90°→18°、條紋／圓點數差 COUNT_DELTA 3→1）。真的雙胞胎三個參數全部相同。
   · 轉速：SPIN 從 10°／秒（很慢）線性加快到 110°／秒；每隻轉的方向與初始角度隨機。
   · 限時：TIME_S 30 秒 → 12 秒（線性）。
   · 轉動用 CSS 動畫（animation），不靠 JS 每影格更新，所以很順、也不會因為分頁暫停而亂掉。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'twinsock'：選單、成績、存檔都靠它；樣式在 css/games/reaction_twinsock.css，裡面的 class 名稱一律以 twinsock- 開頭。 */
    'use strict';

    var ID = 'twinsock';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var SIZES = [[2, 3], [2, 4], [3, 4], [3, 5], [4, 5], [4, 6]];     /* 第 1～6 關的格數（寬×高），之後維持最後一個 */
    var HUE_DELTA = [90, 18];                   /* 假襪子跟目標的底色色相差（度） */
    var COUNT_DELTA = [3, 1];                   /* 條紋數／圓點數差 */
    var SPIN = [10, 110];                       /* 轉速（度／秒） */
    var TIME_S = [30, 12];                      /* 每關限時（秒） */
    var MAX_COUNT = 6;                          /* 條紋、圓點最多幾個 */
    var GAP = 10;                               /* 格子間距（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeAt(level) { return SIZES[Math.min(SIZES.length, level) - 1]; }
    function hueDelta(level) { return kit.ramp(level, HUE_DELTA[0], HUE_DELTA[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function countDelta(level) { return Math.round(kit.ramp(level, COUNT_DELTA[0], COUNT_DELTA[1], RAMP_LEVELS)); }  /* Math.round：四捨五入成整數 */
    function spinAt(level) { return kit.ramp(level, SPIN[0], SPIN[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function key(p) { return Math.round(p.hue) + '/' + p.stripes + '/' + p.dots; }
    function same(a, b) { return Math.round(a.hue) === Math.round(b.hue) && a.stripes === b.stripes && a.dots === b.dots; }
    /* 一隻「只改一個參數」的假襪子：改色相／條紋數／圓點數三擇一，改的量由關卡決定，而且一定跟目標不一樣 */
    function variant(target, level, rand) {
        var what = kit.pick(['hue', 'stripes', 'dots'], rand), p = { hue: target.hue, stripes: target.stripes, dots: target.dots }, sign = rand() < 0.5 ? 1 : -1;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        if (what === 'hue') p.hue = (target.hue + sign * hueDelta(level) * kit.randFloat(1, 1.35, rand) + 360) % 360;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        else {
            var d = Math.max(1, countDelta(level)), v = target[what] + sign * d;
            if (v < 0 || v > MAX_COUNT) v = target[what] - sign * d;
            p[what] = v;
        }
        return p;
    }
    /* 出題：回傳 { cols, rows, socks:[{hue,stripes,dots, spin（度／秒，含方向）, delay（秒，負數＝一開始轉到哪）}], twin（雙胞胎的格子編號，1 起）, target } ；socks[0] 是目標 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var sz = sizeAt(level), n = sz[0] * sz[1];
        var target = { hue: kit.randFloat(0, 360, rand), stripes: kit.randInt(0, MAX_COUNT, rand), dots: kit.randInt(0, MAX_COUNT, rand) };  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        var twin = kit.randInt(1, n - 1, rand), socks = [];
        for (var i = 0; i < n; i++) {
            var p = i === 0 || i === twin ? { hue: target.hue, stripes: target.stripes, dots: target.dots } : variant(target, level, rand);
            var sp = spinAt(level) * kit.randFloat(0.75, 1.25, rand), dur = 360 / sp;
            p.spin = i === 0 ? 0 : (rand() < 0.5 ? 1 : -1) * sp;
            p.dur = i === 0 ? 0 : dur;
            p.delay = i === 0 ? 0 : -kit.randFloat(0, dur, rand);
            socks.push(p);
        }
        return { cols: sz[0], rows: sz[1], socks: socks, twin: twin, target: target };
    }
    /* 襪子 SVG（100×130）：腿＋腳的剪影，條紋畫在腿上、圓點畫在腳上；每個 SVG 的 clipPath id 要不一樣 */
    function sockSvg(p, uid) {
        var base = 'hsl(' + p.hue.toFixed(1) + ',62%,56%)', light = 'hsl(' + p.hue.toFixed(1) + ',70%,86%)', patch = 'hsl(' + ((p.hue + 180) % 360).toFixed(1) + ',55%,42%)';
        var clip = '<clipPath id="tw' + uid + '"><rect x="30" y="6" width="40" height="84" rx="8"/><rect x="12" y="70" width="80" height="46" rx="23"/></clipPath>';
        var body = '<g clip-path="url(#tw' + uid + ')"><rect x="0" y="0" width="100" height="130" fill="' + base + '"/>';
        var i;
        for (i = 0; i < p.stripes; i++) body += '<rect x="0" y="' + (14 + i * 7) + '" width="100" height="3.6" fill="' + light + '"/>';
        var spots = [[26, 86], [40, 100], [54, 86], [68, 100], [40, 74], [60, 74], [76, 86], [24, 104]];
        for (i = 0; i < p.dots && i < spots.length; i++) body += '<circle cx="' + spots[i][0] + '" cy="' + spots[i][1] + '" r="3.6" fill="' + light + '"/>';
        body += '<circle cx="25" cy="98" r="11" fill="' + patch + '"/><circle cx="82" cy="100" r="12" fill="' + patch + '"/></g>';
        var outline = '<rect x="30" y="6" width="40" height="84" rx="8" fill="none" stroke="#4A3B1E" stroke-width="3"/><rect x="12" y="70" width="80" height="46" rx="23" fill="none" stroke="#4A3B1E" stroke-width="3"/>';
        return '<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg"><defs>' + clip + '</defs>' + body + outline + '</svg>';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '襪子之神！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '先看清楚目標的顏色、條紋、圓點，再來找！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            stageClass: 'twinsock-stage',
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[雙胞胎襪子] 第 ' + level + ' 關：' + q.cols + '×' + q.rows + '；雙胞胎在第 ' + (q.twin + 1) + ' 格；轉速約 ' + spinAt(level).toFixed(1) + '°／秒；色相差 ' + hueDelta(level).toFixed(1) + '°、數量差 ' + countDelta(level) + '；限時 ' + timeMs(level) + ' ms；' + q.socks.map(key).join(' | '));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var tip = h('div', { 'class': 'twinsock-tip', text: '找出和左上角（藍底）一樣的襪子' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var TOP = 56, availH = H - TOP;
        var cell = Math.floor(Math.min((W - GAP * (q.cols - 1)) / q.cols, (availH - GAP * (q.rows - 1)) / q.rows));  /* Math.floor：無條件捨去成整數 */
        var gx = Math.round((W - (q.cols * cell + (q.cols - 1) * GAP)) / 2), gy = TOP + Math.round((availH - (q.rows * cell + (q.rows - 1) * GAP)) / 2);
        var cells = q.socks.map(function (s, i) {       /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var el = h('div', { 'class': 'twinsock-cell' + (i === 0 ? ' twinsock-cell--target' : '') });
            el.style.width = el.style.height = cell + 'px';
            el.style.left = (gx + (i % q.cols) * (cell + GAP)) + 'px'; el.style.top = (gy + Math.floor(i / q.cols) * (cell + GAP)) + 'px';
            var inner = h('div', { 'class': 'twinsock-sock', html: sockSvg(s, level + '_' + i) });
            if (i > 0) {
                inner.style.animationDuration = s.dur.toFixed(2) + 's';
                inner.style.animationDelay = s.delay.toFixed(2) + 's';
                inner.style.animationDirection = s.spin < 0 ? 'reverse' : 'normal';
                inner.classList.add('twinsock-sock--spin');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            }
            el.appendChild(inner);
            if (i > 0) kit.onTap(el, function () { judge(i); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            stage.appendChild(el);
            return el;
        });
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「和目標一模一樣的那一隻」上（第一關的正確答案） */
        if (level === 1 && kit.once('twinsock.hint')) kit.hintOn(stage, cells[q.twin], { mode: 'tap', delay: 400, text: '請點擊和左上角一樣的襪子' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        var done = false;
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (done || api.over) return;
            done = true; api.stopTimer();
            var ok = i === q.twin;
            cells[q.twin].classList.add('twinsock-cell--ok');
            if (i >= 0 && !ok) cells[i].classList.add('twinsock-cell--bad');
            if (ok) { api.pass({ gain: 1, delay: 700 }); return; }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            api.fail({ delay: 1500, lines: [i < 0 ? '時間到了' : '點到不一樣的襪子了', '只要底色、條紋數、圓點數有一個不同就不是雙胞胎'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        api.timer(timeMs(level), function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.twin); };
        api.wrong = function () { judge(q.twin === 1 ? 2 : 1); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '雙胞胎襪子',
        rule: '左上角有一隻不會動的目標襪子（藍色底）。其他襪子都在慢慢轉動，其中**只有一隻跟目標「完全一樣」**（**底色、腿上的條紋數、腳上的圓點數都相同**），其他的至少有一處不同。找出它並點下去！格子會從 2×3 一路增加到 4×6，轉得也越來越快，時間有限，答錯就結束。',
        mount: mount,
        score: SCORE,
        test: { sizeAt: sizeAt, hueDelta: hueDelta, countDelta: countDelta, spinAt: spinAt, timeMs: timeMs, variant: variant, makeLevel: makeLevel, same: same, key: key, sockSvg: sockSvg, SIZES: SIZES, MAX_COUNT: MAX_COUNT, SPIN: SPIN, HUE_DELTA: HUE_DELTA, COUNT_DELTA: COUNT_DELTA, TIME_S: TIME_S, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
