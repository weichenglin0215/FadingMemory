/* ═══════════════════════════════════════════════════════════════════
   reaction_impossible.js — 秒反應・不可能任務
   畫面上緣是阿湯哥、下緣是一條紅色警戒線。點一下畫面讓他開始自由落體下墜，
   算準時機再點一下讓他停住。停下來（或直接摔到警戒線上）先定格一秒，接著
   鏡頭平順地推進，放大「阿湯哥下緣～警戒線上緣」這一小段距離，讓玩家看清楚
   自己到底有多驚險；停在警戒線上方「低於 30 公分」才算任務成功，其餘（含直接摔上去）
   都算失敗。直接摔上警戒線的瞬間，阿湯哥的照片會變成紅色（透明部分維持透明）。
   ───────────────────────────────────────────────────────────────────
   · 整個畫面（阿湯哥的照片＋警戒線）都畫在同一個 <svg> 裡，鏡頭推進＝補間
     這個 SVG 的 viewBox，從「看得到整個欄位」慢慢縮小到「照片（完全不裁切）
     ＋警戒線」（框的下緣＝警戒線下緣＝畫面下緣）——這是跟「神準落下」完全同一種手法：鏡頭看到的
     從頭到尾都是同一份內容（同一張照片、同一條警戒線），只是框住的範圍
     在變小，不是切換到另一個畫面、也不是另外疊一個東西上去遮住原本畫面。
     推進的目標框「上緣」永遠等於照片自己的上緣，所以畫面上看起來就是照片
     不斷往上升、不斷放大，直到頂到整個遊戲畫面的最上面才停下來——這是
     視覺效果最滿、最像「鏡頭狂推」的做法，照片完全不被裁掉一部分。
     照片本身是點陣圖（<image> 嵌進 SVG），放大到一定程度一定會比向量內容
     軟一點，這是物理限制；但警戒線、量尺線、箭頭、文字全部是向量畫的
     （<rect>／<line>／<polygon>／<text>），不管鏡頭推進多少都維持銳利。
   · 物理：自由落體，位置 ∝ 時間平方（跟「神準落下」的三角形下墜公式同一個
     道理），用 9.8 m/s² 換算成「每公尺等於多少 px」（見 PX_PER_M），這樣
     下墜的節奏才有實際物理意義，不是憑空編的數字。
   · 「停止」只是凍結當下的位置（取消 rAF），不是另一段動畫；凍結那一刻的
     影格可能跟真正點擊的瞬間差了一影格（<16ms），這點誤差對這個遊戲的節奏
     來說完全不影響，不需要更精準的做法。
   · 分數／最佳紀錄只在「成功」時更新，越小越好；顯示的「公分」數字刻意放大
     20 倍＋顯示到小數點後四位（見 MEASURE_PX_PER_CM 旁的說明），不是真實的
     公制單位，純粹是為了讓數字看起來更精準、更有戲劇效果。
     這個公分數是「最終成績」：結算那一刻用 Leaderboard.fake4() 產生一次（第 3、4 位不為 0），
     鏡頭推進後顯示的數字、最佳紀錄用的是同一個數字。
   · 鏡頭推進到底的最終畫面：照片上緣貼齊遊戲畫面上緣、紅色警戒線的下緣
     貼齊遊戲畫面下緣（警戒線永遠在畫面最底部，不會浮到畫面中間）。
   ═══════════════════════════════════════════════════════════════════ */

