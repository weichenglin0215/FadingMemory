/* ═══════════════════════════════════════════════════════════════════
   reaction_flipten.js — 秒反應・翻牌湊十（深思篇 509「翻牌湊十」）
   樣式：css/games/reaction_flipten.css（class 一律以「flipten-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：數字牌蓋著排成方陣（數字 1～9）。每次翻兩張：**加起來是 10 就消掉；不是就蓋回去。**全部消完就過關。
     **翻牌的次數有上限**（畫面上有「剩 N 次」）。每翻錯一次，兩張牌的數字會露出 SHOW_MS（預設 1.5 秒）再蓋回——
     這是給你看的時間，不是作答的時限；沒有計時，想多久都可以，但要記住它們在哪裡。
   · 頓悟：記位置＋心算互補數（1-9、2-8、3-7、4-6、5-5）。翻到 1 之後，要去找 9 在哪；翻過的牌要記得。
   · 關卡：8 張（第 1～5 關）→ 16 張（第 6～15 關）→ 24 張（第 16 關起；每列 COLS 張，目前每列 6 張＝4 列 × 6 欄）。
   · 翻牌上限 ＝ 「完美記憶策略」在這個牌面要翻的次數 ＋ 寬限（第 1 → 30 關：SLACK 目前是 2 → 12，越後面寬限越多；原本是 12 → 4）。
     完美記憶策略（perfectFlips）：永遠記得每張翻過的牌；只要記得的牌裡有一組湊成十，就翻它們；
     否則翻一張沒翻過的牌（由左上往右下），記得它的互補牌就去翻，不然再翻一張沒翻過的牌。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'flipten'：選單、成績、存檔都靠它；樣式在 css/games/reaction_flipten.css，裡面的 class 名稱一律以 flipten- 開頭。 */
    'use strict';

    var ID = 'flipten';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [{ cards: 6, to: 1 }, { cards: 12, to: 3 },
    { cards: 18, to: 5 }, { cards: 24, to: 8 },
    { cards: 30, to: 11 }, { cards: 36, to: 15 },
    { cards: 42, to: 19 }, { cards: 48, to: 9999 }];     /* 牌的張數與這個階段的最後一關 */
    var COLS = 6;                               /* 每一列幾張 */
    var SLACK = [2, 12];                        /* 寬限：比完美記憶策略多出幾次：第 1 關 → 第 RAMP_LEVELS 關 */
    var RAMP_LEVELS = 30;                           /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var SHOW_MS = 1500;                         /* 翻錯時，兩張牌露出多久才蓋回（毫秒；不是作答時限） */
    var MATCH_MS = 650;                         /* 翻對時，兩張牌停多久才消掉 */
    var PASS_DELAY_MS = 1300;                       /* 答對（過關）後停多久才換下一關（毫秒，1300 毫秒＝1.3 秒） */
    var FAIL_HOLD_MS = 6000;                        /* 答錯（失敗）後停多久才跳出結算畫面（毫秒，6000 毫秒＝6 秒），讓玩家先看清楚答案 */
    var MAX_LEVEL = 200;                            /* 最後一關：過了第 200 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function cardsFor(level) {
        level = Math.max(1, level);
        for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i].cards;
    }
    function slackFor(level) { return Math.round(kit.ramp(level, SLACK[0], SLACK[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 發牌：n 張，一半是「一組一組湊成十」的牌（每組隨機是 1-9、2-8、3-7、4-6、5-5 其中一種），洗牌 */
    function deal(n, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var deck = [];
        for (var i = 0; i < n / 2; i++) { var a = kit.randInt(1, 5, rand); deck.push(a, 10 - a); }  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        return kit.shuffle(deck, rand);                 /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    }
    /* 完美記憶策略要翻幾次（一次＝翻兩張）。deck[i]＝第 i 格的數字 */
    function perfectFlips(deck) {
        var n = deck.length, gone = new Array(n).fill(false), known = new Array(n).fill(false), flips = 0, left = n;  /* new Array(n).fill(v)：建立長度 n、每一格都是 v 的陣列 */
        function knownPair() {
            for (var i = 0; i < n; i++) if (known[i] && !gone[i]) for (var j = i + 1; j < n; j++) if (known[j] && !gone[j] && deck[i] + deck[j] === 10) return [i, j];
            return null;
        }
        function firstUnknown(skip) { for (var i = 0; i < n; i++) if (!known[i] && !gone[i] && i !== skip) return i; return -1; }
        var guard = 0;
        while (left > 0 && guard++ < 1000) {
            var kp = knownPair();
            if (kp) { flips++; gone[kp[0]] = gone[kp[1]] = true; left -= 2; continue; }
            var u = firstUnknown(-1);
            if (u < 0) break;
            known[u] = true;
            /* 它的互補牌已經知道在哪裡？ */
            var mate = -1;
            for (var j = 0; j < n; j++) if (known[j] && !gone[j] && j !== u && deck[j] + deck[u] === 10) { mate = j; break; }
            if (mate >= 0) { flips++; gone[u] = gone[mate] = true; left -= 2; continue; }
            var u2 = firstUnknown(u);
            if (u2 < 0) break;
            known[u2] = true; flips++;
            if (deck[u] + deck[u2] === 10) { gone[u] = gone[u2] = true; left -= 2; }
        }
        return flips;
    }
    function limitFor(level, deck) { return perfectFlips(deck) + slackFor(level); }
    /* 出題函式：依關卡難度與亂數產生這一題的資料（純函式，不碰畫面，單元測試直接測它） */
    function makePuzzle(level, rand) {
        var n = cardsFor(level), deck = deal(n, rand), perfect = perfectFlips(deck);
        return { n: n, deck: deck, perfect: perfect, limit: perfect + slackFor(level), level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '記憶力驚人！';
        if (n >= 12) return '記得很牢！';
        if (n >= 5) return '越來越有感覺了！';
        return '翻到的牌要記住位置，想想它的「互補數」在哪！';
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
        var pz = makePuzzle(level, api.rand), n = pz.n, deck = pz.deck;
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[翻牌湊十] 第 ' + level + ' 關：' + n + ' 張；完美記憶策略 ' + pz.perfect + ' 次，上限 ' + pz.limit + ' 次');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var rows = n / COLS, W = stage.clientWidth || 472, H = stage.clientHeight || 700;
        var cw = Math.floor(W * 0.96 / COLS) - 8, ch = Math.min(Math.floor(cw * 0.95), Math.floor((H - 200) / rows) - 8);  /* Math.floor：無條件捨去成整數 */
        var up = [], gone = new Array(n).fill(false), pairsLeft = n / 2, used = 0, busy = false, over = false, first = -1;  /* new Array(n).fill(v)：建立長度 n、每一格都是 v 的陣列 */

        var wrap = h('div', { 'class': 'flipten-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        var info = h('div', { 'class': 'flipten-info' });
        var board = h('div', { 'class': 'flipten-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.setProperty('--flipten-cols', COLS);  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        board.style.setProperty('--flipten-w', cw + 'px');  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        board.style.setProperty('--flipten-h', ch + 'px');
        var tip = h('div', { 'class': 'flipten-tip', text: '翻兩張：加起來是 10 就消掉' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var cards = [];
        for (var i = 0; i < n; i++) {
            var c = h('div', { 'class': 'flipten-card', text: '' });
            (function (idx) { kit.onTap(c, function () { flip(idx); }); })(i);  /* 用立即執行函式存住這一次迴圈的變數（不這樣寫，每個元素點下去都會拿到迴圈結束時的值） */
            board.appendChild(c); cards.push(c);        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        }
        wrap.appendChild(info); wrap.appendChild(board); wrap.appendChild(tip);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */

        /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
        function paint() {
            info.textContent = '還能翻 ' + Math.max(0, pz.limit - used) + ' 次　已消 ' + (n / 2 - pairsLeft) + '/' + n / 2;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            for (var i = 0; i < n; i++) {
                var show = up.indexOf(i) >= 0 || (over && !gone[i]);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                cards[i].className = 'flipten-card' + (gone[i] ? ' flipten-card--gone' : show ? ' flipten-card--up' : '') + (over && !gone[i] ? ' flipten-card--reveal' : '');
                cards[i].textContent = show && !gone[i] ? String(deck[i]) : '';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            }
        }
        function flip(i) {
            if (busy || over || gone[i] || up.indexOf(i) >= 0) return;  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            up.push(i);
            if (up.length === 1) { first = i; paint(); return; }
            used++; busy = true; paint();
            var a = up[0], b = up[1];
            if (deck[a] + deck[b] === 10) {
                tip.textContent = deck[a] + ' + ' + deck[b] + ' = 10！';
                Sfx.play('ok');                         /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                api.after(MATCH_MS, function () {       /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                    gone[a] = gone[b] = true; up = []; pairsLeft--; busy = false; first = -1; paint();
                    if (pairsLeft === 0) {
                        over = true; paint(); tip.textContent = '全部消完！用了 ' + used + ' 次（完美記憶策略 ' + pz.perfect + ' 次）';
                        kit.flash(stage, true, api.my); api.pass({ delay: PASS_DELAY_MS });  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                    } else if (used >= pz.limit) failNow();
                    else tip.textContent = '翻兩張：加起來是 10 就消掉';
                });
            } else {
                tip.textContent = deck[a] + ' + ' + deck[b] + ' = ' + (deck[a] + deck[b]) + '，不是 10，記住位置！';
                api.after(SHOW_MS, function () {        /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
                    up = []; busy = false; first = -1; paint();
                    if (used >= pz.limit) failNow(); else tip.textContent = '翻兩張：加起來是 10 就消掉';
                });
            }
        }
        function failNow() {
            over = true; busy = true; paint();
            var text = '次數用完了（上限 ' + pz.limit + '）。完美記憶只要 ' + pz.perfect + ' 次，剩下的牌翻開給你看。';
            tip.textContent = text;
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: FAIL_HOLD_MS, lines: [text] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        api.solve = function () {                  /* 驗證用：依完美記憶策略一組一組翻（直接找互補的兩格） */
            if (over) return;
            var idx = [];
            for (var i = 0; i < n; i++) if (!gone[i]) idx.push(i);
            for (var x = 0; x < idx.length; x++) for (var y = x + 1; y < idx.length; y++) {
                if (deck[idx[x]] + deck[idx[y]] === 10) { var a = idx[x], b = idx[y]; busy = false; flip(a); flip(b); return; }
            }
        };
        api.wrong = function () {                  /* 驗證用：故意翻兩張不湊十的牌，直到次數用完 */
            if (over) return;
            for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (!gone[i] && !gone[j] && deck[i] + deck[j] !== 10) { busy = false; flip(i); flip(j); return; }
        };
        api.state = function () { return { used: used, gone: gone.slice(), over: over, busy: busy }; };  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        paint();
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '翻牌湊十',
        rule: '數字牌蓋著排成方陣（數字是 1～9）。**每次翻兩張：加起來是 10 就消掉；不是就蓋回去**。全部消完就過關。**翻牌的次數有上限**，畫面上會寫「還能翻幾次」。翻錯的時候，兩張牌的數字會停 1.5 秒再蓋回——那是給你看的時間，沒有計時，想多久都可以，但要記住它們在哪裡。提示：10 的搭檔是 1-9、2-8、3-7、4-6、5-5；翻到一張牌，就想想它的搭檔在不在你翻過的牌裡。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            STAGES: STAGES, COLS: COLS, SLACK: SLACK, RAMP_LEVELS: RAMP_LEVELS, SHOW_MS: SHOW_MS, cardsFor: cardsFor, slackFor: slackFor, deal: deal,
            perfectFlips: perfectFlips, limitFor: limitFor, makePuzzle: makePuzzle, rating: rating, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
