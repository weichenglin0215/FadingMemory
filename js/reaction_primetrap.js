/* ═══════════════════════════════════════════════════════════════════
   reaction_primetrap.js — 秒反應・質數陷阱
   樣式：css/games/reaction_primetrap.css（這款專屬的 class 一律以「primetrap-」開頭；共用元件在 css/reaction_common.css）
   畫面中央出現一個數字，下方左邊按鈕「合數（非質數）」、右邊按鈕「質數」。
   關卡制，答錯或逾時就結束，成績＝連續答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 範圍隨題號擴大：第 1～8 題 11～60、第 9～20 題 11～150、第 21 題起 101～300（排除 0 與 1）。
   · 質數與合數各約一半；同一類最多連續 SAME_MAX 次。
   · 陷阱合數：最小質因數 ≥ 7 的合數（49、77、91、119、143…），不能被 2、3、5 整除，看起來像質數。
     陷阱合數佔合數題目的比例 TRAP_START → TRAP_END（線性）；偶數與 5 的倍數只在前期出現。
   · 限時 TIME_S 4.0→1.5 秒（線性）。答錯顯示因數分解（91 ＝ 7 × 13）。
   · V1.25：所有字放大（數字 220px、說明 40px、按鈕 40px）；失敗時錯誤資訊（因數分解、為什麼會看錯）在畫面上停留
     FAIL_MS（5 秒）才跳出結算彈窗／前 30 名彈窗，讓玩家看清楚錯在哪。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'primetrap'：選單、成績、存檔都靠它；樣式在 css/games/reaction_primetrap.css，裡面的 class 名稱一律以 primetrap- 開頭。 */
    'use strict';

    var ID = 'primetrap';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '連續答對', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾題之後難度到頂 */
    var TIME_S = [4.0, 1.5];                    /* 每題限時（秒） */
    var TRAP_START = 0.2, TRAP_END = 0.8;       /* 陷阱合數佔合數題的比例 */
    var MAX_LEVEL = 90, SAME_MAX = 4;               /* MAX_LEVEL：最後一關，過了第 90 關就算全破（也是成績的上限）；SAME_MAX：同一個答案（都是或都不是）最多連續幾次 */
    var FAIL_MS = 5000;                         /* 失敗後錯誤資訊停留多久才結算 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function isPrime(n) {
        if (n < 2) return false;
        for (var i = 2; i * i <= n; i++) if (n % i === 0) return false;
        return true;
    }
    function spf(n) { for (var i = 2; i * i <= n; i++) if (n % i === 0) return i; return n; }
    function factorText(n) {
        var f = [], m = n;
        for (var p = 2; p * p <= m; p++) while (m % p === 0) { f.push(p); m = m / p; }
        if (m > 1) f.push(m);
        return n + ' ＝ ' + f.join(' × ');
    }
    function rangeFor(level) { return level <= 8 ? [11, 60] : (level <= 20 ? [11, 150] : [101, 300]); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function trapFrac(level) { return kit.ramp(level, TRAP_START, TRAP_END, RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 範圍內的數字池：質數、陷阱合數（最小質因數 ≥ 7）、一般合數 */
    var poolCache = {};
    function poolsFor(level) {
        var r = rangeFor(level), key = r[0] + '-' + r[1];
        if (poolCache[key]) return poolCache[key];
        var p = { primes: [], traps: [], plain: [] };
        for (var n = r[0]; n <= r[1]; n++) {
            if (isPrime(n)) p.primes.push(n);
            else if (spf(n) >= 7) p.traps.push(n);
            else p.plain.push(n);
        }
        return (poolCache[key] = p);
    }
    /* 這一題要不要質數：一半一半，連續太多次就換邊 */
    function nextPrime(hist, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = hist.length;
        if (n >= SAME_MAX) {
            var last = hist[n - 1], same = true;
            for (var i = 1; i <= SAME_MAX; i++) if (hist[n - i] !== last) { same = false; break; }
            if (same) return !last;
        }
        return rand() < 0.5;
    }
    /* 出題：回傳 { n, prime, trap }；prev 是上一題的數字（不連續出現同一個） */
    function makeQuestion(level, rand, wantPrime, prev) {
        rand = rand || Math.random;
        var pools = poolsFor(level);
        if (wantPrime == null) wantPrime = rand() < 0.5;
        var branchTrap = !wantPrime && pools.traps.length > 0 && (pools.plain.length === 0 || rand() < trapFrac(level));
        for (var t = 0; t < 50; t++) {
            var n, trap = false;
            if (wantPrime) n = kit.pick(pools.primes, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            else if (branchTrap) { n = kit.pick(pools.traps, rand); trap = true; }  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            else {
                /* 一般合數：前期偶數、5 的倍數多；越後面這類「太容易」的數字越少（被抽到時有一定機率重抽） */
                n = kit.pick(pools.plain, rand);
                var easy = n % 2 === 0 || n % 5 === 0;
                if (easy && rand() < kit.ramp(level, 0, 0.7, RAMP_LEVELS)) continue;
            }
            if (n === prev) continue;
            return { n: n, prime: isPrime(n), trap: trap };
        }
        return { n: wantPrime ? 53 : 91, prime: wantPrime, trap: !wantPrime };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 40) return '質數雷達！';
        if (n >= 25) return '高手！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '多看幾次，陷阱就記住了！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        var hist = [], prev = null;
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8,
            head: function (lv) { return '第 ' + lv + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['連續答對 ' + S.cleared + ' 題']; },
            setup: function (api) { if (api.level === 1) { hist.length = 0; prev = null; } setup(api, hist, function (n) { prev = n; }, prev); }
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api, hist, setPrev, prev) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeQuestion(level, api.rand, nextPrime(hist, api.rand), prev);
        hist.push(q.prime); setPrev(q.n);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[質數陷阱] 第 ' + level + ' 題：' + q.n + '（' + (q.prime ? '質數' : (q.trap ? '陷阱合數 ' : '合數 ') + factorText(q.n)) + '），限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var num = h('div', { 'class': 'primetrap-num', text: String(q.n) });
        var note = h('div', { 'class': 'primetrap-note' });
        var why = h('div', { 'class': 'primetrap-why' });
        stage.appendChild(num); stage.appendChild(note); stage.appendChild(why);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var bComp = h('button', { 'class': 'btn btn--primary primetrap-btn', html: '合數<small>（非質數）</small>' });
        var bPrime = h('button', { 'class': 'btn btn--go primetrap-btn', text: '質數' });
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bComp, bPrime]));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        api.timer(timeMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(sayPrime) {
            if (api.over) return;
            var text = q.prime ? q.n + ' 是質數' : factorText(q.n);
            note.textContent = text;                    /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (sayPrime === q.prime) {
                num.classList.add('primetrap-num--ok'); /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                api.pass({ delay: 600 });               /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            } else {
                num.classList.add('primetrap-num--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                note.classList.add('primetrap-note--bad');
                why.textContent = (sayPrime == null ? '時間到！' : '答錯了：') + q.n + (q.prime ? ' 是質數' : ' 不是質數') + (q.trap ? '\n它不能被 2、3、5 整除，看起來像質數，其實是合數' : '');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                api.fail({ delay: FAIL_MS, lines: [     /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                    (sayPrime == null ? '時間到！' : '答錯了：') + q.n + (q.prime ? ' 是質數' : ' 不是質數'),
                    text,
                    q.trap ? '它不能被 2、3、5 整除，看起來像質數，其實是合數' : ''
                ].filter(function (x) { return x; }) });  /* filter：留下符合條件的元素，回傳新陣列 */
            }
        }
        kit.onTap(bPrime, function () { judge(true); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(bComp, function () { judge(false); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.prime); };
        api.wrong = function () { judge(!q.prime); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '質數陷阱',
        rule: '畫面中央有一個數字，**判斷它是「質數」還是「合數」**。小心：**91、77、119 這些數字長得像質數，其實是合數**！答錯或來不及就結束，看你能連續答對幾題。越後面，數字越大、時間越短。',
        mount: mount,
        score: SCORE,
        test: { FAIL_MS: FAIL_MS, isPrime: isPrime, spf: spf, factorText: factorText, rangeFor: rangeFor, timeMs: timeMs, trapFrac: trapFrac, poolsFor: poolsFor, nextPrime: nextPrime, makeQuestion: makeQuestion, rating: rating, RAMP_LEVELS: RAMP_LEVELS, TRAP_START: TRAP_START, TRAP_END: TRAP_END, MAX_LEVEL: MAX_LEVEL, SAME_MAX: SAME_MAX }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
