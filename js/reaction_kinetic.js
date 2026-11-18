/* ═══════════════════════════════════════════════════════════════════
   reaction_kinetic.js — 秒反應・動態視力（企劃 333）
   樣式：css/games/reaction_kinetic.css（這款專屬的 class 一律以「kinetic-」開頭；共用元件在 css/reaction_common.css）
   一列台鐵區間車從右往左開過去，**其中一節車廂的窗戶貼著一張黃底黑字的號碼**。火車開走之後，**從下面 4 個選項點出那個號碼**。
   ───────────────────────────────────────────────────────────────────
   · 難度（線性，到 RAMP_LEVELS 關到頂）：
       ① 每節車廂「整節在畫面上」的時間 VIEW_S：2.5 秒 → 0.5 秒（第 30 關只看得到 0.5 秒）；火車的速度由它算出來：
          速度 v ＝（畫面寬 ＋ 車廂寬）÷ VIEW_S；整列火車再多走 TAIL_PAD 才算開出畫面；
       ② 號碼的位數 DIGITS：2 → 4 位；③ 車廂數 CARS：4 → 8 節（車廂越多，窗戶裡的干擾越多）；
       ④ 干擾貼紙 DECOY_STICKERS：0 → 3 張（別的車窗上也貼黃底黑字，但是是英文字母，不是號碼）；
       ⑤ 選項越來越像 SIM_P：0 → 1。第 1 關的錯誤選項跟答案有 2 個位數不同、而且換成「長得不像」的數字；
          到頂的時候，錯誤選項只差 1 個位數、而且換成「長得像」的數字（0↔8、3↔8、1↔7、6↔5 …，見 SIM 表）。
       ⑥ 火車開過去的時候，整列火車（連號碼貼紙、干擾貼紙）都有「橫向動態模糊」（只糊水平方向，垂直不糊）：模糊半徑 BLUR_PX 1.5 → 6 px；
          火車開走、出現選項之後，模糊就拿掉（揭曉倒車時是清楚的）。
          V1.57.2.0（玩家意見：手機上一開始十關很卡）：不再讓瀏覽器「每個畫面都重算一次」濾鏡，而是**進關時把整列火車預先畫成圖片（一節車廂一張 canvas），
          只做一次橫向模糊**（bakeTrain），開車時直接移動這些圖片，所以不管幾幀都一樣順；畫不出來的瀏覽器才退回原本的 SVG 濾鏡。
   · 窗戶裡的干擾：乘客剪影、便當、報紙、窗簾、空窗，每節隨機。
   · 揭曉：火車「倒車」回來，停在貼著號碼的那一節，號碼貼紙放大；選項的正確答案變綠色、你選錯的變紅色。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'kinetic'：選單、成績、存檔都靠它；樣式在 css/games/reaction_kinetic.css，裡面的 class 名稱一律以 kinetic- 開頭。 */
    'use strict';

    var ID = 'kinetic';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */
    var blurSeq = 0;                                    /* 橫向模糊濾鏡的編號：每一關各做一個（id 不重複），舊關卡的濾鏡就不會被新關卡誤用 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（使用者企劃：第 30 關只在畫面上 0.5 秒） */
    var VIEW_S = [0.5, 0.10];                    /* 一節車廂從進畫面到出畫面的時間（秒）：第 1 關 → 到頂 */
    var DIGITS = [2, 5];                        /* 號碼位數：第 1 關 → 到頂（四捨五入） */
    var CARS = [5, 10];                          /* 車廂數：第 1 關 → 到頂（四捨五入） */
    var DECOY_STICKERS = [1, 5];                /* 干擾貼紙（英文字母）張數：第 1 關 → 到頂（四捨五入） */
    var SIM_P = [0, 1];                         /* 錯誤選項「長得像」的程度：第 1 關 → 到頂 */
    var BLUR_PX = [1.5, 6];                     /* 火車開過去時的橫向動態模糊半徑（px，只糊水平方向）：第 1 關 → 到頂；兩個都填 0 就沒有模糊 */
    var BAKE_STEP = 2;                          /* 預先繪製模糊時，相鄰兩個取樣之間隔幾個裝置像素（越小越細緻、進關時畫得越久；2 肉眼看不出階梯） */
    var BAKE_MAX_SAMPLES = 32;                  /* 預先繪製模糊時，一節車廂最多取幾個樣本（模糊很大的時候用它封頂，免得進關畫太久） */
    var BAKE_DPR_MAX = 3;                       /* 預先畫的圖片，解析度最多是螢幕的幾倍（iPhone 是 3；調小可以省記憶體與進關的時間，字會稍微軟一點） */
    var BAKE_PAD = 4;                           /* 預先畫的圖片上下各多留幾 px（車輪、玻璃的外框會超出車廂一點點） */
    var ANSWER_S = 30;                           /* 火車開走之後，選號碼的時間（秒） */
    var LEAD_MS = 600;                          /* 進場後等多久火車才開始進來（讓玩家先看提示） */
    var CAR_GAP = 10;                           /* 車廂之間的距離（px，中間有連結器） */
    var TAIL_PAD = 24;                          /* 火車開出畫面時，最後一節車廂的右端再多走這麼遠（連結器和車身邊框才不會留在畫面邊緣） */
    var CAR_W_RATIO = 0.49, CAR_ASPECT = 170 / 230;   /* 車廂寬度占畫面寬度的比例、高÷寬 */
    var REVERSE_MS = 1200;                      /* 揭曉時火車倒車回來要多久 */
    var ZOOM_MS = 500;                          /* 號碼貼紙放大的時間 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 長得像的數字（黑體字裡容易看錯的）：一個數字可以被換成它後面列的數字 */
    var SIM = { 0: [8, 6, 9], 1: [7, 4], 2: [7, 3], 3: [8, 5, 2], 4: [9, 1], 5: [6, 3, 8], 6: [8, 5, 0, 9], 7: [1, 2], 8: [3, 6, 9, 0, 5], 9: [8, 4, 0, 6] };
    var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'K', 'M', 'R', 'S', 'X', 'Z'];     /* 干擾貼紙上的字（不是數字） */
    var WINDOWS = ['pax', 'pax2', 'bento', 'news', 'curtain', 'empty'];            /* 窗戶裡的東西 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function viewSFor(level) { return Math.round(ramp(level, VIEW_S) * 1000) / 1000; }  /* Math.round：四捨五入成整數 */
    function digitsFor(level) { return Math.round(ramp(level, DIGITS)); }
    function carsFor(level) { return Math.round(ramp(level, CARS)); }
    function decoysFor(level) { return Math.round(ramp(level, DECOY_STICKERS)); }
    function simPFor(level) { return Math.round(ramp(level, SIM_P) * 1000) / 1000; }
    /* 預先繪製的橫向模糊要怎麼取樣：sigma＝模糊半徑（px，跟 SVG 濾鏡 feGaussianBlur 的 stdDeviation 同一個意思），dpr＝圖片的解析度倍率。
       動態模糊就是「曝光時間內，物體走過的每個位置疊在一起取平均」＝一個「方框」的平均；方框寬 L ＝ sigma × √12（標準差跟高斯模糊一樣是 sigma）。
       做法：把沒模糊的圖片，往左右各偏移一小段、半透明疊 K 次（相加平均）；把方框 −L/2 ～ +L/2 平均切成 K 格，每格的中間放一個樣本（這樣 K 很小的時候，標準差也不會偏大）。
       回傳 { L（方框寬，裝置像素）, offsets（每個樣本的偏移，裝置像素，可以有小數；drawImage 會自己內插）}。
       模糊半徑小於 1 個裝置像素（等於沒模糊）就只有一個樣本、偏移 0。 */
    function blurSamples(sigma, dpr) {
        var L = sigma * Math.sqrt(12) * dpr;
        if (!(L >= 1)) return { L: 0, offsets: [0] };
        var K = Math.min(BAKE_MAX_SAMPLES, Math.max(2, Math.ceil(L / BAKE_STEP))), offsets = [], j;
        for (j = 0; j < K; j++) offsets.push(Math.round((-L / 2 + L * (j + 0.5) / K) * 100) / 100);
        return { L: L, offsets: offsets };
    }
    function blurFor(level) { return Math.max(0, Math.round(ramp(level, BLUR_PX) * 10) / 10); }  /* 這一關的橫向模糊半徑（px，取到小數 1 位；最少 0） */
    /* 版面尺寸：stage 寬 W → 車廂寬、高、整列火車的寬 */
    function trainSize(W, cars) {
        var cw = Math.round(W * CAR_W_RATIO), ch = Math.round(cw * CAR_ASPECT);
        return { cw: cw, ch: ch, total: cars * cw + (cars - 1) * CAR_GAP };
    }
    /* 火車的速度（px／秒）：一節車廂（寬 cw）從右邊緣出現到左邊緣消失，要走 W ＋ cw 的距離，花 viewS 秒 */
    function speedFor(W, cw, viewS) { return (W + cw) / viewS; }
    /* 火車從出現到整列開出畫面的總秒數（火車左端從 W 走到 −total） */
    function passSeconds(W, total, v) { return (W + total) / v; }
    /* 火車（左端）在開始後 t 秒的 x 座標：從 W 往左 */
    function trainX(t, W, v) { return W - v * t; }
    /* 第 i 節車廂左端離火車左端多遠 */
    function carOffset(i, cw) { return i * (cw + CAR_GAP); }
    /* 揭曉時火車停的位置：讓第 i 節車廂正好在畫面正中央（火車左端的 x） */
    function revealX(W, cw, i) { return Math.round(W / 2 - carOffset(i, cw) - cw / 2); }
    /* 兩個號碼字串有幾個位數不同；以及這些不同的位數是不是都換成「長得像」的數字 */
    function diffPositions(a, b) { var r = []; for (var i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) r.push(i); return r; }
    function allSimilar(a, b) { return diffPositions(a, b).every(function (i) { return SIM[+a.charAt(i)].indexOf(+b.charAt(i)) >= 0; }); }  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
    /* 隨機一個 d 位數的號碼字串（第一位不是 0，也不是每一位都一樣） */
    function randomNumber(d, rand) {
        for (var tr = 0; tr < 50; tr++) {
            var s = String(kit.randInt(1, 9, rand));    /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            for (var i = 1; i < d; i++) s += kit.randInt(0, 9, rand);
            if (!/^(\d)\1+$/.test(s)) return s;
        }
        return '1234'.slice(0, d);
    }
    /* 把號碼 truth 的某一位換成別的數字：simp＝是否換成「長得像」的；回傳新字串。第一位不能換成 0 */
    function swapDigit(truth, pos, simp, rand) {
        var cur = +truth.charAt(pos), pool;
        if (simp) pool = SIM[cur].slice();              /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        else pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function (x) { return x !== cur && SIM[cur].indexOf(x) < 0; });  /* filter：留下符合條件的元素，回傳新陣列 */
        if (pos === 0) pool = pool.filter(function (x) { return x !== 0; });
        if (!pool.length) pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function (x) { return x !== cur && (pos > 0 || x !== 0); });
        return truth.slice(0, pos) + kit.pick(pool, rand) + truth.slice(pos + 1);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
    }
    /* 做一個錯誤選項：位數 ≥ 2 時，「不像」的機率是 1 − simP 會同時換 2 位、否則換 1 位；每個換掉的位數也各自依 simP 決定要不要換成長得像的 */
    function makeDecoy(truth, simP, rand) {
        var d = truth.length, n = (d >= 2 && rand() >= simP) ? 2 : 1, pos = kit.shuffle(truth.split('').map(function (c, i) { return i; }), rand).slice(0, n), s = truth;  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        pos.forEach(function (p) { s = swapDigit(s, p, rand() < simP, rand); });  /* forEach：對陣列的每個元素各做一次 */
        return s;
    }
    /* 出一關：{
         level, number（號碼字串）, digits, options（4 個選項，已洗牌）, answerIdx, cars（車廂數）, target（貼號碼的車廂，從 0 算起）,
         windows（每節車廂窗戶裡的東西）, stickers（{車廂編號: 字母}，干擾貼紙）, viewS, simP, blur（橫向模糊半徑 px）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var d = digitsFor(level), cars = carsFor(level), simP = simPFor(level), number = randomNumber(d, rand);
        var opts = [number], guard = 0;
        while (opts.length < 4 && guard++ < 400) { var c = makeDecoy(number, simP, rand); if (opts.indexOf(c) < 0) opts.push(c); }
        while (opts.length < 4) { var f = swapDigit(number, d - 1, false, rand); if (opts.indexOf(f) < 0) opts.push(f); }       /* 保底（極少用到） */
        opts = kit.shuffle(opts, rand);
        var target = kit.randInt(0, cars - 1, rand), windows = [], i;
        for (i = 0; i < cars; i++) windows.push(kit.pick(WINDOWS, rand));
        var others = []; for (i = 0; i < cars; i++) if (i !== target) others.push(i);
        var stickers = {}; kit.shuffle(others, rand).slice(0, Math.min(decoysFor(level), others.length)).forEach(function (ci) { stickers[ci] = kit.pick(LETTERS, rand); });
        return { level: level, number: number, digits: d, options: opts, answerIdx: opts.indexOf(number), cars: cars, target: target, windows: windows, stickers: stickers, viewS: viewSFor(level), simP: simP, blur: blurFor(level) };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '老鷹眼！';
        if (n >= 15) return '眼力驚人！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '盯著黃色的貼紙！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'kinetic-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 畫一節車廂的窗戶裡的東西（座標以窗戶左上角為原點，窗戶 160×80） */
    function drawWindow(g, kind, rand) {
        var s = function (tag, attrs) { return kit.svg(tag, attrs, g); };  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        function person(cx, tone) {
            s('path', { 'class': 'kinetic-pax kinetic-pax--' + tone, d: 'M' + (cx - 30) + ',84 Q' + (cx - 30) + ',54 ' + cx + ',52 Q' + (cx + 30) + ',54 ' + (cx + 30) + ',84 Z' });
            s('circle', { 'class': 'kinetic-head', cx: cx, cy: 36, r: 16 });
            s('path', { 'class': 'kinetic-hair', d: 'M' + (cx - 16) + ',34 Q' + cx + ',12 ' + (cx + 16) + ',34 Q' + cx + ',26 ' + (cx - 16) + ',34 Z' });
        }
        if (kind === 'pax') person(kit.randInt(55, 105, rand), kit.randInt(0, 2, rand));
        else if (kind === 'pax2') { person(42, kit.randInt(0, 2, rand)); person(118, kit.randInt(0, 2, rand)); }
        else if (kind === 'bento') {
            s('rect', { 'class': 'kinetic-bento', x: 36, y: 34, width: 88, height: 42, rx: 6 });
            s('rect', { 'class': 'kinetic-rice', x: 42, y: 40, width: 38, height: 30, rx: 4 });
            s('circle', { 'class': 'kinetic-egg', cx: 98, cy: 50, r: 9 }); s('rect', { 'class': 'kinetic-veg', x: 88, y: 58, width: 30, height: 10, rx: 4 });
        }
        else if (kind === 'news') {
            s('rect', { 'class': 'kinetic-paper', x: 34, y: 6, width: 92, height: 72, rx: 3 });
            s('rect', { 'class': 'kinetic-line', x: 42, y: 14, width: 76, height: 8 }); s('rect', { 'class': 'kinetic-line', x: 42, y: 30, width: 34, height: 4 }); s('rect', { 'class': 'kinetic-line', x: 82, y: 30, width: 36, height: 4 });
            s('rect', { 'class': 'kinetic-line', x: 42, y: 40, width: 34, height: 4 }); s('rect', { 'class': 'kinetic-line', x: 82, y: 40, width: 36, height: 4 }); s('rect', { 'class': 'kinetic-line', x: 42, y: 52, width: 76, height: 4 });
        }
        else if (kind === 'curtain') {
            s('rect', { 'class': 'kinetic-curtain', x: 0, y: 0, width: 58, height: 80 });
            s('path', { 'class': 'kinetic-fold', d: 'M19,0 L19,80 M38,0 L38,80' });
        }
    }

    /* ═══ 預先繪製（bake）：把整列火車畫成圖片、只模糊一次（V1.57.2.0 玩家意見）═══
       為什麼：火車是 DOM（div）加 SVG，原本用 SVG 濾鏡 feGaussianBlur 蓋在整列火車上；火車一動，瀏覽器就要「每一個畫面」重算一次濾鏡，
       手機（尤其 iPhone）上很吃力，關卡前面火車慢、玩家看得清楚，停頓反而更明顯。
       現在：進關時，照 DOM 裡已經畫好的車廂（顏色、框線都讀「算好的樣式」，所以跟畫面上一模一樣），一節車廂畫一張 canvas，
       橫向模糊只做這一次；開車時移動的只是幾張現成的圖片（跟沒有模糊的時候一樣便宜）。
       只支援這款遊戲畫出來的圖形：rect（含圓角）、circle、path、g（平移＋裁切）和貼紙（圓角框＋字）。 */
    /* 圓角方形路徑（Path2D 版本，p 是 Path2D） */
    function roundRectPath(p, x, y, w, hh, r) {
        r = Math.max(0, Math.min(r || 0, w / 2, hh / 2));
        p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r); p.lineTo(x + w, y + hh - r); p.arcTo(x + w, y + hh, x + w - r, y + hh, r);
        p.lineTo(x + r, y + hh); p.arcTo(x, y + hh, x, y + hh - r, r); p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.closePath();
    }
    /* 一個 SVG 元素 → 「畫到 canvas 上」的函式 painter(ctx)。顏色、框線粗細讀 getComputedStyle（CSS 變數已經換成真正的顏色），clip＝窗戶玻璃的裁切範圍 */
    function svgNodePainter(el, clip) {
        var tag = el.tagName.toLowerCase(), cs = getComputedStyle(el), num = function (a) { return parseFloat(el.getAttribute(a)) || 0; };
        if (tag === 'g') {
            var kids = [].slice.call(el.children).map(function (c) { return svgNodePainter(c, clip); }), m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(el.getAttribute('transform') || '');
            var tx = m ? +m[1] : 0, ty = m ? +m[2] : 0, clipped = /url\(/.test(el.getAttribute('clip-path') || '');
            return function (c) {
                c.save(); c.translate(tx, ty);
                if (clipped && clip) { var cp0 = new Path2D(); roundRectPath(cp0, clip.x, clip.y, clip.w, clip.h, clip.rx); c.clip(cp0); }
                kids.forEach(function (f) { f(c); }); c.restore();
            };
        }
        var p = new Path2D();
        if (tag === 'rect') roundRectPath(p, num('x'), num('y'), num('width'), num('height'), num('rx'));
        else if (tag === 'circle') p.arc(num('cx'), num('cy'), num('r'), 0, Math.PI * 2);
        else if (tag === 'path') p = new Path2D(el.getAttribute('d') || '');
        else return function () { };
        var fill = cs.fill, stroke = cs.stroke, sw = parseFloat(cs.strokeWidth) || 0, op = parseFloat(cs.opacity);
        return function (c) {
            if (isFinite(op) && op < 1) c.globalAlpha = op;
            if (fill && fill !== 'none') { c.fillStyle = fill; c.fill(p); }
            if (stroke && stroke !== 'none' && sw > 0) { c.lineWidth = sw; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(p); }
            c.globalAlpha = 1;
        };
    }
    /* 號碼／字母貼紙（div）→ painter：圓角框（邊框色先填滿，再填底色）＋置中的字；位置、大小、字型都讀排好版之後的實際值 */
    function stickerPainter(st) {
        var cs = getComputedStyle(st), w = st.offsetWidth, hh = st.offsetHeight, cx = st.offsetLeft, cy = st.offsetTop, bw = parseFloat(cs.borderTopWidth) || 0, r = parseFloat(cs.borderTopLeftRadius) || 0;
        var font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, text = st.textContent;         /* offsetLeft／offsetTop＝貼紙「左上角」在車廂裡的位置（不含 translate(-50%, -50%)），所以它就是貼紙的中心 */
        return function (c) {
            c.save();
            var a = new Path2D(), b = new Path2D();
            roundRectPath(a, cx - w / 2, cy - hh / 2, w, hh, r); c.fillStyle = cs.borderTopColor; c.fill(a);
            roundRectPath(b, cx - w / 2 + bw, cy - hh / 2 + bw, w - 2 * bw, hh - 2 * bw, r - bw); c.fillStyle = cs.backgroundColor; c.fill(b);
            c.font = font; if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing;
            c.fillStyle = cs.color; kit.drawGlyph(c, text, cx, cy);                                        /* 字的筆畫外框置中（kit.drawGlyph） */
            c.restore();
        };
    }
    /* 一節車廂（.kinetic-car）→ painter：先畫車廂的 SVG（依 viewBox 縮放到車廂的實際大小），再畫貼紙 */
    function carPainter(car, clip) {
        var svg = car.querySelector('svg'), vb = (svg.getAttribute('viewBox') || '0 0 230 170').split(/\s+/).map(Number), cw = +svg.getAttribute('width'), ch = +svg.getAttribute('height');
        var kids = [].slice.call(svg.children).map(function (e) { return svgNodePainter(e, clip); }), stickers = [].slice.call(car.querySelectorAll('.kinetic-sticker')).map(stickerPainter);
        return function (c) { c.save(); c.scale(cw / vb[2], ch / vb[3]); kids.forEach(function (f) { f(c); }); c.restore(); stickers.forEach(function (f) { f(c); }); };
    }
    /* 預先繪製整列火車：carEls＝每節車廂（.kinetic-car）、clip＝窗戶玻璃的裁切 { x, y, w, h, rx }、T＝trainSize 的結果、blur＝橫向模糊半徑（px）。
       一節車廂畫一張 canvas，負責「這節車廂左右各半個車廂間隔」那一段（相鄰的圖片剛好接起來、不重疊）；
       要模糊，就要用到左右鄰居的邊緣，所以先把「前一節、這一節、後一節」一起畫在一張暫存圖上（左右多留 M 個像素給模糊用），
       再依 blurSamples 的偏移，把暫存圖半透明疊 K 次（globalCompositeOperation = 'lighter'＝相加，每次 1/K 的亮度＝平均）。
       回傳 { el（裝著所有 canvas、要移動的容器）, ms（花了幾毫秒）, samples, dpr }。 */
    function bakeTrain(carEls, clip, T, blur) {
        var t0 = performance.now(), dpr = Math.min(BAKE_DPR_MAX, window.devicePixelRatio || 1), sm = blurSamples(blur, dpr), n = carEls.length, G = CAR_GAP, pad = BAKE_PAD;
        var M = Math.ceil(sm.L / 2) + 2, cellW = Math.round((T.cw + G) * dpr), H = Math.round((T.ch + 2 * pad) * dpr), i, k;
        var painters = carEls.map(function (c) { return carPainter(c, clip); });
        var src = document.createElement('canvas'); src.width = cellW + 2 * M; src.height = H;
        var sx = src.getContext('2d'), root = document.createElement('div'); root.className = 'kinetic-train kinetic-train--baked';
        for (i = 0; i < n; i++) {
            sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, src.width, src.height);
            for (k = i - 1; k <= i + 1; k++) {
                if (k < 0 || k >= n) continue;
                sx.setTransform(dpr, 0, 0, dpr, M + (G / 2 + (k - i) * (T.cw + G)) * dpr, pad * dpr);        /* 這一節在暫存圖上的位置：左邊留 M 像素給模糊，再讓出半個車廂間隔 */
                painters[k](sx);
            }
            var cv = document.createElement('canvas'); cv.width = cellW; cv.height = H; cv.className = 'kinetic-baked';
            cv.style.cssText = 'left:' + (i * (T.cw + G) - G / 2) + 'px;top:' + (-pad) + 'px;width:' + (T.cw + G) + 'px;height:' + (T.ch + 2 * pad) + 'px;';
            var dx = cv.getContext('2d');
            if (sm.offsets.length > 1) { dx.globalCompositeOperation = 'lighter'; dx.globalAlpha = 1 / sm.offsets.length; sm.offsets.forEach(function (d) { dx.drawImage(src, d - M, 0); }); }
            else dx.drawImage(src, -M, 0);
            root.appendChild(cv);
        }
        return { el: root, ms: performance.now() - t0, samples: sm.offsets.length, dpr: dpr };
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[動態視力] 第 ' + level + ' 關：號碼 ' + q.number + '（選項 ' + q.options.join('、') + '）；' + q.cars + ' 節車廂，貼在第 ' + (q.target + 1) + ' 節；每節在畫面上 ' + q.viewS + ' 秒；橫向模糊 ' + q.blur + ' px；干擾貼紙 ' + Object.keys(q.stickers).length + ' 張');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var T = trainSize(W, q.cars), v = speedFor(W, T.cw, q.viewS), endX = -(T.total + TAIL_PAD), passS = passSeconds(W, T.total + TAIL_PAD, v);
        var field = h('div', { 'class': 'kinetic-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note kinetic-tip', text: level === 1 ? '看清楚窗戶上的黃色號碼！' : '看清楚黃色的號碼貼紙' });
        field.appendChild(tip);
        var trainTop = 100;
        /* 鐵軌（在車廂底下） */
        var rail = h('div', { 'class': 'kinetic-rail' }); rail.style.top = (trainTop + T.ch + 2) + 'px'; field.appendChild(rail);
        /* 整列火車：一個很寬的條，每一節車廂排在裡面；整個條用 translateX 移動 */
        var strip = h('div', { 'class': 'kinetic-train' });
        strip.style.cssText = 'top:' + trainTop + 'px;width:' + T.total + 'px;height:' + T.ch + 'px;transform:translate3d(' + W + 'px,0,0);';
        field.appendChild(strip);
        var stickerEl = null;
        for (var i = 0; i < q.cars; i++) {
            var car = h('div', { 'class': 'kinetic-car' });
            car.style.cssText = 'left:' + carOffset(i, T.cw) + 'px;width:' + T.cw + 'px;height:' + T.ch + 'px;';
            var svg = kit.svg('svg', { 'class': 'kinetic-svg', viewBox: '0 0 230 170', width: T.cw, height: T.ch }, car);
            if (i < q.cars - 1) kit.svg('rect', { 'class': 'kinetic-link', x: 226, y: 118, width: 18, height: 9, rx: 3 }, svg);          /* 連結器：最後一節後面沒有車廂，不畫 */
            kit.svg('rect', { 'class': 'kinetic-roof', x: 6, y: 0, width: 218, height: 14, rx: 7 }, svg);
            kit.svg('rect', { 'class': 'kinetic-body', x: 0, y: 8, width: 230, height: 142, rx: 14 }, svg);
            kit.svg('rect', { 'class': 'kinetic-band', x: 0, y: 112, width: 230, height: 30 }, svg);
            kit.svg('rect', { 'class': 'kinetic-glass', x: 35, y: 26, width: 160, height: 80, rx: 8 }, svg);
            var wg = kit.svg('g', { transform: 'translate(35,26)', 'clip-path': 'url(#kinetic-clip)' }, svg);
            drawWindow(wg, q.windows[i], api.rand);
            kit.svg('rect', { 'class': 'kinetic-frame', x: 10, y: 150, width: 210, height: 8, rx: 3 }, svg);
            kit.svg('circle', { 'class': 'kinetic-wheel', cx: 52, cy: 162, r: 9 }, svg); kit.svg('circle', { 'class': 'kinetic-wheel', cx: 178, cy: 162, r: 9 }, svg);
            var txt = i === q.target ? q.number : q.stickers[i];
            if (txt != null) {
                var st = h('div', { 'class': 'kinetic-sticker' + (i === q.target ? ' kinetic-sticker--num' : ''), text: txt });
                st.style.left = '50%'; st.style.top = Math.round(66 / 170 * T.ch) + 'px';
                car.appendChild(st);
                if (i === q.target) stickerEl = st;
            }
            strip.appendChild(car);
        }
        /* 窗戶的裁切範圍（讓窗內的東西不會超出玻璃）：放一個隱藏的 svg 定義 */
        var defs = kit.svg('svg', { 'class': 'kinetic-defs', width: 0, height: 0 }, field);
        var defsEl = kit.svg('defs', {}, defs);
        var cp = kit.svg('clipPath', { id: 'kinetic-clip' }, defsEl); kit.svg('rect', { x: 0, y: 0, width: 160, height: 80, rx: 8 }, cp);
        /* 橫向動態模糊（只糊水平方向，車身、窗戶、號碼貼紙、干擾貼紙一起糊）。
           ① 優先用「預先繪製」（bakeTrain）：進關時把整列火車畫成圖片、模糊一次，開車時只移動圖片（玩家意見：手機上每幀套濾鏡會卡）；
              原本的 DOM 火車先藏起來（visibility: hidden），火車開走之後再換回來給揭曉倒車用（那時要清清楚楚）；
           ② 預先繪製失敗（舊瀏覽器沒有 Path2D 之類）才退回原本的做法：SVG 濾鏡 feGaussianBlur，stdDeviation 填「橫向 縱向」，縱向填 0 就只糊水平方向，
              套在整列火車（strip）上；color-interpolation-filters="sRGB" 讓顏色不會被濾鏡改變。 */
        var baked = null, mover = strip;                /* baked：預先畫好的圖片容器（沒有就是 null）；mover：開車時要移動的那一個容器 */
        if (q.blur > 0) {
            try {
                var cr = cp.firstChild;
                baked = bakeTrain([].slice.call(strip.children), { x: +cr.getAttribute('x'), y: +cr.getAttribute('y'), w: +cr.getAttribute('width'), h: +cr.getAttribute('height'), rx: +cr.getAttribute('rx') }, T, q.blur);
            } catch (err) { baked = null; }
            if (baked) {
                baked.el.style.cssText = strip.style.cssText; field.appendChild(baked.el); strip.style.visibility = 'hidden'; mover = baked.el;
                console.log('[動態視力] 預先繪製橫向模糊 ' + q.blur + ' px：' + baked.ms.toFixed(0) + ' 毫秒、每節車廂取樣 ' + baked.samples + ' 次、解析度 ' + baked.dpr + ' 倍');
            } else {
                var fid = 'kinetic-hblur' + (++blurSeq);
                var flt = kit.svg('filter', { id: fid, x: '-10%', y: '-5%', width: '120%', height: '110%', 'color-interpolation-filters': 'sRGB' }, defsEl);
                kit.svg('feGaussianBlur', { stdDeviation: q.blur + ' 0' }, flt);
                strip.style.filter = 'url(#' + fid + ')';
            }
        }
        var info = h('div', { 'class': 'qz-note kinetic-info', text: '' }); info.style.top = (trainTop + T.ch + 34) + 'px'; field.appendChild(info);

        var phase = 'run', done = false, grid = null, x0 = W;
        function setX(x) { x0 = x; mover.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)'; }
        api.after(LEAD_MS, function () {                /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            var t0 = performance.now();                 /* performance.now()：高精度的時間（毫秒），計時用 */
            api.my.loop(function (now) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                if (!strip.isConnected || phase !== 'run') return false;
                var t = (now - t0) / 1000;
                if (t >= passS) { setX(endX); ask(); return false; }
                setX(trainX(t, W, v));
            });
            /* 保底：rAF 被暫停（背景分頁）時，時間到了直接跳到下一階段 */
            api.after(Math.round(passS * 1000) + 500, function () { if (phase === 'run') { setX(endX); ask(); } });
        });
        function ask() {
            if (phase !== 'run') return;
            phase = 'ask'; tip.textContent = '剛才窗戶上的號碼是？';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            /* 火車已經開走：拿掉模糊（之後揭曉倒車時，號碼要清清楚楚）：預先畫好的模糊圖片丟掉、換回清楚的 DOM 火車（停在同一個位置）；用濾鏡的就拿掉濾鏡 */
            if (baked) { baked.el.remove(); strip.style.visibility = ''; mover = strip; setX(x0); } else strip.style.filter = '';
            grid = kit.btnGrid(field, q.options.map(function (o, k) { return { text: o, kind: 'line', cls: 'kinetic-opt', onTap: function () { judge(k); } }; }), { cols: 2, h: 92, gap: 10, bottom: 8 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
            if (level === 1 && kit.once('kinetic.hint')) kit.hintOn(stage, grid.btns[q.answerIdx], { mode: 'tap', delay: 900, text: '請點剛才看到的號碼' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
            api.timer(ANSWER_S * 1000, function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(k) {
            if (done || api.over || phase !== 'ask') return;
            done = true; phase = 'end'; api.stopTimer();
            var ok = k === q.answerIdx;
            grid.btns[q.answerIdx].classList.add('kinetic-ok'); if (k >= 0 && !ok) grid.btns[k].classList.add('kinetic-bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            tip.textContent = '火車倒車回來看看';
            /* 揭曉：火車倒車，停在貼號碼的那一節（正中央），號碼貼紙放大 */
            var from = x0, to = revealX(W, T.cw, q.target);
            api.my.tween(REVERSE_MS, function (p) { setX(from + (to - from) * p); }, kit.easeOutCubic).then(function () {  /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                if (!stickerEl || !stickerEl.isConnected) return;
                stickerEl.classList.add('kinetic-sticker--zoom');
                info.textContent = ok ? '答對了！號碼是 ' + q.number : (k >= 0 ? '正確是 ' + q.number + '，你選了 ' + q.options[k] : '時間到！號碼是 ' + q.number);
                info.classList.add(ok ? 'kinetic-info--ok' : 'kinetic-info--bad');
            });
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: REVERSE_MS + ZOOM_MS + 1500 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({ delay: REVERSE_MS + ZOOM_MS + 2600, lines: ['正確的號碼是 ' + q.number + (k >= 0 ? '，你選了 ' + q.options[k] : '（時間到）'), '選項：' + q.options.join('、')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (phase === 'ask') judge(q.answerIdx); };
        api.wrong = function () { if (phase === 'ask') judge((q.answerIdx + 1) % 4); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '動態視力',
        rule: '一列火車從右往左開過去，**其中一節車廂的窗戶貼著黃底黑字的號碼**。火車開走之後，從下面 4 個選項點出那個號碼。別的窗戶裡有乘客、便當、報紙，後面還會貼**英文字母**的假貼紙來干擾你。越後面，火車開得越快（第 30 關每節車廂只在畫面上 **0.1 秒**）、整列車越**橫向模糊**、號碼越長、錯的選項越像（0 和 8、3 和 8、1 和 7……）。點錯或時間到就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            viewSFor: viewSFor, digitsFor: digitsFor, carsFor: carsFor, decoysFor: decoysFor, simPFor: simPFor, blurFor: blurFor, blurSamples: blurSamples, trainSize: trainSize, speedFor: speedFor, passSeconds: passSeconds, trainX: trainX, carOffset: carOffset, revealX: revealX,
            diffPositions: diffPositions, allSimilar: allSimilar, randomNumber: randomNumber, swapDigit: swapDigit, makeDecoy: makeDecoy, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, VIEW_S: VIEW_S, DIGITS: DIGITS, CARS: CARS, DECOY_STICKERS: DECOY_STICKERS, SIM_P: SIM_P, BLUR_PX: BLUR_PX, BAKE_STEP: BAKE_STEP, BAKE_MAX_SAMPLES: BAKE_MAX_SAMPLES, BAKE_DPR_MAX: BAKE_DPR_MAX, BAKE_PAD: BAKE_PAD, ANSWER_S: ANSWER_S, CAR_GAP: CAR_GAP, SIM: SIM, LETTERS: LETTERS, WINDOWS: WINDOWS, MAX_LEVEL: MAX_LEVEL, REVERSE_MS: REVERSE_MS, ZOOM_MS: ZOOM_MS
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
