/* ═══════════════════════════════════════════════════════════════════
   reaction_drop.js — 秒反應・神準落下
   像一根釘子從高處自由落下、釘在下方的木頭尺上：9 格方塊左右來回移動，算準時機
   按「落下」，藍色三角形以重力加速度（越落越快，不是等速被丟出去）落下並釘在
   接觸點上，不會消失。接觸點就是畫面放大的圓心，畫面持續往同一個點放大，
   讓玩家看清楚釘在幾點幾分的細部位置：插中中間的紅，再放大看紅裡的黃核心，
   再放大看黃裡的紫核心＝最精準。
   ───────────────────────────────────────────────────────────────────
   · 尺（9 格＋插中後才看得到的 9×9、9×9×9 細格）整塊用 SVG 畫成向量圖、
     一開始就把三層全部畫好（不是插中才動態生出來）：格線本來就在那裡，
     只是太細看不到，鏡頭放大才看得清楚，像用顯微鏡發現本來就存在的精細刻度。
     細格之間的分隔線刻意不用 vector-effect:non-scaling-stroke，讓它跟著
     畫面一起放大變粗——平常幾乎看不見的細線，放大後才變成清楚的刻度。
   · **放大一定要靠改 `viewBox`，不能用 CSS `transform: scale()`**：瀏覽器對
     transform 通常是把元素先點陣化（rasterize）成一張點陣圖，再用 GPU 把那張
     點陣圖整個拉大，放大倍率一高就會整片糊掉，因為點陣圖的來源解析度根本不夠。
     改 `viewBox` 則是請瀏覽器拿同一份向量幾何資料、在「同一個固定大小的畫布」上
     重新算一次要畫哪一小塊，不管縮得多進去都是重新運算出來的線條，永遠銳利。
   · **放大要露出「整排」，不要只摳中間一小塊**：目標不是把畫面摳到只剩單一格
     填滿螢幕，而是讓「這一層的 9 個格子」完整露出來（頭尾都看得到，帶一點點
     左右格子的邊當參考），插中紅色時看到紅格裡完整的 9 個子格（8 紅 1 黃），
     插中黃色核心時看到黃格裡完整的 9 個孫格（8 黃 1 紫）——`boxForStage()` 直接
     用目標格自己的寬度當 viewBox 寬度（乘一點點 ROW_MARGIN 留空間看相鄰格的邊），
     不是摳一小塊硬放大。
   · 放大分成兩段實際的鏡頭推進、三個停留點：落地先停在原本的畫面看清楚插在
     第幾格（停留點 0）；插中紅色才推進到「紅格的 9 子格」那一層，停住看清楚
     插中黃色了沒（停留點 1）；插中黃色核心才再推進到「黃格的 9 孫格」那一層，
     停住看清楚插中紫色了沒（停留點 2）——每一段推進本身要慢、停留要久，
     讓玩家感受到「又中了」的爽快感，不是不停頓地一路放大到底。
   · 開場演出：把上面這一整串「放大」動畫，用同一組函式，用時間倒過來播放
     （從最深的紫色，逐步往外退到完整畫面），讓玩家一開始就知道「最準會看到
     紫色」，知道這個遊戲最終要往哪個方向努力。播放時尺釘在正中央（數學上
     跟 ALT+A 的完美落點用同一個算法），播完才真正開放按「落下」。
   · ALT+A：測試用熱鍵，不用練準度就能看到「插中正中央、紅→黃→紫」的完整演出。
     利用 9 等分「自相似」的數學性質，把真正用來判定的 finalLeft 直接釘在
     contactX - stripW/2——這一個值必定同時是三層的正中央（idx1=idx2=idx3=4），
     不用另外造假資料；下落的物理動畫照常播放，只有落點被釘死，
     跟真的玩時走的是同一條程式路徑，不會不小心改到判定邏輯。
   · 結算畫面不清空畫面：藍色三角形釘在方塊上、鏡頭停在最後放大倍率的那一幕
     保留在背景，結算數字與「再挑戰一次」按鈕疊一層半透明卡片蓋在上面。
   · 尺（9 格方塊）永遠滿版顯示、左右不移動；改成「三角形」左右來回彈跳找時機。
     原因：如果要讓尺的顯示寬度滿版、又要讓尺自己左右移動，尺可以移動的範圍
     會比尺本身還窄，三角形能插中的格子永遠只剩邊緣那一兩格，9 格有 8 格摸不到
     （見下面 computeOutcome 旁的說明）。改成尺固定不動、三角形移動，滿版顯示
     跟「9 格都插得到」這兩個需求才能同時成立。
   · 按下「落下」之後，三角形的左右位置不會瞬間定住：垂直方向是重力下墜，
     水平方向則延續按下那一刻的移動速度／方向繼續算慣性（跟按下前的彈跳是
     同一條公式、同一個時間軸算出來的，見 bouncePos()），兩個方向同時進行，
     最終插在哪裡要同時考慮「按下的時機」跟「按下後慣性還會飄多遠」——這也是
     為什麼速度刻意不能太快（見下面「按「落下」之前」的說明），不然慣性飄走
     的距離會大到讓玩家完全猜不到會插在哪裡。
   · 開放按「落下」之後，上方的提示文字（算準時機按「落下」…）會變透明：
     避免玩家拿這行固定文字的位置／寬度當參考基準，去推算三角形目前的座標，
     變相降低了抓時機的難度；文字本身還在（只是 opacity: 0），版面不會跳動，
     下一局重新開始時會恢復顯示。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'drop';
    var h = UI.h;
    var SVGNS = 'http://www.w3.org/2000/svg';
    /* 落下的時間刻意調短：尺要來回移動得夠明顯（有反應力遊戲的節奏感），速度就不能太慢；
       但落下（650ms）這麼久的話，就算尺速度不快，落下期間尺也會移動超過好幾格，
       變成「怎麼按都插不到中間」。改成 380ms、尺的速度也調低，落下期間尺大約只移動
       1～3 格，插中紅色是真的靠算時機做得到的，不是純運氣。 */
    var FALL_MS = 380;          /* 重力落下的總時間 */
    var ROW_MARGIN = 1.15;      /* 放大到「這一層整排 9 格」之後，再多留一點，看得到相鄰格的邊 */
    var LABELS = [1, 2, 3, 4, null, 4, 3, 2, 1]; /* index 4＝紅（不寫數字，寫「5」）*/
    var ZOOM_STAGE_MS = 1150;   /* 每一段放大本身的時間（使用者要求：比原本再加 0.5 秒） */
    var ZOOM_PAUSE_MS = 850;    /* 放大到那一層之後，停格的時間（使用者要求：比原本再加 0.3 秒） */
    var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 分'; }

    function svgEl(tag, attrs) {
        var el = document.createElementNS(SVGNS, tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function setViewBox(svg, box) {
        svg.setAttribute('viewBox', box.vx + ' ' + box.vy + ' ' + box.vw + ' ' + box.vh);
    }

    /* 把 SVG 的 viewBox 從 from 緩動到 to：不是改 CSS transform，是每一影格
       重新算一次「要框住的範圍」，瀏覽器會照新的 viewBox 重新畫向量內容，
       所以放大過程本身也是銳利的，不會先點陣化再拉伸。ease 可以指定「放大」
       用先快後慢（easeOutCubic），「縮小」（開場演出倒帶）用先慢後快會更自然，
       預設用 easeInOutCubic 兩個方向都看得順。
       跟 fall() 同一個理由（見檔案上面的說明）：分頁切到背景、視窗被蓋住時，
       瀏覽器會整個暫停 requestAnimationFrame，frame() 從此不會再被呼叫，
       這個 tween 就會卡住、連帶整條開場演出／放大動畫的 Promise 鏈都卡死。
       用 setTimeout 當安全網：時間到了不管 rAF 有沒有正常跑完，都強制跳到
       終點、resolve 掉，動畫鏈才不會真的卡住。 */
    function tweenViewBox(svg, from, to, duration, ease) {
        ease = ease || easeInOutCubic;
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
                var e = ease(p);
                setViewBox(svg, {
                    vx: from.vx + (to.vx - from.vx) * e,
                    vy: from.vy + (to.vy - from.vy) * e,
                    vw: from.vw + (to.vw - from.vw) * e,
                    vh: from.vh + (to.vh - from.vh) * e
                });
                if (p < 1) requestAnimationFrame(frame);
                else finishOnce();
            }
            requestAnimationFrame(frame);
            setTimeout(finishOnce, duration + 400);
        });
    }

    /* 向量尺：三層遞迴九等分，一次畫好。depth1＝9 個 <rect>（中間紅，其餘黑，標數字）；
       depth1 的中間格底下疊 depth2（9 個 <rect>，中間黃，其餘紅，細分隔線）；
       depth2 的中間格底下再疊 depth3（9 個 <rect>，中間紫，其餘黃，更細的分隔線）。 */
    function buildStrip(stripW, stripH, cellW) {
        var subW = cellW / 9;
        var subsubW = subW / 9;
        var root = svgEl('svg', {
            'class': 'drop-strip-svg',
            viewBox: '0 0 ' + stripW + ' ' + stripH,
            preserveAspectRatio: 'none'
        });

        for (var i = 0; i < 9; i++) {
            var x = i * cellW;
            var mid = i === 4;
            root.appendChild(svgEl('rect', {
                x: x, y: 0, width: cellW, height: stripH,
                'class': 'drop-rect' + (mid ? ' drop-rect--mid' : '')
            }));
            if (!mid) {
                var t = svgEl('text', {
                    x: x + cellW / 2, y: stripH / 2,
                    'text-anchor': 'middle', 'dominant-baseline': 'central',
                    'class': 'drop-label'
                });
                t.textContent = String(LABELS[i]);
                root.appendChild(t);
            } else {
                buildSub(root, x, stripH, subW, subsubW);
            }
        }
        return root;
    }

    function buildSub(root, baseX, stripH, subW, subsubW) {
        var tickW = Math.max(0.03, subW * 0.05);
        for (var j = 0; j < 9; j++) {
            var x = baseX + j * subW;
            var mid = j === 4;
            root.appendChild(svgEl('rect', {
                x: x, y: 0, width: subW, height: stripH,
                'class': 'drop-subrect' + (mid ? ' drop-subrect--mid' : '')
            }));
            if (j > 0) root.appendChild(svgEl('line', {
                x1: x, x2: x, y1: 0, y2: stripH, 'stroke-width': tickW.toFixed(3), 'class': 'drop-tick2'
            }));
            if (mid) buildSubSub(root, x, stripH, subsubW);
        }
    }

    function buildSubSub(root, baseX, stripH, subsubW) {
        var tickW = Math.max(0.01, subsubW * 0.05);
        for (var k = 0; k < 9; k++) {
            var x = baseX + k * subsubW;
            var mid = k === 4;
            root.appendChild(svgEl('rect', {
                x: x, y: 0, width: subsubW, height: stripH,
                'class': 'drop-subsubrect' + (mid ? ' drop-subsubrect--mid' : '')
            }));
            if (k > 0) root.appendChild(svgEl('line', {
                x1: x, x2: x, y1: 0, y2: stripH, 'stroke-width': tickW.toFixed(4), 'class': 'drop-tick3'
            }));
        }
    }

    function mount(root, ctx) {
        ctx.setMeta(fmtBest(Reaction.getBest(ID)));

        /* 橫跨每一局（round）的狀態：ALT+A 的鍵盤監聽只註冊一次（見檔案最下面），
           但每次 round() 都會整個重建畫面與閉包，所以用這兩個 mount 層級的變數
           讓監聽器永遠讀得到「這一局」目前的狀態與觸發函式。 */
        var phase = 'intro';      /* intro：開場倒帶演出／idle：尺在閒置反彈／falling：下落＋變焦中／result：結果畫面 */
        var triggerPerfect = null;

        function round() {
            phase = 'intro';
            root.innerHTML = '';
            var hint = h('div', { 'class': 'hint', text: '算準時機按「落下」，插中紫色得最高分！' });
            root.appendChild(hint);
            var field = h('div', { 'class': 'drop-field' });
            root.appendChild(field);

            var FW = field.clientWidth, FH = field.clientHeight;
            var triW = FW / 10, triH = triW * 2;
            var stripW = FW, cellW = stripW / 9, subW = cellW / 9; /* 尺滿版顯示 */
            var stripH = Math.min(76, FH * 0.14);
            var triStartTop = 6;
            var triTargetTop = FH - stripH - triH;
            var maxTriLeft = FW - triW; /* 三角形左右可以彈跳的範圍（尺本身固定不動） */

            var strip = buildStrip(stripW, stripH, cellW);
            strip.style.height = stripH + 'px';
            strip.style.top = (FH - stripH) + 'px';
            strip.style.width = stripW + 'px';
            field.appendChild(strip);

            /* 三角形（釘子）獨立於尺之外：放大只改尺的 viewBox，不影響三角形的位置，
               才會有「釘住不動」的感覺。三角形的水平位置（left）會在下面的 idleLoop
               左右來回彈跳，尺本身固定在 left:0、寬度滿版，從頭到尾不移動。 */
            var triLeft = (FW - triW) / 2;
            var tri = h('div', { 'class': 'drop-tri' });
            tri.style.width = triW + 'px';
            tri.style.height = triH + 'px';
            tri.style.left = triLeft + 'px';
            tri.style.top = triStartTop + 'px';
            field.appendChild(tri);

            var dropBtn = h('button', { 'class': 'btn btn--primary drop-btn', text: '落下' });
            dropBtn.style.display = 'none';    /* 開場演出播完才顯示，避免玩家在演出時誤按 */
            field.appendChild(dropBtn);

            /* 放大目標：stage 0＝完整畫面；stage 1＝推進到「這一格的 9 個子格」整排露出；
               stage 2＝再推進到「子格裡那一格的 9 個孫格」整排露出。localCX＝接觸點在尺
               自己座標系裡的位置，從落地那一刻起到這局結束都不會變，用它才能保證放大時
               接觸點換算回螢幕座標永遠落在同一個像素。 */
            function boxForStage(stage, localCX) {
                if (stage === 0) return { vx: 0, vy: 0, vw: stripW, vh: stripH };
                var w = (stage === 1 ? cellW : subW) * ROW_MARGIN;
                var k = w / stripW;
                return { vx: localCX * (1 - k), vy: 0, vw: stripW * k, vh: stripH * k };
            }

            /* 開場：把「放大」的同一組 stage 用時間倒過來演一次（紫色的那一層退到完整畫面），
               先讓玩家知道「插得越準會看到紫色」。尺釘在正中央，跟 ALT+A 完美落點同一個算法
               （localCX = stripW/2，數學上保證同時是三層的正中央）。 */
            function playIntro(onDone) {
                var localCX = stripW / 2;
                strip.style.left = ((FW - stripW) / 2) + 'px';
                if (REDUCED) { setViewBox(strip, boxForStage(0, localCX)); onDone(); return; }
                setViewBox(strip, boxForStage(2, localCX));
                UI.wait(ZOOM_PAUSE_MS)
                    .then(function () { return tweenViewBox(strip, boxForStage(2, localCX), boxForStage(1, localCX), ZOOM_STAGE_MS); })
                    .then(function () { return UI.wait(ZOOM_PAUSE_MS); })
                    .then(function () { return tweenViewBox(strip, boxForStage(1, localCX), boxForStage(0, localCX), ZOOM_STAGE_MS); })
                    .then(function () { return UI.wait(ZOOM_PAUSE_MS); })
                    .then(onDone);
            }

            /* 按「落下」之前：三角形一般的來回反彈，還不需要預測結果。
               速度刻意放慢：落下要 380 毫秒，速度太快的話，不管什麼時候按，三角形都會在
               這段時間內移動超過一整格的寬度，變成「怎麼按都插不到中間」──
               放慢之後，落下時三角形大約只移動不到一格，只要抓對時機，插中紅色是真的做得到的。 */
            var dir = Math.random() < 0.5 ? -1 : 1;
            var speed = (60 + Math.random() * 70) / 1000; /* px/ms */
            var raf = null, lastT = null, idle = true;

            function idleLoop(now) {
                if (lastT == null) lastT = now;
                var dt = Math.min(48, now - lastT);
                lastT = now;
                triLeft += dir * speed * dt;
                if (triLeft < 0) { triLeft = 0; dir = 1; }
                if (triLeft > maxTriLeft) { triLeft = maxTriLeft; dir = -1; }
                tri.style.left = triLeft + 'px';
                if (idle) raf = requestAnimationFrame(idleLoop);
            }

            function startFall(forceFinalLeft) {
                dropBtn.disabled = true;
                dropBtn.style.display = 'none';
                idle = false;
                cancelAnimationFrame(raf);
                phase = 'falling';
                fall(triLeft, dir, speed, forceFinalLeft);
            }
            /* ALT+A：強迫三角形最終停在尺的正中央（stripW/2），接觸點剛好落在正中央的紫色核心 */
            triggerPerfect = function () { startFall(stripW / 2 - triW / 2); };

            /* 用 pointerdown（手指一碰到螢幕就觸發），不是 click——click 在觸控裝置上要等
               手指離開螢幕（touchend）才會觸發，對「算準時機」的遊戲來說，玩家看準時機按下去
               的那一刻跟遊戲真正判定的時間點會差了手指按著不放的時間，時機全部算錯。 */
            dropBtn.addEventListener('pointerdown', function (e) {
                if (dropBtn.disabled) return;
                e.preventDefault();
                startFall();
            });

            /* forceFinalLeft：ALT+A 測試熱鍵用，直接釘死落點座標（見檔案最上面的說明），
               其餘流程（物理下落動畫、判定、變焦）跟正常玩一模一樣。 */
            function fall(startLeft, dir0, speed0, forceFinalLeft) {
                var finalLeft = forceFinalLeft != null ? forceFinalLeft : bouncePos(startLeft, dir0, speed0, FALL_MS, maxTriLeft);
                var outcome = computeOutcome(finalLeft);

                if (REDUCED) {
                    tri.style.left = finalLeft + 'px';
                    tri.style.top = triTargetTop + 'px';
                    onLand(outcome, finalLeft);
                    return;
                }

                /* 關鍵修正（按「落下」常常沒反應的根因）：瀏覽器會在分頁被切到背景、視窗
                   被其他視窗蓋住、省電模式等情況下，直接暫停 requestAnimationFrame——不是
                   偶爾慢一點，是完全不會再執行。按鈕點下去那一刻就已經 disabled／隱藏了，
                   但如果 rAF 從此不再觸發，frame() 就永遠不會跑到 onLand()，遊戲卡在半空中，
                   玩家看起來就是「按了沒反應」。
                   setTimeout 是另一種計時器，同樣情況下最多是被瀏覽器延後執行，不會整個停掉
                   ——用它當安全網：時間到了不管 rAF 有沒有正常跑完，都強制判定落地，
                   讓遊戲不可能真的卡住。land() 有 landed 旗標防止 rAF 和安全網重複觸發。 */
                var landed = false;
                function land() {
                    if (landed) return;
                    landed = true;
                    tri.style.left = finalLeft + 'px';
                    tri.style.top = triTargetTop + 'px';
                    onLand(outcome, finalLeft);
                }

                var t0 = performance.now();
                function frame(now) {
                    if (landed) return;
                    var el = Math.min(FALL_MS, now - t0);
                    var p = el / FALL_MS;
                    /* 重力自由落下：位置 ∝ 時間平方，一開始慢、越落越快，不是等速被丟出去 */
                    tri.style.top = (triStartTop + (triTargetTop - triStartTop) * p * p) + 'px';
                    tri.style.left = bouncePos(startLeft, dir0, speed0, el, maxTriLeft) + 'px';
                    if (el < FALL_MS) requestAnimationFrame(frame);
                    else land();
                }
                requestAnimationFrame(frame);
                setTimeout(land, FALL_MS + 400);
            }

            function computeOutcome(finalTriLeft) {
                /* 接觸點＝三角形中心，尺固定滿版蓋住三角形整個可移動範圍，理論上不會再
                   插空；保留這個邊界檢查只是防呆（浮點數誤差等極端狀況），不是常態。 */
                var localX = finalTriLeft + triW / 2;
                if (localX < 0 || localX >= stripW) return { miss: true };
                var idx1 = Math.min(8, Math.floor(localX / cellW));
                var out = { idx1: idx1 };
                if (idx1 === 4) {
                    var localX2 = localX - 4 * cellW;
                    out.idx2 = Math.min(8, Math.floor(localX2 / subW));
                    if (out.idx2 === 4) {
                        var localX3 = localX2 - 4 * subW, subsubW = subW / 9;
                        out.idx3 = Math.min(8, Math.floor(localX3 / subsubW));
                    }
                }
                return out;
            }

            function onLand(outcome, finalLeft) {
                if (outcome.miss) { UI.wait(REDUCED ? 0 : 500).then(function () { finish(outcome); }); return; }
                var localCX = finalLeft + triW / 2;
                UI.wait(REDUCED ? 0 : 300).then(function () { zoom(outcome, localCX); });
            }

            /* 推進到「插中的那一層整排」，停留看清楚，插更準才繼續推進到下一層；
               沒插中紅色就只停在完整畫面（stage 0），不會硬推進到沒有意義的層。 */
            function zoom(outcome, localCX) {
                var stages = (outcome.idx2 != null ? 1 : 0) + (outcome.idx3 != null ? 1 : 0);
                if (REDUCED) {
                    setViewBox(strip, boxForStage(stages, localCX));
                    finish(outcome);
                    return;
                }
                var cur = boxForStage(0, localCX);
                var chain = UI.wait(ZOOM_PAUSE_MS);
                var _loop = function (stage) {
                    chain = chain.then(function () {
                        var target = boxForStage(stage, localCX);
                        return tweenViewBox(strip, cur, target, ZOOM_STAGE_MS, easeOutCubic).then(function () {
                            cur = target;
                            return UI.wait(ZOOM_PAUSE_MS);
                        });
                    });
                };
                for (var s = 1; s <= stages; s++) _loop(s);
                chain.then(function () { finish(outcome); });
            }

            function finish(outcome) {
                var score, label;
                if (outcome.miss) {
                    score = 0;
                    label = '插空了，尺已經不在下面了，再試一次！';
                } else if (outcome.idx1 !== 4) {
                    score = LABELS[outcome.idx1] * 10;
                    label = '落在 ' + LABELS[outcome.idx1] + ' 號格，還沒插到紅色';
                } else if (outcome.idx2 !== 4) {
                    var d2 = Math.abs(outcome.idx2 - 4);
                    score = 100 + (5 - d2) * 10;
                    label = '插進紅色了！但沒中黃色核心';
                } else if (outcome.idx3 === 4) {
                    score = 1000;
                    label = 'PERFECT！插中紫色了！';
                } else {
                    var d3 = Math.abs(outcome.idx3 - 4);
                    score = 500 + (5 - d3) * 20;
                    label = '摸到黃色核心了！只差一點點紫色';
                }

                var isNew = score > 0 && Reaction.setBest(ID, score, function (v, b) { return v > b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));

                /* 不清空畫面：三角形釘在方塊上、鏡頭停在最後放大倍率的那一幕留在背景，
                   結算卡片疊一層半透明底蓋在上面——玩家看得到自己剛剛插中的樣子。 */
                phase = 'result';
                root.appendChild(h('div', { 'class': 'drop-result-overlay' }, [
                    h('div', { 'class': 'drop-result-card' }, [
                        h('div', { 'class': 'rx-result__num', text: score + ' 分' }),
                        h('div', { 'class': 'rx-result__label', text: label }),
                        isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                        h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: round } })
                    ])
                ]));
            }

            playIntro(function () {
                phase = 'idle';
                dropBtn.style.display = '';
                /* 隱藏提示文字（不是移除）：避免玩家拿這行固定文字當參考基準，
                   推算三角形目前的位置；保留 opacity:0 讓它還佔著原本的版面空間，
                   不會因為消失而讓按鈕或尺的位置跟著跳動。 */
                hint.style.opacity = '0';
                raf = requestAnimationFrame(idleLoop);
            });
        }

        /* ALT+A：測試熱鍵，整個頁面只註冊一次（見檔案最上面的說明）。
           結果畫面時先重開一局，再觸發；開場演出／下落／變焦中按了不理會，避免狀態衝突。 */
        document.addEventListener('keydown', function (e) {
            if (!e.altKey || e.code !== 'KeyA') return;
            e.preventDefault();
            if (phase === 'result') round();
            if (phase === 'idle' && triggerPerfect) triggerPerfect();
        });

        round();
    }

    /* 三角形左右來回彈跳移動的位置：純函數（輸入經過的時間，回傳位置）。
       閒置時的反彈（idleLoop）跟按下「落下」後繼續算的慣性（fall() 裡的
       finalLeft／frame()）都呼叫同一個函式、帶同樣的參數，兩者必定完全一致
       ——這是先前「按了常常沒反應」的根因：原本用 CSS transition 讓三角形
       落下，transitionend 有時不會觸發，遊戲就卡住；現在改成每一影格都自己
       算位置，不依賴瀏覽器的轉場事件，一定會落地。 */
    function bouncePos(start, dir, speed, t, max) {
        var period = 2 * max;
        var raw = start + dir * speed * t;
        var m = ((raw % period) + period) % period;
        return m <= max ? m : period - m;
    }

    Reaction.register({
        id: ID,
        name: '神準落下',
        rule: '畫面上方是藍色倒三角形，下方 9 格方塊會左右來回移動、撞到邊緣就反彈。請預測落下的時機，點擊「落下」——三角形會像自由落體一樣越落越快，釘在方塊上就不再移動。插中中間的紅色格，畫面會往釘住的那一點持續放大，讓你看清楚插得有多準；再插中紅色裡的黃色核心、再插中黃色裡的紫色核心，就是最高分！',
        mount: mount
    });
})();
