/* ═══════════════════════════════════════════════════════════════════
   reaction_forestpeek.js — 秒反應・草叢找動物
   樣式：css/games/reaction_forestpeek.css（這款專屬的 class 一律以「forestpeek-」開頭；共用元件在 css/reaction_common.css）
   一整片草原，長滿一叢一叢、開著各色花朵的低矮灌木（不規則地散布），小動物會不定時在灌木後面冒出來、跑一小段又躲回去。
   **看到小動物就點牠**，點到一隻得 1 分。限時 TIME_S（60）秒，成績＝一共點到幾隻（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · 畫面（canvas）：整片草原（沒有天空、沒有樹），由上到下 ROWS 排灌木，越下面越靠近你。每一排的小動物會被「自己這一排」與「前面那一排」的灌木擋住，
     **只能從灌木之間的空隙看到牠的一部分**（灌木比小動物高、排得很密，看不到整隻）；牠從地面冒出來（POP_S 秒）、橫著跑一小段、再沉下去（POP_S 秒）。
   · 每一叢灌木是一團大小不一的葉球＋葉片紋理＋好幾朵不同顏色的花（BUSH_*、FLOWERS、COL.flower），開場時各畫成一張小圖，之後每一格只要貼圖，手機也跑得動。
   · 小動物除了原本的顏色，還蓋上一層淡淡的綠色（TINT），跟灌木混在一起更難分辨。
   · 出場前先試幾條路線（VIS_TRIES），用像素算出沿路「最多露出幾成」，挑落在 VIS（一成多～五成）之間的：一定看得到一部分、但看不到整隻。
   · 難度跟著「分數」走（LEVEL_RAMP＝30 分到頂，線性）：出現的間隔 INTERVAL_S 1.2 → 0.3 秒、同時出現的隻數 1 → 3（ALIVE_AT：0／6／18 分）、
     露臉的時間 SHOW_S 2.0 → 0.8 秒、跑的速度 SPEED 60 → 180 px／秒。
   · 跟著「時間」走（60 秒內線性）：小動物的大小 SIZE_PX 60 → 20 px（越後面越小、越難點）。
     前 HINT_S（10）秒是新手期：小動物出現時，牠身邊的灌木會用力晃動，刻意提醒你牠在哪裡。
   · 小動物的圖（V1.47，玩家意見）：iPhone 上動物的大小只剩約一半，幾乎看不到從縫隙冒出來的動物。原因是動物原本用「字型 emoji」畫在 canvas 上，
     每個平台的 emoji 字型大小與畫法不同（iPhone 的 emoji 還比較寫實）。現在改成貼 PNG 圖片：事先在電腦的瀏覽器把動物畫下來（背景透明），
     存在 img/emoji/emoji.png，用 js/emoji_png.js 的 EP.draw 貼上去，再蓋淡綠色——每個平台的大小、樣子都一樣。圖集載好才開始遊戲；載入失敗就退回文字 emoji。
   · 點擊判定：點在小動物中心 HIT_K × 大小 ＋ HIT_PAD 的範圍內就算點到（被灌木擋住的部分也算），露出不到 30% 的時候不算。點到空白處沒有懲罰。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'forestpeek'：選單、成績、存檔都靠它；樣式在 css/games/reaction_forestpeek.css，裡面的 class 名稱一律以 forestpeek- 開頭。 */
    'use strict';

    var ID = 'forestpeek';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 隻', label: '找到幾隻', min: 1, max: 200 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var TIME_S = 60;                                    /* 限時幾秒 */
    var LEVEL_RAMP = 30;                                /* 幾分之後難度到頂 */
    var INTERVAL_S = [1.2, 0.3];                        /* 兩隻小動物出現的平均間隔（秒）：0 分 → 到頂（每次再乘 0.7～1.3 的隨機倍率） */
    var ALIVE_AT = [0, 6, 18];                          /* 同時最多幾隻：0 分起 1 隻、6 分起 2 隻、18 分起 3 隻 */
    var SHOW_S = [2.0, 0.8];                            /* 每隻露臉的時間（秒，含冒出來與沉下去）：0 分 → 到頂 */
    var SPEED = [60, 180];                              /* 橫著跑的速度（px／秒）：0 分 → 到頂（每隻再乘 0.8～1.2） */
    var SIZE_PX = [60, 20];                             /* 小動物的大小（px）：第 0 秒 → 第 60 秒（線性變小） */
    var HINT_S = 10;                                    /* 前幾秒，小動物身邊的灌木會用力晃動（提醒你） */
    var POP_S = 0.18;                                   /* 冒出來、沉下去各要幾秒 */
    var HIT_K = 0.6, HIT_PAD = 10;                      /* 點擊範圍：中心 HIT_K × 大小 ＋ HIT_PAD px 以內 */
    var ROWS = 7;                                       /* 幾排灌木 */
    var ROW_TOP = 0.13, ROW_BOTTOM = 0.98;              /* 第一排與最後一排灌木的地面位置（畫面高度的比例；整片都是草原，從很上面就開始） */
    var BUSH_W = [56, 124];                             /* 一叢灌木的寬度（px，隨機） */
    var BUSH_H = [0.8, 1.15];                           /* 一叢灌木的高度＝排距的幾倍（隨機；比 1 大就會蓋到後面那一排的下半部） */
    var BUSH_GAP = [-22, 6];                            /* 相鄰兩叢之間的距離（px，負的＝互相重疊）：排得很密，只留小縫 */
    var HOLE_P = 0.25, HOLE_W = [10, 22];               /* 偶爾留一個比較大的空隙：機率、寬度（px） */
    var BUSH_DY = 10;                                   /* 每一叢的地面位置上下隨機偏移（px），看起來不規則、不是排成一直線 */
    var RISE = 0.68;                                    /* 小動物冒出來的高度：中心在地面上方「大小 × RISE」（越大露得越多） */
    var VIS = [0.12, 0.5];                              /* 每隻小動物最多露出幾成：要在這個範圍內（太少＝根本看不到、太多＝看到整隻）；出場前先試幾條路線挑一條符合的 */
    var VIS_TRIES = 8;                                  /* 最多試幾條路線 */
    var FLOWERS = [3, 9];                               /* 每一叢開幾朵花（隨機） */
    var TINT = 'rgba(70, 150, 60, 0.30)';               /* 蓋在小動物身上的淡綠色（最後一個數字＝濃淡，0～1） */
    var PLUS_MS = 800;                                  /* 「+1」字樣飄多久 */
    var SOLVE_CAP = 15;                                 /* 驗證用：api.solve 最多幫你點到幾隻 */
    var MAX_LEVEL = 1;                                  /* 只有一局（成績用 scoreOf＝點到幾隻） */
    /* 小動物（emoji；重複的已經拿掉） */
    var ANIMALS = ['😺', '😸', '🐵', '🐶', '🐺', '🐱', '🦁', '🐯', '🦒', '🦊', '🦝', '🐮', '🐷', '🐼', '🐸', '🦓', '🐴', '🦄', '🐔', '🐕‍🦺', '🐕', '🐈', '🐆', '🦌', '🦏', '🐂', '🐄', '🐖', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦘', '🦨', '🐘', '🦔', '🐇', '🐿', '🦎', '🐍', '🐉', '🦕', '🐠', '🐡', '🐓', '🦅', '🦢', '🦜', '🦩', '🦉', '🐦', '🐧', '🐤'];
    /* 畫布用的顏色（canvas 不能直接用 CSS 變數，所以寫在這裡） */
    var COL = {
        meadow: '#86BE63', meadow2: '#4F8C3A', tuft: ['#6FAE50', '#5C9C44', '#9ACB72'], shadow: 'rgba(20, 50, 15, 0.35)',
        leaf: ['#2C6427', '#357430', '#41853A', '#4F9744', '#5FA84F', '#73B95E'],      /* 灌木的葉子：越下面越深、越上面越亮 */
        flower: ['#F25C7A', '#FFD23F', '#FFFFFF', '#B784F0', '#FF8C42', '#5CC8F2', '#E8433A', '#FF9ECF', '#7B6CF0', '#F7F0A0'], center: ['#FFD23F', '#8A5A2B', '#FFF4C2'],
        ink: '#2E2A1E', plus: '#FFD23F'
    };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(score) { return Math.min(1, Math.max(0, score / LEVEL_RAMP)); }
    function lerp(pair, p) { return pair[0] + (pair[1] - pair[0]) * p; }
    /* 難度（輸入＝目前分數）：{ interval（秒）, alive（同時最多幾隻）, show（露臉秒數）, speed（px／秒）} */
    function diffFor(score) {
        var p = prog(score), alive = 0;
        for (var i = 0; i < ALIVE_AT.length; i++) if (score >= ALIVE_AT[i]) alive = i + 1;
        return { interval: lerp(INTERVAL_S, p), alive: alive, show: lerp(SHOW_S, p), speed: lerp(SPEED, p) };
    }
    /* 小動物的大小（輸入＝已經過了幾秒） */
    function sizeFor(t) { return lerp(SIZE_PX, Math.min(1, Math.max(0, t / TIME_S))); }
    /* 這個時間點，草會不會晃動提醒你 */
    function hintOn(t) { return t < HINT_S; }
    /* 挑一隻小動物（不跟上一隻一樣） */
    function pickAnimal(rand, last) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var a; do { a = kit.pick(ANIMALS, rand); } while (a === last && ANIMALS.length > 1);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return a;
    }
    /* 排一隻小動物的路線：從 x0 往 dir 方向跑 speed × show，整段都要在畫面裡（離左右邊至少半隻） */
    function planPath(W, size, speed, show, rand) {
        rand = rand || Math.random;
        var dir = rand() < 0.5 ? 1 : -1, len = Math.min(speed * show, W - size * 1.2), lo = size * 0.6, hi = W - size * 0.6 - len;
        var start = kit.randFloat(lo, Math.max(lo, hi), rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return { dir: dir, x0: dir > 0 ? start : start + len, len: len, speed: len / show };
    }
    /* 一隻小動物在第 age 秒：露出多少（0～1）、在哪裡（x） */
    function poseAt(a, age) {
        var rise = Math.min(1, age / POP_S), sink = Math.min(1, (a.show - age) / POP_S), up = Math.max(0, Math.min(rise, sink));
        var run = Math.max(0, Math.min(age, a.show));
        return { up: up, x: a.x0 + a.dir * a.speed * run, done: age >= a.show };
    }
    /* 點在 (x, y)：點到哪一隻？list 是 [{ x, y, size, up }]；取離中心最近、在範圍內、而且露出 30% 以上的那一隻；沒有回傳 −1 */
    function hitAnimal(list, x, y) {
        var best = -1, bd = 1e9;
        list.forEach(function (a, i) {                 /* forEach：對陣列的每個元素各做一次 */
            if (a.up < 0.3) return;
            var d = Math.hypot(a.x - x, a.y - y);
            if (d <= a.size * HIT_K + HIT_PAD && d < bd) { bd = d; best = i; }
        });
        return best;
    }
    /* 一排灌木的位置：從畫面左邊外面排到右邊外面，寬度、高度、間距都隨機（大多互相重疊，偶爾留一個空隙），地面位置上下錯開。
       gap＝排距（px）。回傳 [{ x 中心, y 地面, w 寬, h 高 }] */
    function layoutRow(W, base, gap, rand) {
        rand = rand || Math.random;
        var out = [], x = -BUSH_W[0] * 0.4 - rand() * 20;
        while (x < W + BUSH_W[0] * 0.4) {
            var w = kit.randFloat(BUSH_W[0], BUSH_W[1], rand), hh = gap * kit.randFloat(BUSH_H[0], BUSH_H[1], rand);
            out.push({ x: x + w / 2, y: base + (rand() - 0.5) * 2 * BUSH_DY, w: w, h: hh });
            x += w + kit.randFloat(BUSH_GAP[0], BUSH_GAP[1], rand);
            if (rand() < HOLE_P) x += kit.randFloat(HOLE_W[0], HOLE_W[1], rand);
        }
        return out;
    }
    /* 草叢第 r 排的地面高度（px） */
    function rowY(H, r) { return H * (ROW_TOP + (ROW_BOTTOM - ROW_TOP) * r / (ROWS - 1)); }
    /* 結算評語 */
    function rating(n) {
        if (n >= 45) return '森林之眼！';
        if (n >= 30) return '眼明手快！';
        if (n >= 18) return '很會找喔！';
        if (n >= 8) return '再專心一點！';
        return '盯著草叢，看哪裡在動！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把流程（結算、最佳紀錄）交給共用骨架 kit.run；只有一局，成績用 scoreOf（S.score＝點到幾隻）。 */
    function mount(root, ctx) {
        function go() {
            kit.run(root, ctx, {
                id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 15, stageClass: 'forestpeek-stage', resume: false,
                head: function () { return '草叢找動物'; },
                info: function (S) { return '找到 ' + S.score + ' 隻'; },
                scoreOf: function (S) { return S.score; },
                numText: function (v) { return v + ' 隻'; },
                rating: rating,
                lines: function (S) { return ['60 秒內一共找到 ' + S.score + ' 隻小動物']; },
                setup: setup
            });
        }
        var EP = Reaction.emojiPng;
        if (!EP) { go(); return; }
        /* 動物的圖集（約 2 MB）載好才開始，不然限時已經在跑、動物卻出不來。載入失敗也照樣開始（退回文字 emoji） */
        root.appendChild(h('div', { 'class': 'rx-tip', text: '載入圖片…' }));
        EP.load(function () { if (root.isConnected) { root.innerHTML = ''; go(); } });   /* isConnected：這個畫面還在不在（玩家等不及先離開了，就不用開始） */
    }

    /* setup(api)：遊戲開始時呼叫一次，把畫面建出來、開始動畫迴圈並處理點擊。 */
    function setup(api) {
        var stage = api.stage, S = api.S, rand = api.rand;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'forestpeek-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);    /* Math.round：四捨五入成整數 */
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d'); g.scale(dpr, dpr);

        var PAD = 12;                                   /* 灌木小圖四周多留的邊（葉子、花會超出灌木的外框一點點） */
        var rows = [], r, rowGap = rowY(H, 1) - rowY(H, 0);
        for (r = 0; r < ROWS; r++) rows.push(makeRow(r));
        var bg = makeMeadow();
        var animals = [], floats = [], rings = [], clock = 0, nextAt = 0.8, last = null, over = false, started = false;
        S.score = 0; api.setInfo('找到 0 隻');
        api.info = { get animals() { return animals; }, get clock() { return clock; }, get score() { return S.score; } };
        console.log('[草叢找動物] 開始：' + ROWS + ' 排草叢，難度 ' + JSON.stringify(diffFor(0)) + ' → ' + JSON.stringify(diffFor(LEVEL_RAMP)));  /* 在瀏覽器主控台（按 F12）印出設定，方便除錯 */
        if (kit.once('forestpeek.hint')) kit.hintOn(stage, null, { mode: 'tap', x: W * 0.5, y: H * 0.6, delay: 600, text: '小動物冒出來就點牠' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        api.timer(TIME_S * 1000, timeUp);               /* 開始倒數（畫面上方的時間條）：時間到就呼叫 timeUp */
        started = true;

        /* 第 r 排灌木：位置用 layoutRow 排好，每一叢先畫成一張小圖（之後每一格只要貼圖） */
        function makeRow(ri) {
            var base = rowY(H, ri);
            var bushes = layoutRow(W, base, rowGap, rand).map(function (b) { b.ph = rand() * 6.28; b.spr = makeBush(b.w, b.h); return b; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            return { base: base, bushes: bushes };
        }
        /* 小圖用的畫布（照螢幕的像素密度放大，才不會糊） */
        function sprite(w, hh) { var c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(hh * dpr); var x = c.getContext('2d'); x.scale(dpr, dpr); return { c: c, g: x, w: w, h: hh }; }
        /* 一叢灌木：底下一塊陰影、一團大小不一的葉球（下面深、上面亮）、葉片紋理、好幾朵不同顏色的花 */
        function makeBush(w, hh) {
            var s = sprite(w + PAD * 2, hh + PAD * 2), b = s.g, i, k;
            b.translate(PAD + w / 2, PAD + hh);         /* 原點移到灌木的地面中心，往上是負的 */
            b.fillStyle = COL.shadow; b.beginPath(); b.ellipse(0, -2, w * 0.52, 7, 0, 0, Math.PI * 2); b.fill();
            var n = 9 + Math.round(w / 9), blobs = [];
            for (i = 0; i < n; i++) {
                var u = rand() * 2 - 1, r = w * kit.randFloat(0.13, 0.24, rand), top = hh * (1 - 0.3 * u * u);   /* 中間高、兩邊矮的圓頂 */
                blobs.push({ x: u * (w / 2 - r * 0.7), y: -Math.max(r * 0.7, Math.min(top - r, r * 0.7 + rand() * (top - r * 1.4))), r: r });
            }
            blobs.push({ x: -w * 0.22, y: -hh * 0.22, r: w * 0.26 }, { x: w * 0.22, y: -hh * 0.22, r: w * 0.26 }, { x: 0, y: -hh * 0.5, r: Math.min(w * 0.3, hh * 0.45) });   /* 中間下半部一定塞滿 */
            blobs.sort(function (p, q) { return q.y - p.y; });   /* 下面的先畫，上面的蓋在上面 */
            blobs.forEach(function (o) {                /* forEach：對陣列的每個元素各做一次 */
                var lv = Math.min(COL.leaf.length - 1, Math.max(0, Math.floor(-o.y / hh * (COL.leaf.length - 1) + rand() * 1.5)));
                b.fillStyle = COL.leaf[lv]; b.beginPath(); b.arc(o.x, o.y, o.r, 0, Math.PI * 2); b.fill();
                for (k = 0; k < 7; k++) {               /* 葉片：一圈小橢圓，讓外框凹凸不平 */
                    var a = rand() * Math.PI * 2, d = o.r * kit.randFloat(0.55, 1.02, rand);
                    b.fillStyle = COL.leaf[Math.min(COL.leaf.length - 1, lv + (rand() < 0.5 ? 1 : 0))];
                    b.beginPath(); b.ellipse(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, o.r * 0.32, o.r * 0.17, a + 1.2, 0, Math.PI * 2); b.fill();
                }
            });
            var nf = Math.round(kit.randFloat(FLOWERS[0], FLOWERS[1] + 0.99, rand) - 0.5);
            for (i = 0; i < nf; i++) {                  /* 花：開在葉球的上半部 */
                var o2 = blobs[Math.floor(rand() * blobs.length)], fa = -Math.PI * kit.randFloat(0.1, 0.9, rand), fd = o2.r * kit.randFloat(0.3, 0.85, rand);
                drawFlower(b, o2.x + Math.cos(fa) * fd, o2.y + Math.sin(fa) * fd, kit.randFloat(3.5, 6.5, rand), kit.pick(COL.flower, rand), kit.pick(COL.center, rand));
            }
            return s;
        }
        function drawFlower(b, x, y, r, c, mid) {
            var n = rand() < 0.5 ? 5 : 6, ph = rand() * 6.28;
            b.fillStyle = c;
            for (var k = 0; k < n; k++) { var a = ph + k * Math.PI * 2 / n; b.beginPath(); b.ellipse(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.7, r * 0.45, a, 0, Math.PI * 2); b.fill(); }
            b.fillStyle = mid; b.beginPath(); b.arc(x, y, r * 0.45, 0, Math.PI * 2); b.fill();
        }
        /* 草原的底圖：上淺下深的綠，加上很多短短的小草（只是紋理，不會擋住小動物） */
        function makeMeadow() {
            var s = sprite(W, H), b = s.g, gr = b.createLinearGradient(0, 0, 0, H);
            gr.addColorStop(0, COL.meadow); gr.addColorStop(1, COL.meadow2);
            b.fillStyle = gr; b.fillRect(0, 0, W, H);
            for (var i = 0; i < 520; i++) {
                var x = rand() * W, y = rand() * H, l = 3 + rand() * 5 * (0.6 + y / H);
                b.strokeStyle = kit.pick(COL.tuft, rand); b.lineWidth = 1.2; b.beginPath(); b.moveTo(x, y); b.lineTo(x + (rand() - 0.5) * 3, y - l); b.stroke();
            }
            return s;
        }
        /* 小動物的圖：emoji 的 PNG 貼圖（V1.47，見 js/emoji_png.js；平台字型不同、iPhone 上會變小的問題就不會發生），再蓋一層淡淡的綠色（只蓋在 emoji 有顏色的地方：source-atop） */
        function makeAnimal(ch, size) {
            var d = Math.ceil(size * 1.35), s = sprite(d, d), b = s.g, EP = Reaction.emojiPng;
            if (!(EP && EP.draw(b, ch, d / 2, d / 2, size))) {   /* 貼 PNG 圖片（V1.47）：大小跟「字級 size px 的文字 emoji」一樣；圖集沒載好或沒有這隻動物才退回文字 emoji */
                b.font = Math.round(size) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle';
                b.fillText(ch, d / 2, d / 2);
            }
            b.globalCompositeOperation = 'source-atop'; b.fillStyle = TINT; b.fillRect(0, 0, d, d);   /* globalCompositeOperation：source-atop＝只畫在已經有顏色的地方 */
            return s;
        }

        /* 點擊：點到小動物就 +1 */
        kit.onTap(cv, function (e) {                    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用） */
            if (over || api.over) return;
            var p = kit.localPt(e, cv), i = hitAnimal(animals.map(view), p.x, p.y);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            if (i < 0) { rings.push({ x: p.x, y: p.y, t: 0 }); return; }
            catchIt(i);
        });
        function view(a) { var ps = poseAt(a, clock - a.born); return { x: ps.x, y: a.base - a.size * RISE * ps.up - a.size * 0.05, size: a.size, up: ps.up }; }
        function catchIt(i) {
            var a = animals[i], v = view(a);
            animals.splice(i, 1);                       /* splice：從陣列中刪掉元素 */
            S.score++; api.setInfo('找到 ' + S.score + ' 隻'); Sfx.play('pop');  /* Sfx.play(名稱)：播放音效（音效是程式即時合成的） */
            floats.push({ x: v.x, y: v.y - a.size * 0.5, t: 0, ch: a.ch, size: a.size, spr: a.spr });
        }

        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;
            var d = Math.min(dt, 50) / 1000;
            if (!over && started) { clock += d; update(d); }
            draw();
        });

        function update(d) {
            for (var i = animals.length - 1; i >= 0; i--) if (clock - animals[i].born >= animals[i].show) animals.splice(i, 1);
            var df = diffFor(S.score);
            if (clock >= nextAt && animals.length < df.alive) { spawn(df); nextAt = clock + df.interval * kit.randFloat(0.7, 1.3, rand); }
            else if (clock >= nextAt) nextAt = clock + 0.15;            /* 已經滿了：等一下再看 */
            floats = floats.filter(function (f) { return (f.t += d * 1000) < PLUS_MS; });  /* filter：留下符合條件的元素，回傳新陣列 */
            rings = rings.filter(function (q) { return (q.t += d * 1000) < 300; });
        }
        /* 生一隻：挑一排（不跟已經有動物的排重複），排好路線 */
        function spawn(df) {
            var used = animals.map(function (a) { return a.row; }), free = [];
            for (var k = 0; k < ROWS; k++) if (used.indexOf(k) < 0) free.push(k);  /* indexOf：找元素在陣列裡的位置，找不到回傳 −1 */
            if (!free.length) return;
            var size = sizeFor(clock), sp = df.speed * kit.randFloat(0.8, 1.2, rand), ch = pickAnimal(rand, last), spr = makeAnimal(ch, size); last = ch;
            /* 試幾條路線（排、起點、方向），沿路取 5 個點算「露出幾成」，最多露出的那一點要在 VIS 範圍內；都不符合就用最接近的 */
            var best = null, bestErr = 1e9;
            for (var tr = 0; tr < VIS_TRIES; tr++) {
                var row = kit.pick(free, rand), path = planPath(W, size, sp, df.show, rand), base = rows[row].base, y = base - size * RISE - size * 0.05, mx = 0;
                for (var q = 0; q <= 4; q++) mx = Math.max(mx, coverAt(row, path.x0 + path.dir * path.speed * df.show * q / 4, y, spr));
                var err = mx < VIS[0] ? VIS[0] - mx : mx > VIS[1] ? mx - VIS[1] : 0;
                if (err < bestErr) { bestErr = err; best = { row: row, path: path, vis: mx }; }
                if (!err) break;
            }
            animals.push({ ch: ch, row: best.row, base: rows[best.row].base, size: size, born: clock, show: df.show, dir: best.path.dir, x0: best.path.x0, speed: best.path.speed, spr: spr, vis: best.vis });
        }
        function timeUp() {
            if (over) return;
            over = true;
            console.log('[草叢找動物] 時間到：' + S.score + ' 隻');
            api.fail({ delay: 1600, lines: ['60 秒到了！'] });  /* api.fail({ delay, lines })：這局結束，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }

        /* ═══ 畫面 ═══ */
        function draw() {
            g.drawImage(bg.c, 0, 0, W, H);              /* 草原底圖 */
            var hint = hintOn(clock) && !over, views = animals.map(function (a) { var v = view(a); v.row = a.row; v.spr = a.spr; v.base = a.base; return v; });
            for (var ri = 0; ri < ROWS; ri++) {
                /* 這一排的小動物：只畫地面以上的部分（下半身「躲」在地面後面），再畫這一排的灌木蓋在牠前面 */
                views.forEach(function (v) {
                    if (v.row !== ri || v.up <= 0) return;
                    g.save(); g.beginPath(); g.rect(0, 0, W, v.base); g.clip();
                    g.drawImage(v.spr.c, v.x - v.spr.w / 2, v.y - v.spr.h / 2, v.spr.w, v.spr.h);
                    g.restore();
                });
                drawRow(rows[ri], ri, hint ? views : null);
            }
            /* 點到的小動物：整隻跳出來、放大、變淡；+1 */
            floats.forEach(function (f) {
                var k = f.t / PLUS_MS, z = 1 + k * 0.6;
                g.save(); g.globalAlpha = 1 - k;
                g.drawImage(f.spr.c, f.x - f.spr.w * z / 2, f.y + f.size * 0.5 - 20 * k - f.spr.h * z / 2, f.spr.w * z, f.spr.h * z);
                g.font = '900 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = COL.ink; g.strokeText('+1', f.x, f.y - 10 - 40 * k);
                g.fillStyle = COL.plus; g.fillText('+1', f.x, f.y - 10 - 40 * k);
                g.restore();
            });
            rings.forEach(function (q) { var k = q.t / 300; g.save(); g.globalAlpha = 0.6 * (1 - k); g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, 8 + 16 * k, 0, Math.PI * 2); g.stroke(); g.restore(); });
        }
        /* 畫一排灌木（貼小圖，以地面中心為軸微微擺動）。shakers：新手期要晃動的小動物（牠身邊、同一排與前一排的灌木會用力晃） */
        function drawRow(row, ri, shakers) {
            var t = clock;
            row.bushes.forEach(function (bu) {
                var sway = 0.012 * Math.sin(t * 1.3 + bu.ph);
                if (shakers) shakers.forEach(function (v) {
                    if (v.up <= 0 || (v.row !== ri && v.row !== ri - 1)) return;
                    var dx = Math.abs(bu.x - v.x), reach = bu.w / 2 + v.size * 0.6;
                    if (dx < reach) sway += 0.09 * (1 - dx / reach) * Math.sin(t * 22 + bu.ph * 3) * v.up;
                });
                g.save(); g.translate(bu.x, bu.y); g.rotate(sway);
                g.drawImage(bu.spr.c, -bu.w / 2 - PAD, -bu.h - PAD, bu.spr.w, bu.spr.h);
                g.restore();
            });
        }
        /* 小動物（圖 spr）在第 row 排、中心 (x, y) 的時候露出幾成（0～1）：把牠畫在一張跟牠一樣大的小畫布上（地面以下切掉），
           再用這一排與前面幾排的灌木「挖掉」，比較挖掉前後還有顏色的像素。出場前挑路線用，也給除錯看 */
        var scratch = document.createElement('canvas');
        function coverAt(row, x, y, spr) {
            var sw = Math.ceil(spr.w), sh = Math.ceil(spr.h), base = rows[row].base, ox = x - spr.w / 2, oy = y - spr.h / 2, k, full = 0, left = 0;
            if (scratch.width !== sw || scratch.height !== sh) { scratch.width = sw; scratch.height = sh; }
            var b = scratch.getContext('2d', { willReadFrequently: true });
            b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, sw, sh);
            b.save(); b.beginPath(); b.rect(0, 0, sw, Math.max(0, base - oy)); b.clip(); b.drawImage(spr.c, 0, 0, spr.w, spr.h); b.restore();
            var px = b.getImageData(0, 0, sw, sh).data;
            for (k = 3; k < px.length; k += 4) if (px[k] > 40) full++;
            if (!full) return 0;
            b.globalCompositeOperation = 'destination-out';
            for (var ri = row; ri < ROWS; ri++) rows[ri].bushes.forEach(function (bu) {
                if (bu.x + bu.w / 2 + PAD < ox || bu.x - bu.w / 2 - PAD > ox + sw || bu.y - bu.h - PAD > oy + sh) return;   /* 離太遠的不用畫 */
                b.drawImage(bu.spr.c, bu.x - bu.w / 2 - PAD - ox, bu.y - bu.h - PAD - oy, bu.spr.w, bu.spr.h);
            });
            px = b.getImageData(0, 0, sw, sh).data;
            for (k = 3; k < px.length; k += 4) if (px[k] > 40) left++;
            return left / full;
        }
        /* 除錯用：第 i 隻小動物現在露出幾成 */
        function visibleOf(i) { var a = animals[i]; if (!a) return null; var v = view(a); return coverAt(a.row, v.x, v.y, a.spr); }
        api.info.visibleOf = visibleOf;

        /* 驗證用（會被重複呼叫，要冪等）：solve＝點掉畫面上露出來的小動物（最多 SOLVE_CAP 隻）；wrong＝點一下空白處（沒有懲罰） */
        api.solve = function () {
            if (over) return;
            var vs = animals.map(view);
            for (var i = vs.length - 1; i >= 0; i--) if (S.score < SOLVE_CAP && vs[i].up >= 0.3) catchIt(i);
        };
        api.wrong = function () { };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '草叢找動物',
        rule: '草原上長滿一叢一叢開著花的矮灌木，小動物會不定時在灌木後面冒出來，跑一小段又躲回去，**只能從灌木的空隙看到牠的一部分**。**看到小動物就點牠**，點到一隻得 1 分。限時 ' + TIME_S + ' 秒，成績是一共找到幾隻。前 ' + HINT_S + ' 秒小動物出現時，牠身邊的灌木會晃動提醒你。分數越高，小動物出現得越頻繁（還會兩、三隻同時出現），**露臉的時間越短、跑得越快**；時間越後面，小動物也越來越小，而且身上帶著一點綠色，跟灌木混在一起！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            diffFor: diffFor, sizeFor: sizeFor, hintOn: hintOn, pickAnimal: pickAnimal, planPath: planPath, poseAt: poseAt, hitAnimal: hitAnimal, rowY: rowY, layoutRow: layoutRow, rating: rating,
            TIME_S: TIME_S, LEVEL_RAMP: LEVEL_RAMP, INTERVAL_S: INTERVAL_S, ALIVE_AT: ALIVE_AT, SHOW_S: SHOW_S, SPEED: SPEED, SIZE_PX: SIZE_PX, HINT_S: HINT_S, POP_S: POP_S, HIT_K: HIT_K, HIT_PAD: HIT_PAD, ROWS: ROWS, ROW_TOP: ROW_TOP, BUSH_W: BUSH_W, BUSH_H: BUSH_H, BUSH_GAP: BUSH_GAP, HOLE_W: HOLE_W, BUSH_DY: BUSH_DY, FLOWERS: FLOWERS, RISE: RISE, VIS: VIS, VIS_TRIES: VIS_TRIES, TINT: TINT, ANIMALS: ANIMALS, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
