/* ═══════════════════════════════════════════════════════════════════
   reaction_emojisort.js — 秒反應・分類點擊
   樣式：css/games/reaction_emojisort.css（這款專屬的 class 一律以「emojisort-」開頭；共用元件在 css/reaction_common.css）
   方格裡排滿 emoji，畫面上方只寫「要點的種類」（例如「圓臉😀、動物🐒」），**在時限內把所有屬於這幾類的 emoji 都點掉**。
   點錯一個（點到不是題目種類的）就失敗；時間到了還沒點完也失敗。關卡制，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 五種分類（CATS）：圓臉 😀～🤓、動物 🐒～🐤、水果 🥝～🌰、交通工具 🚗～🛸、人類 👩～💇‍♂️。
     每一類的 emoji 依照 Unicode 的排列順序，從起點取到終點；中間「不是這一類」的符號（例如交通工具那一段裡的路標、紅綠燈、油桶）
     與太新的 emoji（很多手機還顯示不出來）都已經拿掉。水果那一段照你給的範圍（🥝～🌰），所以也包含番茄、茄子、紅蘿蔔這些蔬菜。
   · 方格大小（寬×高，GRID）：2×2、2×3、3×3、3×4、4×4…（寬、高輪流加一），寬最多 10：10×10 之後 10×11、10×12…10×15，一共 22 關。
   · 種類數（KINDS）：第 1 關「1 種要點的＋1 種干擾的」，越後面越多，最多「3 種要點的＋2 種干擾的」（五種分類全部上場）。
     題目只寫要點的種類，不寫干擾的種類。
   · 要點的格子佔整個方格的 TARGET_FRAC（第 1 關 50% → 最後一關 35%）；每一種要點的、每一種干擾的都至少出現一個。
   · 限時：BASE_S ＋ 要點的格數 × PER_TARGET_S（每格 1.4 → 0.75 秒）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'emojisort'：選單、成績、存檔都靠它；樣式在 css/games/reaction_emojisort.css，裡面的 class 名稱一律以 emojisort- 開頭。 */
    'use strict';

    var ID = 'emojisort';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 22 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_W = 10, MAX_H = 15;                         /* 方格最寬 10 格、最高 15 格 */
    var CORRECT_AT = [1, 6, 12];                        /* 要點的種類：第 1 關起 1 種、第 6 關起 2 種、第 12 關起 3 種 */
    var WRONG_AT = [1, 3];                              /* 干擾的種類：第 1 關起 1 種、第 3 關起 2 種 */
    var TARGET_FRAC = [0.5, 0.35];                      /* 要點的格子佔幾成：第 1 關 → 最後一關（線性） */
    var BASE_S = 3;                                     /* 限時：基本秒數 */
    var PER_TARGET_S = [1.4, 0.75];                     /* 限時：每個要點的格子再加幾秒（第 1 關 → 最後一關，線性） */
    var EMOJI_K = 0.72;                                 /* emoji 的大小＝格子邊長的幾倍 */
    var SOLVE_CAP = 99;                                 /* 驗證用（這款每關都能 solve） */
    /* 五種分類：name 題目上的名稱、rep 題目上的代表 emoji、list 這一類的 emoji（依 Unicode 順序，從起點到終點） */
    var CATS = [
        { key: 'face', name: '圓臉', rep: '😀', list: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓'] },
        { key: 'animal', name: '動物', rep: '🐒', list: ['🐒', '🦍', '🦧', '🐶', '🐕', '🦮', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦔', '🦇', '🐻', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🦃', '🐔', '🐓', '🐣', '🐤'] },
        { key: 'fruit', name: '水果', rep: '🥝', list: ['🥝', '🍅', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰'] },
        { key: 'vehicle', name: '交通', rep: '🚗', list: ['🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🛺', '🚲', '🛴', '🛹', '⛵', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸'] },
        { key: 'human', name: '人類', rep: '👩', list: ['👩', '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '💆', '💇', '💇‍♂️'] }
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 第 level 關的方格大小 { w, h }：2×2、2×3、3×3、3×4…（寬、高輪流加一）到 10×10、10×11，之後寬固定 10、高一關加一到 10×15 */
    function gridSize(level) {
        var i = level - 1, n = 2 + Math.floor(i / 2), last = 2 * (MAX_W - 2) + 1;     /* last：寬、高輪流加一的最後一關（10×11）是第幾個（從 0 數） */
        if (i <= last) return { w: n, h: n + (i % 2) };
        return { w: MAX_W, h: Math.min(MAX_H, MAX_W + 1 + (i - last)) };
    }
    /* 一共幾關：方格長到 MAX_W × MAX_H 為止 */
    function maxLevel() { var L = 1; while (gridSize(L).h < MAX_H || gridSize(L).w < MAX_W) L++; return L; }
    var MAX_LEVEL = maxLevel();                         /* 最後一關（10×15，第 22 關） */
    function prog(level) { return Math.min(1, Math.max(0, (level - 1) / (MAX_LEVEL - 1))); }
    function lerp(pair, p) { return pair[0] + (pair[1] - pair[0]) * p; }
    /* 第 level 關有幾種要點的（correct）、幾種干擾的（wrong） */
    function kindsFor(level) {
        var c = 0, w = 0, i;
        for (i = 0; i < CORRECT_AT.length; i++) if (level >= CORRECT_AT[i]) c = i + 1;
        for (i = 0; i < WRONG_AT.length; i++) if (level >= WRONG_AT[i]) w = i + 1;
        return { correct: c, wrong: w };
    }
    /* 限時（毫秒）：基本秒數＋要點的格數 × 每格秒數 */
    function timeMs(level, targets) { return Math.round((BASE_S + targets * lerp(PER_TARGET_S, prog(level))) * 1000); }
    /* 題目文字（只寫要點的種類）：「圓臉😀、動物🐒」 */
    function promptOf(cats) { return cats.map(function (c) { return c.name + c.rep; }).join('、'); }  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
    /* 出一關：{ level, w, h, cells: [{ ch, cat（分類 key）, ok（是不是要點的）}]（由左上往右、往下排）, correct: [分類], wrong: [分類], targets, ms } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var sz = gridSize(level), n = sz.w * sz.h, k = kindsFor(level), order = kit.shuffle(CATS.slice(), rand);  /* kit.shuffle(陣列, rand)：把陣列順序隨機打亂 */
        var correct = order.slice(0, k.correct), wrong = order.slice(k.correct, k.correct + k.wrong);
        var targets = Math.round(n * lerp(TARGET_FRAC, prog(level)));
        targets = Math.max(k.correct, Math.min(n - k.wrong, targets));
        var cells = [], i;
        /* 每一種至少一個，其餘隨機分給同一組的種類 */
        function fill(cats, count, ok) {
            for (i = 0; i < count; i++) { var c = i < cats.length ? cats[i] : kit.pick(cats, rand); cells.push({ ch: kit.pick(c.list, rand), cat: c.key, ok: ok }); }  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        }
        fill(correct, targets, true); fill(wrong, n - targets, false);
        cells = kit.shuffle(cells, rand);
        return { level: level, w: sz.w, h: sz.h, cells: cells, correct: correct, wrong: wrong, targets: targets, ms: timeMs(level, targets) };
    }
    /* 某個 emoji 屬於哪一類（找不到回傳 null） */
    function catOf(ch) { for (var i = 0; i < CATS.length; i++) if (CATS[i].list.indexOf(ch) >= 0) return CATS[i].key; return null; }  /* indexOf：找元素在陣列裡的位置，找不到回傳 −1 */
    /* 結算評語 */
    function rating(n) {
        if (n >= MAX_LEVEL) return '分類大師，全破！';
        if (n >= 16) return '眼明手快！';
        if (n >= 10) return '分得很清楚！';
        if (n >= 5) return '越來越熟練了！';
        return '先看清楚題目要點哪幾類！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, stageClass: 'emojisort-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var q = makeLevel(api.level, api.rand), left = q.targets, over = false;
        api.info = { q: q, get left() { return left; } };
        console.log('[分類點擊] 第 ' + q.level + ' 關 ' + q.w + '×' + q.h + '：點「' + promptOf(q.correct) + '」（干擾：' + promptOf(q.wrong) + '），要點 ' + q.targets + ' 格，限時 ' + (q.ms / 1000).toFixed(1) + ' 秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var top = h('div', { 'class': 'emojisort-prompt' }, [h('span', { 'class': 'emojisort-prompt__t', text: '請點：' }), h('span', { 'class': 'emojisort-prompt__c', text: promptOf(q.correct) })]);
        if (q.correct.length >= 3) top.classList.add('emojisort-prompt--long');   /* 三種的題目比較長：字縮小一點才放得下 */
        stage.appendChild(top);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        api.setInfo('還有 ' + left + ' 個');
        /* 方格：格子邊長＝放得下的最大正方形 */
        var PAD = 10, TOP = 70, cell = Math.floor(Math.min((W - PAD * 2) / q.w, (H - TOP - PAD) / q.h));  /* Math.floor：無條件捨去成整數 */
        var gw = cell * q.w, gh = cell * q.h, grid = h('div', { 'class': 'emojisort-grid' });
        grid.style.cssText = 'left:' + Math.round((W - gw) / 2) + 'px;top:' + Math.round(TOP + (H - TOP - PAD - gh) / 2) + 'px;width:' + gw + 'px;height:' + gh + 'px;';
        stage.appendChild(grid);
        var els = q.cells.map(function (c, i) {
            var el = h('div', { 'class': 'emojisort-cell', text: c.ch });
            el.style.cssText = 'left:' + (i % q.w) * cell + 'px;top:' + Math.floor(i / q.w) * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;font-size:' + Math.round(cell * EMOJI_K) + 'px;line-height:' + cell + 'px;';
            kit.onTap(el, function () { tap(i); });     /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用） */
            grid.appendChild(el);
            return el;
        });
        if (api.level === 1 && kit.once('emojisort.hint')) { var first = q.cells.findIndex(function (c) { return c.ok; }); kit.hintOn(stage, els[first], { mode: 'tap', delay: 500, text: '題目寫的種類都要點掉' }); }  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        api.timer(q.ms, function () { finish(null); }); /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        var done = [];
        function tap(i) {
            if (over || api.over || done[i]) return;
            var c = q.cells[i];
            if (!c.ok) { els[i].classList.add('emojisort-cell--bad'); finish(i); return; }  /* classList.add：加上 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            done[i] = true; left--; els[i].classList.add('emojisort-cell--ok'); Sfx.play('pop');  /* Sfx.play(名稱)：播放音效（音效是程式即時合成的） */
            api.setInfo('還有 ' + left + ' 個');
            if (left <= 0) { over = true; kit.flash(stage, true, api.my); api.pass({ delay: 700 }); }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
        }
        /* 失敗：bad＝點錯的格子（時間到是 null）；沒點到的正確格子圈出來 */
        function finish(bad) {
            if (over) return;
            over = true;
            q.cells.forEach(function (c, i) { if (c.ok && !done[i]) els[i].classList.add('emojisort-cell--miss'); });  /* forEach：對陣列的每個元素各做一次 */
            var why = bad == null ? '時間到了！還有 ' + left + ' 個沒點到' : '「' + q.cells[bad].ch + '」是' + CATS.filter(function (c) { return c.key === q.cells[bad].cat; })[0].name + '，不是' + promptOf(q.correct) + '！';  /* filter：留下符合條件的元素，回傳新陣列 */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 2600, lines: [why, '這一關要點：' + promptOf(q.correct) + '（干擾：' + promptOf(q.wrong) + '）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝點完所有正確的格子；wrong＝點一個干擾的格子 */
        api.solve = function () { q.cells.forEach(function (c, i) { if (c.ok) tap(i); }); };
        api.wrong = function () { var i = q.cells.findIndex(function (c) { return !c.ok; }); if (i >= 0) tap(i); };  /* findIndex：找第一個符合條件的元素位置，找不到回傳 −1 */
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '分類點擊',
        rule: '方格裡排滿各種 emoji：圓臉、動物、水果、交通工具、人類。畫面上方寫著這一關要點的種類，例如「圓臉😀、動物🐒」，**在時間內把屬於這幾類的全部點掉**。**點錯一個就失敗**，時間到了還沒點完也失敗。第一關是 2×2 的方格，一關比一關大，最後是 10×15；種類也越來越多，最多要同時找 3 種，還混著 2 種干擾的！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            gridSize: gridSize, maxLevel: maxLevel, kindsFor: kindsFor, timeMs: timeMs, promptOf: promptOf, makeLevel: makeLevel, catOf: catOf, rating: rating,
            MAX_W: MAX_W, MAX_H: MAX_H, CORRECT_AT: CORRECT_AT, WRONG_AT: WRONG_AT, TARGET_FRAC: TARGET_FRAC, BASE_S: BASE_S, PER_TARGET_S: PER_TARGET_S, EMOJI_K: EMOJI_K, CATS: CATS, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