/* （這款是較早寫的遊戲：只有一局、沒有關卡，所以不用 kit.round；共通結構見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    /* 遊戲代號 */
    var ID = 'impossible';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 impossible 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'min', decimals: 4, format: '{v} 公分', label: '距離', min: 0, max: 30 };
    var h = UI.h;
    /* SVG 的 XML 命名空間網址：用 document.createElementNS 建立 SVG 元素時一定要帶（和一般 HTML 元素不同） */
    var SVGNS = 'http://www.w3.org/2000/svg';
    var XLINKNS = 'http://www.w3.org/1999/xlink';
    /* 照片路徑 */
    var IMG_SRC = 'images/Impossible.png';

    /* 重力加速度 9.8 公尺／秒² */
    var GRAVITY = 9.8;      /* 重力加速度（公尺／秒²），真實世界的數字 */
    var PX_PER_M = 50;      /* 下墜速度用這個換算 1 公尺等於多少邏輯 px——想讓下墜更快/更慢，調這個數字就好 */
    /* ACCEL：換算成 px／秒²（加速度 = 9.8 × 每公尺的 px 數） */
    var ACCEL = GRAVITY * PX_PER_M; /* px/s² */
    var SUCCESS_CM = 30;     /* 停在警戒線上方「低於」幾「公分」才算成功（跟 MEASURE_PX_PER_CM 是配套的，見下面說明） */
    /* MEASURE_PX_PER_CM：量距離、算成不成功用的換算比例，刻意跟上面下墜速度
       用的 PX_PER_M 不是同一把尺！如果距離也套用「50px=1公尺」，10 公分只有
       5px，用 ACCEL=490 算一下：落地瞬間速度約 828 px/s，5px 的容許誤差換算
       成時間只有約 6 毫秒——比一格畫面更新（約 16 毫秒）還短，等於沒有人按
       得到，成功門檻會變成數學上不可能達成。放寬距離的換算比例，容許誤差
       換算成時間才會是玩家靠練習、抓節奏真的碰得到的範圍——下墜本身仍然是
       道地的 9.8 m/s² 重力感，只有「量尺的粗細」不一樣，兩者本來就是「動畫
       節奏」跟「判定寬容度」兩件不同的事，不需要共用同一把尺。
       這個比例是「1 公分＝幾 px」，所以 1/2 表示 1px ＝ 2 公分。顯示的數字
       只是為了讓玩家覺得很精準、很有戲劇效果，不是真實的公制單位（原本
       1px＝0.1 公分，後來放大到 1px＝1 公分、6 公分，最後縮成 1px＝2 公分）。
       ★ 注意：SUCCESS_CM 現在是 30 公分＝只有 15px 的容許誤差，落地瞬間的速度
       約 828 px/s，換算成時間只有約 18 毫秒、大約一格畫面（16.7 毫秒）——
       這是使用者指定的超高難度（"不可能任務"）。想放寬就調大 SUCCESS_CM。 */
    /* 1 公分對應幾 px（這裡 1px ＝ 2 公分） */
    var MEASURE_PX_PER_CM = 1 / 2;
    /* 照片顯示寬度；高度依照片長寬比算 */
    var IMG_W = 150;         /* 阿湯哥照片顯示寬度（邏輯 px），高度照片自己的長寬比算 */
    var BAR_H = 10;          /* 警戒線高度 */
    var PAUSE_BEFORE_MS = 1000; /* 停下來（或摔到線上）先定格這麼久，玩家才看得清楚剛剛發生了什麼事 */
    var ZOOM_MS = 1300;      /* 鏡頭推進（viewBox 補間）的時間 */
    var HOLD_AFTER_MS = 2000;   /* 推進完、看清楚結果之後，停留多久才出現「再挑戰一次」 */
    /* REDUCED：使用者在系統設定了「減少動態效果」時，不播放推進動畫 */
    var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* cmOf：px 換算成公分（沒有四捨五入的真實數字） */
    function cmOf(px) { return Math.max(0, px) / MEASURE_PX_PER_CM; }
    /* fmtCm：顯示用（小數點後四位） */
    function fmtCm(cm) { return cm.toFixed(4) + ' 公分'; }
    /* 最佳紀錄存的是「公分」（已經是最終成績：4 位小數、第 3／4 位不為 0），這樣畫面上看到的最佳紀錄
       跟結算時看到的是同一個數字。舊版存的是「px」，第一次進來會用 cmOf() 換算一次（見 mount）。
       ★ 以後如果又調整 MEASURE_PX_PER_CM，已經存下來的最佳紀錄不會跟著變（它是公分，不是 px）。 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + fmtCm(v); }
    /* 緩動函式：先慢後快再慢（三次方曲線），讓鏡頭推進比較自然 */
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /* 建立 SVG 元素的小工具（和 kit.svg 同功能，這款比 kit 早寫所以自己有一份） */
    function svgEl(tag, attrs) {
        var el = document.createElementNS(SVGNS, tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }
    /* 設定 SVG 的 viewBox（x y 寬 高）：改 viewBox 就是「鏡頭」移動與放大 */
    function setViewBox(svg, box) {
        svg.setAttribute('viewBox', box.vx + ' ' + box.vy + ' ' + box.vw + ' ' + box.vh);
    }

    /* 把 SVG 的 viewBox 從 from 補間到 to：跟 js/reaction_drop.js 的 tweenViewBox
       同一個模式——每一影格自己用經過的時間算位置，不靠 CSS transition；
       setTimeout 當安全網，分頁被切到背景、requestAnimationFrame 整個暫停時，
       時間到了還是會強制跳到終點、resolve 掉，後面「暫停兩秒再出現按鈕」的
       流程才不會卡住。 */
    /* 把 viewBox 從 from 補間到 to（逐影格算位置）；setTimeout 當安全網，分頁在背景時 rAF 暫停也會強制跳到終點 */
    function tweenViewBox(svg, from, to, duration) {
        return new Promise(function (resolve) {
            /* Promise：代表「之後會完成的事」，resolve() 表示完成 */
            if (REDUCED || duration <= 0) { setViewBox(svg, to); resolve(); return; }
            var done = false;
            function finishOnce() {
                if (done) return;
                done = true;
                setViewBox(svg, to);
                resolve();
            }
            var t0 = performance.now();
            function frame(now) {
                if (done) return;
                var p = Math.min(1, (now - t0) / duration);
                var e = easeInOutCubic(p);
                setViewBox(svg, {
                    vx: from.vx + (to.vx - from.vx) * e,
                    vy: from.vy + (to.vy - from.vy) * e,
                    vw: from.vw + (to.vw - from.vw) * e,
                    vh: from.vh + (to.vh - from.vh) * e
                });
                if (p < 1) requestAnimationFrame(frame); else finishOnce();
            }
            requestAnimationFrame(frame);
            setTimeout(finishOnce, duration + 400);
        });
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        /* 舊版最佳紀錄存的是 px，現在存公分（4 位小數、第 3／4 位不為 0）：第一次進來換算一次 */
        Reaction.migrateBest(ID, function (px) { return Leaderboard.fake4(cmOf(px)); });
        /* 替整個畫面加上白底 class */
        root.classList.add('imp-white-bg');

        /* 照片的長寬比只需要量一次（不會因為重玩而改變），先用一個不會進畫面的
           Image() 探測，知道比例之後，SVG 裡的 <image> 才能用「寬 150、高照比例
           自動算」正確擺好，不用每次重玩都重新量一次、也不用等它在畫面上真的
           載完才能繼續（量完之後 SVG 再載入同一個網址，瀏覽器會直接用快取）。 */
        /* 照片的長寬比只量一次：先用不會進畫面的 Image() 探測 */
        var ratio = null;
        function withRatio(cb) {
            if (ratio != null) { cb(); return; }
            var probe = new Image();
            probe.onload = function () { ratio = probe.naturalHeight / probe.naturalWidth; cb(); };
            probe.onerror = function () { ratio = 84 / 416; cb(); };
            probe.src = IMG_SRC;
        }

        /* round：開一局 */
        function round() { withRatio(startRound); }

        /* startRound：真正畫出畫面 */
        function startRound() {
            root.innerHTML = '';
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            var field = h('div', { 'class': 'imp-field' });
            root.appendChild(field);

            /* FW／FH 場地大小；imgH 照片高；maxY 照片最多能掉到哪裡（下緣碰到警戒線） */
            var FW = field.clientWidth, FH = field.clientHeight;
            var imgH = IMG_W * ratio;
            var imgX = (FW - IMG_W) / 2;
            var barY = FH - BAR_H;
            var maxY = barY - imgH;     /* 圖片 y 最多能到哪裡（下緣剛好碰到警戒線上緣） */

            var svg = svgEl('svg', { 'class': 'imp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'xMidYMid slice' });
            field.appendChild(svg);

            /* 摔到警戒線時照片要變紅：用 SVG 濾鏡 feColorMatrix 重新計算每個像素的 RGB，alpha 不變，所以透明的部分仍然透明 */
            /* 摔到警戒線時照片要變紅：用 SVG 濾鏡 feColorMatrix 重新計算每個像素的 RGB，
               alpha（透明度）那一列原封不動（0 0 0 1 0＝輸出 alpha ＝ 輸入 alpha），
               所以照片本來透明的部分仍然透明、半透明的邊緣也維持原本的半透明。
               RGB 三列：R＝0.78＋0.22×亮度、G／B＝0.08×亮度（亮度＝0.2126R＋0.7152G＋0.0722B）
               ——整張照片染成鮮紅，同時保留一點深淺，不會變成完全平的紅色剪影。
               color-interpolation-filters="sRGB"：不然瀏覽器預設在線性 RGB 空間算，顏色會偏掉。 */
            var defs = svgEl('defs', {});
            var hitFilter = svgEl('filter', { id: 'imp-hit-red', 'color-interpolation-filters': 'sRGB' });
            hitFilter.appendChild(svgEl('feColorMatrix', {
                type: 'matrix',
                values: [
                    '0.0468 0.1573 0.0159 0 0.78',
                    '0.0170 0.0572 0.0058 0 0',
                    '0.0170 0.0572 0.0058 0 0',
                    '0 0 0 1 0'
                ].join(' ')
            }));
            defs.appendChild(hitFilter);
            svg.appendChild(defs);

            var imgEl = svgEl('image', { x: imgX, y: 0, width: IMG_W, height: imgH });
            imgEl.setAttributeNS(XLINKNS, 'href', IMG_SRC);
            imgEl.setAttribute('href', IMG_SRC);
            svg.appendChild(imgEl);

            var barEl = svgEl('rect', { 'class': 'imp-bar-rect', x: 0, y: barY, width: FW, height: BAR_H });
            svg.appendChild(barEl);

            var hint = h('div', { 'class': 'imp-hint', text: '點擊畫面讓阿湯哥下降' });
            field.appendChild(hint);
            /* 操作提示（只在第一次進遊戲時）：點畫面任一處 → 手指縮放，放在畫面中下方（不擋住下墜的照片） */
            if (Reaction.kit.once('impossible.hint')) Reaction.kit.hintOn(root, root, { mode: 'tap', fy: 0.72, text: '請點擊畫面' });

            var phase = 'idle';   /* idle：等第一下點擊／falling：下墜中／done：定格、推進或已結束 */
            var raf = null;

            /* 「點擊畫面任一處」：監聽整個 field，不是某一顆按鈕——phase 決定這一下
               點擊的意思是「開始下墜」還是「停止下墜」，done 階段點畫面不做事，
               只有鏡頭推進完、停留兩秒後出現的「再挑戰一次」小按鈕才能重來。
               用 pointerdown（手指一碰到螢幕就觸發），不是 click——click 在觸控
               裝置上要等手指離開螢幕（touchend）才會觸發，對「算準時機」的遊戲
               來說，玩家看準時機點下去的那一刻跟遊戲真正判定的時間點會差了
               手指按著不放的時間，時機全部算錯（跟「神準落下」的 dropBtn 用
               同一個理由、同一招）。 */
            /* 點畫面：idle 時開始下墜，falling 時停住（用 pointerdown，不是 click，時機才準） */
            field.addEventListener('pointerdown', function (e) {
                if (phase === 'idle') { e.preventDefault(); if (window.Sfx) Sfx.play('whoosh'); startFall(); }
                else if (phase === 'falling') { e.preventDefault(); if (window.Sfx) Sfx.play('click'); stopFall(); }
            });

            /* 開始下墜 */
            function startFall() {
                phase = 'falling';
                hint.textContent = '點擊畫面讓阿湯哥停止';
                hint.classList.add('imp-hint--danger');

                /* t0 開始時間 */
                var t0 = performance.now();
                var landed = false;
                /* frame：每個畫面更新一次；自由落體位置 y = ½ × a × t² */
                function frame(now) {
                    if (landed) return;
                    var t = (now - t0) / 1000;
                    var y = 0.5 * ACCEL * t * t;
                    if (y >= maxY) {
                        landed = true;
                        imgEl.setAttribute('y', maxY);
                        finish(true, maxY);
                        return;
                    }
                    imgEl.setAttribute('y', y);
                    raf = requestAnimationFrame(frame);
                }
                raf = requestAnimationFrame(frame);
            }

            /* 停止：取消 rAF 的迴圈，記下當下位置 */
            function stopFall() {
                cancelAnimationFrame(raf);
                finish(false, parseFloat(imgEl.getAttribute('y')) || 0);
            }

            /* 推進目標：簡單規則——鏡頭框的上緣＝照片自己的上緣（vy = imgY），
               框的下緣＝警戒線的下緣（vy + vh = barY + BAR_H = FH，也就是整個
               欄位的下緣）。推進到底的時候：
               · 照片上緣貼齊遊戲畫面上緣（照片一直往上升、一直放大，直到頂到
                 畫面最上面才停下來）；
               · 紅色警戒線下緣貼齊遊戲畫面下緣（警戒線永遠在畫面最底部，
                 不會浮到畫面中間，推進的整段過程也是——因為起點跟終點的
                 vy + vh 都剛好是 FH，補間出來的每一影格也都是 FH）。
               照片（不裁切高度）、阿湯哥下緣到警戒線的距離、警戒線本身，三樣
               一起撐滿整個畫面高度；寬高比跟欄位本身一致，推進到底不會變形。
               「警戒線」文字標籤因此沒有地方放在警戒線下面了，改成寫在警戒線
               本身上面（見 addMeasure）。 */
            /* 算出鏡頭推進的目標範圍（viewBox）：上緣＝照片上緣，下緣＝警戒線下緣 */
            function zoomBoxFor(imgY, gapPx) {
                var gapTop = imgY + imgH, gapBottom = gapTop + gapPx, gapMid = (gapTop + gapBottom) / 2;
                var vy = Math.max(0, imgY);
                var vh = FH - vy;
                var vw = vh * (FW / FH);
                var vx = (FW - vw) / 2;
                return { vx: vx, vy: vy, vw: vw, vh: vh, gapTop: gapTop, gapBottom: gapBottom, gapMid: gapMid };
            }

            /* 鏡頭推進完，把量尺（藍線＋上下箭頭＋公分數）跟結果文字、警戒線標籤
               一起加進同一個 SVG——全部用 box.vh 的比例算字級／粗細，鏡頭還沒
               推進時這些東西很小、幾乎看不出來，鏡頭推進的過程中它們會跟著整個
               畫面一起被放大到看得清楚，不是推進完才突然冒出來。 */
            /* 鏡頭推進後加上量尺（藍線與箭頭）、公分數與成功／失敗文字；大小都用 box.vh 的比例算，所以會跟著畫面一起放大 */
            function addMeasure(box, success, cm, isNew) {
                var midX = FW / 2;
                var k = FH / box.vh;                 /* 推進到底之後，1 個 SVG 單位在畫面上是幾 px */
                var lineW = Math.max(2, box.vh * 0.012);
                var titleSize = box.vh * 0.085;
                var numSize = box.vh * 0.09;
                var newSize = box.vh * 0.05;
                var pillH = numSize * 1.5;

                /* 量尺線＋箭頭：照實際距離畫（gapTop 到 gapBottom）——距離越小，
                   這條線本身自然就越短（距離是 0 的時候整條線跟箭頭都不畫），
                   這是誠實呈現，不用造假；箭頭太大塞不進很短的距離時，箭頭跟著縮小。 */
                if (box.gapBottom - box.gapTop > 0.5) {
                    var arrowSize = Math.min(box.vh * 0.045, (box.gapBottom - box.gapTop) / 2.2);
                    svg.appendChild(svgEl('line', {
                        'class': 'imp-measure-line', x1: midX, y1: box.gapTop, x2: midX, y2: box.gapBottom, 'stroke-width': lineW
                    }));
                    svg.appendChild(svgEl('polygon', {
                        'class': 'imp-measure-line',
                        points: (midX - arrowSize) + ',' + (box.gapTop + arrowSize) + ' ' + (midX + arrowSize) + ',' + (box.gapTop + arrowSize) + ' ' + midX + ',' + box.gapTop
                    }));
                    svg.appendChild(svgEl('polygon', {
                        'class': 'imp-measure-line',
                        points: (midX - arrowSize) + ',' + (box.gapBottom - arrowSize) + ' ' + (midX + arrowSize) + ',' + (box.gapBottom - arrowSize) + ' ' + midX + ',' + box.gapBottom
                    }));
                }

                /* 標題／數字／（新紀錄）排成一疊，整疊的位置規則：
                   · 距離夠大：整疊置中在量尺線的正中央（gapMid）；
                   · 距離很小（甚至是 0）：塞不進 gapTop～gapBottom 這一小段，整疊
                     往上推，下緣最多頂到警戒線上緣（gapBottom）為止，多出來的部分
                     疊在照片下緣上——絕對不能疊到警戒線本身：「任務失敗」跟警戒線
                     都是紅色，紅字疊紅底等於看不見。
                   警戒線下緣就是整個畫面的下緣，畫面下面已經沒有空間可以往下排了，
                   所以只能往上推。 */
                var pad = box.vh * 0.02;
                var titleH = titleSize * 1.15;
                var newH = newSize * 1.3;
                var stackH = titleH + pad + pillH + (isNew ? pad + newH : 0);
                var stackBottom = Math.min(box.gapMid + stackH / 2, box.gapBottom - pad * 0.5);
                var stackTop = Math.max(stackBottom - stackH, box.vy + pad);
                var titleY = stackTop + titleSize * 0.95;
                var numY = stackTop + titleH + pad + pillH / 2;

                var title = svgEl('text', {
                    'class': 'imp-measure-title ' + (success ? 'imp-measure-title--ok' : 'imp-measure-title--bad'),
                    x: midX, y: titleY, 'font-size': titleSize, 'text-anchor': 'middle', 'stroke-width': titleSize * 0.14
                });
                title.textContent = success ? '成功！' : '任務失敗';
                svg.appendChild(title);

                /* 數字最長會長到「4200.00 公分」這種寬度，所以 pill 的寬度不是猜的，
                   而是先把字畫上去、量出字實際多寬（getComputedTextLength），再包一圈
                   留白；萬一比整個鏡頭框還寬（鏡頭推得很近時框很窄），就把字級等比縮小。 */
                var pill = svgEl('rect', { 'class': 'imp-measure-pill', height: pillH, rx: pillH / 2 });
                svg.appendChild(pill);
                var numText = svgEl('text', {
                    'class': 'imp-measure-num', x: midX, y: numY, 'font-size': numSize, 'text-anchor': 'middle', 'dominant-baseline': 'central'
                });
                numText.textContent = fmtCm(cm);
                svg.appendChild(numText);
                var textW = numText.getComputedTextLength();
                var shrink = Math.min(1, (box.vw * 0.96) / (textW + numSize * 0.9));
                if (shrink < 1) { numText.setAttribute('font-size', numSize * shrink); textW *= shrink; }
                var pillW = textW + numSize * 0.9 * shrink;
                pill.setAttribute('x', midX - pillW / 2);
                pill.setAttribute('y', numY - pillH / 2);
                pill.setAttribute('width', pillW);

                if (isNew) {
                    var newRec = svgEl('text', {
                        'class': 'imp-measure-newrec', x: midX, y: numY + pillH / 2 + pad + newSize, 'font-size': newSize,
                        'text-anchor': 'middle', 'stroke-width': newSize * 0.14
                    });
                    newRec.textContent = '新紀錄！';
                    svg.appendChild(newRec);
                }

                /* 「警戒線」標籤：寫在警戒線本身上面（靠左），白字＋紅色描邊。
                   字級依「警戒線在畫面上的厚度」決定（厚度＝BAR_H × k）：推進得很近、
                   警戒線很粗的時候，字剛好塞得進線裡；距離很遠、警戒線只有幾 px 厚
                   的時候，字至少維持 13px 才讀得到，多出來的部分往上超出警戒線，
                   靠紅色描邊在白底上也讀得清楚。字貼著畫面下緣擺（只會往上超出，
                   不會被畫面下緣切掉），靠左是為了避開置中的「再挑戰一次」按鈕。 */
                var labelPx = Math.max(13, Math.min(28, BAR_H * k * 0.75));
                var labelSize = labelPx / k;
                var labelBottomPad = Math.max(0, (BAR_H - labelSize) / 2);
                var label = svgEl('text', {
                    'class': 'imp-measure-label', x: box.vx + box.vw * 0.03, y: box.vy + box.vh - labelBottomPad - labelSize * 0.2,
                    'font-size': labelSize, 'text-anchor': 'start', 'stroke-width': labelSize * 0.16
                });
                label.textContent = '警戒線';
                svg.appendChild(label);
            }

            /* crashed：true＝還沒點擊就先摔到警戒線上了；false＝玩家自己停下來的。
               不管哪一種都接著做同一套「定格→鏡頭推進」演出，推進完才判定成功
               或失敗——碰到警戒線（crashed）一律算失敗，沒碰到的話要停在
               低於 SUCCESS_CM 才算成功，純粹停下來、但離警戒線太遠，也算失敗。 */
            /* finish：定格一秒 → 鏡頭推進 → 停留兩秒 → 出現「再挑戰一次」；crashed 為 true 表示直接摔到警戒線 */
            function finish(crashed, imgY) {
                phase = 'done';
                if (crashed) imgEl.setAttribute('filter', 'url(#imp-hit-red)');   /* 撞到地面：照片變紅 */
                var gapPx = Math.max(0, barY - (imgY + imgH));
                /* 最終成績（公分）：第 3、4 位不為 0，只產生這一次；判定成功、最佳紀錄、鏡頭推進後顯示的數字都用它
                   （真實的距離 gapPx 仍然用來決定鏡頭放大的範圍，畫面上的量尺線是照實際距離畫的） */
                var rawCm = cmOf(gapPx);
                var cm = Leaderboard.fake4(rawCm);
                console.log('不可能任務：實際 ' + rawCm.toFixed(6) + ' 公分（' + gapPx.toFixed(4) + ' px）→ 成績 ' + cm.toFixed(4) + ' 公分');
                var success = !crashed && cm < SUCCESS_CM;

                var isNew = success && Reaction.setBest(ID, cm, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));

                /* 定格一秒（參考使用者給的示意圖：剛停下來那一刻，提示文字都還在、
                   畫面維持原樣不動），玩家才看得清楚剛剛發生了什麼事，再開始推進。 */
                /* UI.wait(毫秒).then(...)：等一下再做，.then 串起連續動作 */
                UI.wait(REDUCED ? 0 : PAUSE_BEFORE_MS).then(function () {
                    hint.style.display = 'none';
                    var box = zoomBoxFor(imgY, gapPx);
                    addMeasure(box, success, cm, isNew);
                    return tweenViewBox(svg, { vx: 0, vy: 0, vw: FW, vh: FH }, box, ZOOM_MS);
                }).then(function () {
                    return UI.wait(HOLD_AFTER_MS);
                }).then(function () {
                    /* 結算彈窗（公版 kit.result）：貼在畫面下緣、背後不壓暗——放大後的量尺還要看得到。
                       只有「成功」才給 score（才會送世界排行榜）！摔到警戒線（crashed）時距離是 0 公分，
                       如果不判斷 success 就送，失敗會變成世界第一名的 0.0000 公分；
                       離太遠的失敗（≥ 30 公分）則本來就不在有效範圍 */
                    Reaction.kit.result(root, {
                        num: success ? cm.toFixed(4) + ' 公分' : (crashed ? '摔到警戒線了' : '離警戒線太遠了'),
                        label: success ? (cm < 1 ? '超級驚險！' : '成功停在警戒線前') : '挑戰失敗',
                        isNew: isNew, score: success ? cm : null, dock: 'bottom',
                        sfx: success ? (cm < 1 ? 'perfect' : 'win') : 'fail', onAgain: round
                    });
                });
            }
        }

        round();
    }

    /* Reaction.register：把這款遊戲登記到遊戲清單 */
    Reaction.register({
        id: ID,
        name: '不可能任務',
        rule: '畫面上方是阿湯哥，下方是一條紅色警戒線。點一下畫面，他就會像自由落體一樣開始往下墜落；**算準時機再點一下畫面，就能讓他停在半空中**。停下來之後鏡頭會平順地推進拉近，讓你看清楚他跟警戒線之間還差幾公分——**停在 30 公分以下才算任務成功**（要低於 30），其餘（包含直接摔到警戒線上，他會變成紅色）都算失敗！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE
    });
})();
