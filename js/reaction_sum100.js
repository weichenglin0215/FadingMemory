/* ═══════════════════════════════════════════════════════════════════
   reaction_sum100.js — 秒反應・兩張成百（原名湊百消除，V1.25 改名）
   樣式：css/games/reaction_sum100.css（這款專屬的 class 一律以「sum100-」開頭；共用元件在 css/reaction_common.css）
   30 張數字牌（5 欄×6 列），點兩張加起來剛好 100 就消除，全部消完為止。計時，點錯一組罰 3 秒；
   總時間（含罰秒）超過 LIMIT_S（180 秒）就算失敗（不計成績、不送排行榜）。
   介面不顯示「已選合計」（不替你記帳）。成績＝用時（含罰秒，越短越好）。
   ───────────────────────────────────────────────────────────────────
   · 15 對互補數 (a, 100−a)，a 取 A_MIN～A_MAX（11～49），15 個 a 互不相同、也不含 50，
     所以 30 個數字都不同，每個數字的互補數只有一張 → 配對唯一。
   · 陷阱：至少 NEAR_MIN 組「差一點」（不是一對，但加起來是 90 或 110，例如 47＋63）；
     進位算錯的人會被誘導。出題用重抽法，抽不夠就取最多的那一組。
   · 計時從按「開始」才算；點同一張兩次是取消選取。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡，裡面的變數都是這個檔案私有的。
       這是「單回合計時」型遊戲（不是闖關）：用 kit.single 骨架，成績是「用了幾秒」（越小越好）。
       分三段：① 參數區；② 純函式（出牌、算「差一點」的組合）；③ 畫面（mount／setup）。 */
    'use strict';

    var ID = 'sum100';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴（sum100-）都用它 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 秒', label: '用時', min: 0, max: 180 };  /* 成績規格：better:min＝越小越好、decimals:4＝小數 4 位、format 顯示格式、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var PAIRS = 15, A_MIN = 11, A_MAX = 49;     /* 15 對（30 張，5×6）、較小的數在 11～49 */
    var NEAR_MIN = 12;                          /* 至少幾組「差一點」（和是 90 或 110） */
    var LIMIT_S = 180;                          /* 時間限制（秒，含罰秒）：超過就失敗 */
    var PENALTY_MS = 3000;                      /* 每點錯一組罰幾毫秒 */
    var TRIES = 4000;                               /* 出題時最多重抽幾次 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 有幾組「差一點」：不是互補、但和是 90 或 110 */
    /* 數「差一點」的組合有幾組：兩張加起來不是 100、但剛好是 90 或 110（很容易看走眼，算錯的人會點下去） */
    function nearMiss(cards) {
        var n = 0;
        for (var i = 0; i < cards.length; i++) for (var j = i + 1; j < cards.length; j++) {
            var s = cards[i] + cards[j];
            if (s !== 100 && (s === 90 || s === 110)) n++;
        }
        return n;
    }
    /* 出牌：回傳 { cards: [30 個數字（已洗牌）], near } */
    /* 出牌：從 A_MIN～A_MAX 隨機挑 PAIRS 個數字，每個數字 a 配上它的補數 100−a（共 30 張，一定有解），
       洗牌後回傳。為了讓題目夠難，最多重抽 TRIES 次，直到「差一點」的組合達到 NEAR_MIN 組（或用目前最多的）。 */
    function makeBoard(rand) {
        rand = rand || Math.random;
        var best = null;
        for (var t = 0; t < TRIES; t++) {
            var pool = []; for (var a = A_MIN; a <= A_MAX; a++) pool.push(a);
            var picks = kit.shuffle(pool, rand).slice(0, PAIRS), cards = [];  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            picks.forEach(function (a) { cards.push(a, 100 - a); });  /* forEach：對陣列的每個元素各做一次 */
            var near = nearMiss(cards);
            if (!best || near > best.near) best = { cards: cards, near: near };
            if (near >= NEAR_MIN) break;
        }
        return { cards: kit.shuffle(best.cards, rand), near: best.near };
    }
    /* 結算畫面的評語（依用時秒數，越快越好） */
    function rating(sec) {
        if (sec < 40) return '心算快手！';
        if (sec < 70) return '高手！';
        if (sec < 110) return '不錯喔！';
        return '再來一次，會更快！';
    }

    /* 遊戲進場。V1.25 起牌數改成 30 張，舊版最佳紀錄不能比，所以第一次進來清掉（migrateBest 只清一次）；再交給 kit.single 處理計時、結算、最佳紀錄 */
    function mount(root, ctx) {
        /* V1.25 起兩張成百改成 30 張牌（以前湊百消除是 16 張），舊版的最佳紀錄不能比：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v125');
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '點兩張加起來剛好 100 的牌，全部消完（限時 ' + LIMIT_S + ' 秒）',
            numText: function (v) { return v.toFixed(4) + ' 秒'; },
            rating: rating,
            sfx: function (v) { return v < 50 ? 'perfect' : (v < 100 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    /* 遊戲開始前呼叫：出牌、畫牌、碼表與「開始」遮罩。api 是共用骨架給的工具（api.stage 畫面容器、api.finish 結算、api.restart 重玩…） */
    function setup(api) {
        var stage = api.stage, my = api.my;
        var bd = makeBoard(), cards = bd.cards, state = [], sel = -1, remaining = cards.length, errors = 0, started = false, firstBad = null, hint = null;  /* cards：30 張牌的數字；state：每張牌的狀態（on 還在／gone 已消除）；sel：選中的牌（−1＝沒選）；remaining：還剩幾張； errors：點錯幾組；started：已按「開始」；firstBad：第一個點錯的組合（結算時說明）；hint：操作提示 */
        console.log('[兩張成百] 牌面 ' + cards.join(',') + '；差一點的組合 ' + bd.near + ' 組');

        var clockWrap = h('div', { 'class': 'sum100-clock' });
        stage.appendChild(clockWrap);                   /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var clock = kit.clock(clockWrap, my);           /* 碼表（顯示「時間 X.XXXX 秒」）：start 開始、stop 停止、penalty 罰秒、ms 目前毫秒 */
        var grid = h('div', { 'class': 'sum100-grid' });
        var els = cards.map(function (n, i) {           /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var el = h('div', { 'class': 'sum100-card', text: String(n) });
            state.push('on');
            kit.onTap(el, function () { tap(i); });     /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            grid.appendChild(el);
            return el;
        });
        stage.appendChild(grid);
        var info = h('div', { 'class': 'sum100-info', text: '失誤 0 次（每次 + 3 秒）' });
        stage.appendChild(info);
        var over = false;

        /* 按「開始」後：碼表開始跑，並每一幀檢查有沒有超過時間限制（含罰秒）；第一次進遊戲會有手指提示，指在第一組加起來是 100 的牌上 */
        function begin() {
            if (started) return;
            started = true; clock.start();
            /* 時間限制：每一幀檢查（罰秒也算在內），超過就失敗 */
            my.loop(function () { if (over) return false; if (clock.ms() >= LIMIT_S * 1000) timeUp(); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「第一組加起來是 100 的牌」的第一張上 */
            if (kit.once('sum100.hint')) {              /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
                var pa = -1;
                for (var i0 = 0; i0 < cards.length && pa < 0; i0++) for (var j0 = i0 + 1; j0 < cards.length; j0++) if (cards[i0] + cards[j0] === 100) { pa = i0; break; }
                if (pa >= 0) hint = kit.hintOn(stage, els[pa], { mode: 'tap', delay: 300, text: '請點擊兩張加起來是 100 的牌' });
            }
        }
        var cover = kit.startCover(stage, { text: '30 張牌，點兩張加起來剛好 100 就會消除。\n點錯一組加 3 秒，限時 ' + LIMIT_S + ' 秒，全部消完就結束。', onStart: begin });  /* 「準備好了按開始」的遮罩：玩家按下才呼叫 begin（計時從這時才開始） */
        function hideHint() { if (hint) { hint.remove(); hint = null; } }

        /* 點牌：沒開始、已結束、或這張已消除就忽略；點同一張兩次＝取消選取；第一張只是選起來；
           選第二張時：兩張加起來剛好 100 就都消除（全消完就結束）；否則算失誤，兩張閃紅、罰 PENALTY_MS 毫秒。 */
        function tap(i) {
            if (!started || over || state[i] !== 'on') return;
            hideHint();
            if (sel === i) { els[i].classList.remove('sum100-card--sel'); sel = -1; Sfx.play('click'); return; }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            if (sel < 0) { sel = i; els[i].classList.add('sum100-card--sel'); Sfx.play('click'); return; }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            var j = sel; sel = -1;
            if (cards[i] + cards[j] === 100) {
                [i, j].forEach(function (k) { state[k] = 'gone'; els[k].classList.remove('sum100-card--sel'); els[k].classList.add('sum100-card--gone'); });
                remaining -= 2; Sfx.play('ok');
                if (remaining === 0) finish();
            } else {
                errors++;
                if (!firstBad) firstBad = cards[j] + ' ＋ ' + cards[i] + ' ＝ ' + (cards[j] + cards[i]);
                [i, j].forEach(function (k) { els[k].classList.remove('sum100-card--sel'); els[k].classList.add('sum100-card--bad'); });
                my.after(420, function () { [i, j].forEach(function (k) { els[k].classList.remove('sum100-card--bad'); }); });
                clock.penalty(PENALTY_MS); Sfx.play('bad');
                info.textContent = '失誤 ' + errors + ' 次（每次 + 3 秒）';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            }
        }
        /* 超過時間限制：失敗（不計成績、不送排行榜），結算說明還剩幾張沒消 */
        /* 超過時間限制：失敗（不計成績、不送排行榜），結算畫面說明還剩幾張沒消 */
        function timeUp() {
            if (over) return;
            over = true; clock.stop(); Sfx.play('bad');
            info.textContent = '時間到！超過 ' + LIMIT_S + ' 秒';
            my.after(900, function () {
                kit.result(api.root, {                  /* kit.result：顯示結算卡片（成績、評語、再玩一次…），並自動記最佳紀錄、送世界排行榜 */
                    num: '時間到', label: '超過 ' + LIMIT_S + ' 秒，挑戰失敗',
                    lines: ['還有 ' + remaining + ' 張牌沒有消除', '失誤 ' + errors + ' 次，罰時 ' + (errors * PENALTY_MS / 1000).toFixed(4) + ' 秒'],
                    sfx: 'fail', onAgain: function () { api.restart(); }
                });
            });
        }
        /* 全部消完：停碼表，用時（含罰秒）轉成秒當成績；若剛好也超過限制就當失敗 */
        function finish() {
            if (over) return;
            var ms = clock.stop(), sec = ms / 1000;
            if (ms >= LIMIT_S * 1000) { timeUp(); return; }
            over = true;
            my.after(700, function () {
                api.finish(sec, { lines: [
                    '失誤 ' + errors + ' 次，罰時 ' + (errors * PENALTY_MS / 1000).toFixed(4) + ' 秒',
                    firstBad ? '最容易誤判的組合：' + firstBad : '一組都沒配錯！',
                    '個位數加起來湊 10、十位數加起來湊 9，是最快的算法'
                ] });
            });
        }

        /* 找出所有「加起來是 100」的牌對（測試與 debug 的 solve 用） */
        function pairs() {
            var out = [];
            for (var i = 0; i < cards.length; i++) for (var j = i + 1; j < cards.length; j++) if (cards[i] + cards[j] === 100) out.push([i, j]);
            return out;
        }
        /* 給測試／debug 用：start 開始、solve 自動消完所有牌、wrong 故意點錯一組再全部消完 */
        G.debug = {
            state: function () { return { cards: cards, remaining: remaining, errors: errors, started: started }; },
            start: function () { cover.remove(); begin(); },
            solve: function () { cover.remove(); begin(); pairs().forEach(function (p) { tap(p[0]); tap(p[1]); }); },
            wrong: function () {
                cover.remove(); begin();
                var done = false;
                for (var i = 0; i < cards.length && !done; i++) for (var j = i + 1; j < cards.length && !done; j++) if (cards[i] + cards[j] !== 100) { tap(i); tap(j); done = true; }
                pairs().forEach(function (p) { tap(p[0]); tap(p[1]); });
            }
        };
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '兩張成百',
        rule: '30 張數字牌，**每次點兩張，加起來剛好是 100 就會消除**，全部消完為止。畫面不會幫你加總，要自己算！小心「差一點」的組合（例如 47 和 63 是 110）。**點錯一組加 3 秒**，**超過 180 秒就失敗**，用時越短越好。',
        mount: mount,
        score: SCORE,
        test: { nearMiss: nearMiss, makeBoard: makeBoard, rating: rating, PAIRS: PAIRS, A_MIN: A_MIN, A_MAX: A_MAX, NEAR_MIN: NEAR_MIN, PENALTY_MS: PENALTY_MS, LIMIT_S: LIMIT_S }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
