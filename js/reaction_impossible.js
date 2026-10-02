/* ═══════════════════════════════════════════════════════════════════
   reaction_impossible.js — 秒反應・不可能任務
   畫面上緣是阿湯哥、下緣是一條紅色警戒線。點一下畫面讓他開始自由落體下墜，
   算準時機再點一下讓他停住。停下來（或直接摔到警戒線上）先定格一秒，接著
   鏡頭平順地推進，放大「阿湯哥下緣～警戒線上緣」這一小段距離，讓玩家看清楚
   自己到底有多驚險；停在警戒線 100 公分以內才算任務成功，其餘（含直接摔上去）
   都算失敗。
   ───────────────────────────────────────────────────────────────────
   · 整個畫面（阿湯哥的照片＋警戒線）都畫在同一個 <svg> 裡，鏡頭推進＝補間
     這個 SVG 的 viewBox，從「看得到整個欄位」慢慢縮小到「照片（完全不裁切）
     ＋警戒線＋底下一點空間」——這是跟「神準落下」完全同一種手法：鏡頭看到的
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
     10 倍＋顯示到小數點兩位（見 MEASURE_PX_PER_CM 旁的說明），不是真實的
     公制單位，純粹是為了讓數字看起來更精準、更有戲劇效果。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'impossible';
    var h = UI.h;
    var SVGNS = 'http://www.w3.org/2000/svg';
    var XLINKNS = 'http://www.w3.org/1999/xlink';
    var IMG_SRC = 'images/Impossible.png';

    var GRAVITY = 9.8;      /* 重力加速度（公尺／秒²），真實世界的數字 */
    var PX_PER_M = 50;      /* 下墜速度用這個換算 1 公尺等於多少邏輯 px——想讓下墜更快/更慢，調這個數字就好 */
    var ACCEL = GRAVITY * PX_PER_M; /* px/s² */
    var SUCCESS_CM = 100;    /* 停在警戒線幾「公分」以內才算成功（跟 MEASURE_PX_PER_CM 是配套的，見下面說明） */
    /* MEASURE_PX_PER_CM：量距離、算成不成功用的換算比例，刻意跟上面下墜速度
       用的 PX_PER_M 不是同一把尺！如果距離也套用「50px=1公尺」，10 公分只有
       5px，用 ACCEL=490 算一下：落地瞬間速度約 828 px/s，5px 的容許誤差換算
       成時間只有約 6 毫秒——比一格畫面更新（約 16 毫秒）還短，等於沒有人按
       得到，成功門檻會變成數學上不可能達成。放寬距離的換算比例，容許誤差
       換算成時間才會是玩家靠練習、抓節奏真的碰得到的範圍——下墜本身仍然是
       道地的 9.8 m/s² 重力感，只有「量尺的粗細」不一樣，兩者本來就是「動畫
       節奏」跟「判定寬容度」兩件不同的事，不需要共用同一把尺。
       數字特意放大 10 倍（1px 算 1「公分」，不是 10px 算 1 公分）＋顯示到
       小數點兩位，純粹是為了讓玩家覺得畫面上的數字很精準、很有戲劇效果；
       SUCCESS_CM 也跟著從 10 放大成 100，兩個一起放大、容許的「真實」誤差
       跟放大前完全一樣，只是看起來的數字更大、更好看。 */
    var MEASURE_PX_PER_CM = 1;
    var IMG_W = 150;         /* 阿湯哥照片顯示寬度（邏輯 px），高度照片自己的長寬比算 */
    var BAR_H = 10;          /* 警戒線高度 */
    var PAUSE_BEFORE_MS = 1000; /* 停下來（或摔到線上）先定格這麼久，玩家才看得清楚剛剛發生了什麼事 */
    var ZOOM_MS = 1300;      /* 鏡頭推進（viewBox 補間）的時間 */
    var HOLD_AFTER_MS = 2000;   /* 推進完、看清楚結果之後，停留多久才出現「再挑戰一次」 */
    var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* cmOf 回傳沒有四捨五入的精確數字，拿來比較（<=SUCCESS_CM）跟存最佳紀錄；
       要「顯示」（含小數點兩位）一律另外呼叫 fmtCm()，兩件事分開處理。 */
    function cmOf(px) { return Math.max(0, px) / MEASURE_PX_PER_CM; }
    function fmtCm(cm) { return cm.toFixed(2) + ' 公分'; }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + fmtCm(v); }
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function svgEl(tag, attrs) {
        var el = document.createElementNS(SVGNS, tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }
    function setViewBox(svg, box) {
        svg.setAttribute('viewBox', box.vx + ' ' + box.vy + ' ' + box.vw + ' ' + box.vh);
    }

    /* 把 SVG 的 viewBox 從 from 補間到 to：跟 js/reaction_drop.js 的 tweenViewBox
       同一個模式——每一影格自己用經過的時間算位置，不靠 CSS transition；
       setTimeout 當安全網，分頁被切到背景、requestAnimationFrame 整個暫停時，
       時間到了還是會強制跳到終點、resolve 掉，後面「暫停兩秒再出現按鈕」的
       流程才不會卡住。 */
    function tweenViewBox(svg, from, to, duration) {
        return new Promise(function (resolve) {
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

    function mount(root, ctx) {
        root.classList.add('imp-white-bg');

        /* 照片的長寬比只需要量一次（不會因為重玩而改變），先用一個不會進畫面的
           Image() 探測，知道比例之後，SVG 裡的 <image> 才能用「寬 150、高照比例
           自動算」正確擺好，不用每次重玩都重新量一次、也不用等它在畫面上真的
           載完才能繼續（量完之後 SVG 再載入同一個網址，瀏覽器會直接用快取）。 */
        var ratio = null;
        function withRatio(cb) {
            if (ratio != null) { cb(); return; }
            var probe = new Image();
            probe.onload = function () { ratio = probe.naturalHeight / probe.naturalWidth; cb(); };
            probe.onerror = function () { ratio = 84 / 416; cb(); };
            probe.src = IMG_SRC;
        }

        function round() { withRatio(startRound); }

        function startRound() {
            root.innerHTML = '';
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            var field = h('div', { 'class': 'imp-field' });
            root.appendChild(field);

            var FW = field.clientWidth, FH = field.clientHeight;
            var imgH = IMG_W * ratio;
            var imgX = (FW - IMG_W) / 2;
            var barY = FH - BAR_H;
            var maxY = barY - imgH;     /* 圖片 y 最多能到哪裡（下緣剛好碰到警戒線上緣） */

            var svg = svgEl('svg', { 'class': 'imp-svg', viewBox: '0 0 ' + FW + ' ' + FH, preserveAspectRatio: 'xMidYMid slice' });
            field.appendChild(svg);

            var imgEl = svgEl('image', { x: imgX, y: 0, width: IMG_W, height: imgH });
            imgEl.setAttributeNS(XLINKNS, 'href', IMG_SRC);
            imgEl.setAttribute('href', IMG_SRC);
            svg.appendChild(imgEl);

            var barEl = svgEl('rect', { 'class': 'imp-bar-rect', x: 0, y: barY, width: FW, height: BAR_H });
            svg.appendChild(barEl);

            var hint = h('div', { 'class': 'imp-hint', text: '點擊畫面讓阿湯哥下降' });
            field.appendChild(hint);

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
            field.addEventListener('pointerdown', function (e) {
                if (phase === 'idle') { e.preventDefault(); startFall(); }
                else if (phase === 'falling') { e.preventDefault(); stopFall(); }
            });

            function startFall() {
                phase = 'falling';
                hint.textContent = '點擊畫面讓阿湯哥停止';
                hint.classList.add('imp-hint--danger');

                var t0 = performance.now();
                var landed = false;
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

            function stopFall() {
                cancelAnimationFrame(raf);
                finish(false, parseFloat(imgEl.getAttribute('y')) || 0);
            }

            /* 推進目標：簡單規則——鏡頭框住「整張照片（從它自己的上緣開始，完全
               不裁切）＋阿湯哥下緣到警戒線的距離＋警戒線本身＋底下留一點空間放
               「警戒線」文字標籤」，框的上緣永遠等於照片的上緣（vy = imgY）。
               推進到底的時候，viewBox 的上緣會跟照片的上緣重合，畫面上看起來
               就是「照片一直往上升、一直放大，直到頂到畫面最上面才停下來」
               ——這就是使用者要的效果，不用另外算什麼置中、留白，單純讓整張
               照片（不裁切）＋它下面的東西，一起撐滿整個畫面高度。
               寬高比跟欄位本身一致，推進到底不會變形。 */
            var LABEL_SPACE = 50; /* 警戒線下方要留給「警戒線」文字的空間 */
            function zoomBoxFor(imgY, gapPx) {
                var gapTop = imgY + imgH, gapBottom = gapTop + gapPx, gapMid = (gapTop + gapBottom) / 2;
                var vh = Math.min(FH, imgH + gapPx + BAR_H + LABEL_SPACE);
                var vw = vh * (FW / FH);
                /* vy 一定要等於 imgY，不能再夾到「不超過 FH-vh」——欄位本身到警戒線
                   下緣就結束了（barY+BAR_H 剛好等於 FH），LABEL_SPACE 那塊空間本來
                   就得畫到 FH 以外（SVG 沒有畫布邊界限制，FH 以外沒有其他內容、
                   只是空白，不會露出奇怪的東西）。之前多加的那個上限夾住會讓 vy
                   被往回拉，造成「照片上緣沒有真的貼齊畫面上緣」，正是這次要修的問題。 */
                var vy = Math.max(0, imgY);
                var vx = (FW - vw) / 2;
                return { vx: vx, vy: vy, vw: vw, vh: vh, gapTop: gapTop, gapBottom: gapBottom, gapMid: gapMid };
            }

            /* 鏡頭推進完，把量尺（藍線＋上下箭頭＋公分數）跟結果文字、警戒線標籤
               一起加進同一個 SVG——全部用 box.vh 的比例算字級／粗細，鏡頭還沒
               推進時這些東西很小、幾乎看不出來，鏡頭推進的過程中它們會跟著整個
               畫面一起被放大到看得清楚，不是推進完才突然冒出來。 */
            function addMeasure(box, success, cm, isNew) {
                var midX = FW / 2;
                var lineW = Math.max(2, box.vh * 0.012);
                var arrowSize = box.vh * 0.045;
                var titleSize = box.vh * 0.085;
                var numSize = box.vh * 0.09;
                var labelSize = box.vh * 0.055;
                var pillW = numSize * 4.3, pillH = numSize * 1.5;

                /* 量尺線＋箭頭：照實際距離畫（gapTop 到 gapBottom）——距離越小，
                   這條線本身自然就越短（甚至是 0，距離剛好是 0 的時候），這是
                   誠實呈現，不用造假。
                   標題／數字的「位置」則是另一回事：真正的距離很小、甚至是 0 時，
                   如果硬要把標題跟數字都塞在 gapTop～gapBottom 這一小段裡，兩個
                   會疊在一起看不清楚（這是「公分數跟標題疊在一起」這個問題的
                   根本原因）。所以位置改成「從照片下緣往下依序排」：標題先排，
                   數字接著排在標題下面、保留足夠間距，不夠放的時候才會疊到照片
                   下緣本身（文字有底色，疊在照片上還是看得清楚）；數字如果真的
                   有足夠空間（距離夠大），還是會優先擺在 gapMid（量尺線的正中央）
                   比較好看，只有空間不夠時才會被往下推開。 */
                /* titleY 不能單純「貼著照片下緣往下一點」：距離很小（甚至是 0）時，
                   gapTop 會很接近、甚至等於 gapBottom（警戒線上緣），往下一點就
                   直接疊到警戒線本身上面去了——「任務失敗」剛好也是跟警戒線一樣
                   的紅色，疊上去等於紅字疊紅底，完全看不見。所以多加一個上限：
                   標題的視覺下緣最多只能頂到警戒線上緣（gapBottom）為止，距離
                   真的太小時，標題會被往上推、疊到照片下緣本身（而不是疊到警戒
                   線），文字有自己的顏色跟粗體，疊在照片上還是看得清楚。 */
                var titleMaxY = box.gapBottom - titleSize * 0.25;
                var titleY = Math.min(box.gapTop + titleSize * 0.95, titleMaxY);
                var numY = Math.max(box.gapMid, titleY + titleSize * 0.5 + pillH / 2 + 8);
                var labelY = Math.max(box.gapBottom + BAR_H + labelSize * 1.3, numY + pillH / 2 + labelSize * 1.1);

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

                var title = svgEl('text', {
                    'class': 'imp-measure-title ' + (success ? 'imp-measure-title--ok' : 'imp-measure-title--bad'),
                    x: midX, y: titleY, 'font-size': titleSize, 'text-anchor': 'middle'
                });
                title.textContent = success ? '成功！' : '任務失敗';
                svg.appendChild(title);

                /* pillW 加寬：數字現在顯示到小數點兩位（例如「123.45 公分」比以前的
                   整數「12 公分」長不少），字寬得留夠空間才不會被裁掉。 */
                svg.appendChild(svgEl('rect', {
                    'class': 'imp-measure-pill', x: midX - pillW / 2, y: numY - pillH / 2, width: pillW, height: pillH, rx: pillH / 2
                }));
                var numText = svgEl('text', {
                    'class': 'imp-measure-num', x: midX, y: numY, 'font-size': numSize, 'text-anchor': 'middle', 'dominant-baseline': 'central'
                });
                numText.textContent = fmtCm(cm);
                svg.appendChild(numText);

                var label = svgEl('text', {
                    'class': 'imp-measure-label', x: midX, y: labelY, 'font-size': labelSize, 'text-anchor': 'middle'
                });
                label.textContent = '警戒線';
                svg.appendChild(label);

                if (isNew) {
                    var newRec = svgEl('text', {
                        'class': 'imp-measure-newrec', x: midX, y: labelY + labelSize * 1.3, 'font-size': labelSize, 'text-anchor': 'middle'
                    });
                    newRec.textContent = '新紀錄！';
                    svg.appendChild(newRec);
                }
            }

            /* crashed：true＝還沒點擊就先摔到警戒線上了；false＝玩家自己停下來的。
               不管哪一種都接著做同一套「定格→鏡頭推進」演出，推進完才判定成功
               或失敗——碰到警戒線（crashed）一律算失敗，沒碰到的話要停在
               SUCCESS_CM 以內才算成功，純粹停下來、但離警戒線太遠，也算失敗。 */
            function finish(crashed, imgY) {
                phase = 'done';
                var gapPx = Math.max(0, barY - (imgY + imgH));
                var cm = cmOf(gapPx);
                var success = !crashed && cm <= SUCCESS_CM;

                var isNew = success && Reaction.setBest(ID, cm, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));

                /* 定格一秒（參考使用者給的示意圖：剛停下來那一刻，提示文字都還在、
                   畫面維持原樣不動），玩家才看得清楚剛剛發生了什麼事，再開始推進。 */
                UI.wait(REDUCED ? 0 : PAUSE_BEFORE_MS).then(function () {
                    hint.style.display = 'none';
                    var box = zoomBoxFor(imgY, gapPx);
                    addMeasure(box, success, cm, isNew);
                    return tweenViewBox(svg, { vx: 0, vy: 0, vw: FW, vh: FH }, box, ZOOM_MS);
                }).then(function () {
                    return UI.wait(HOLD_AFTER_MS);
                }).then(function () {
                    field.appendChild(h('button', { 'class': 'btn btn--primary imp-restart-btn', text: '再挑戰一次', on: { click: round } }));
                });
            }
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '不可能任務',
        rule: '畫面上方是阿湯哥，下方是一條紅色警戒線。點一下畫面，他就會像自由落體一樣開始往下墜落；算準時機再點一下畫面，就能讓他停在半空中。停下來之後鏡頭會平順地推進拉近，讓你看清楚他跟警戒線之間還差幾公分——停在 100 公分以內才算任務成功，其餘（包含直接摔到警戒線上）都算失敗！',
        mount: mount
    });
})();
