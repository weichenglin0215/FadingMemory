/* ═══════════════════════════════════════════════════════════════════
   reaction_drop.js — 秒反應・神準落下
   像一根釘子從高處自由落下、釘在下方的木頭尺上：9 格方塊左右來回移動，算準時機
   按「落下」，藍色三角形以重力加速度（越落越快，不是等速被丟出去）落下並釘在
   接觸點上，不會消失。接觸點就是畫面放大的圓心，畫面持續往同一個點放大，
   讓玩家看清楚釘在幾點幾分的細部位置：插中中間的紅，再放大看紅裡的黃核心，
   再放大看黃裡的紫核心＝最精準。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'drop';
    var h = UI.h;
    /* 落下的時間刻意調短：尺要來回移動得夠明顯（有反應力遊戲的節奏感），速度就不能太慢；
       但落下（650ms）這麼久的話，就算尺速度不快，落下期間尺也會移動超過好幾格，
       變成「怎麼按都插不到中間」。改成 380ms、尺的速度也調低，落下期間尺大約只移動
       1～3 格，插中紅色是真的靠算時機做得到的，不是純運氣。 */
    var FALL_MS = 380;          /* 重力落下的總時間 */
    var REVEAL_FRAC = 0.6;      /* 放大到「這一層的格子」占畫面寬度的比例 */
    var LABELS = [1, 2, 3, 4, null, 4, 3, 2, 1]; /* index 4＝紅（不寫數字，寫「5」）*/
    var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 分'; }

    /* 9 格連成一塊、左右反彈移動的位置：純函數（輸入經過的時間，回傳位置）。
       按下「落下」那一刻算出的「落地位置」跟畫面上實際落下的動畫，都呼叫同一個
       函式、帶同樣的參數，兩者必定完全一致——這是先前「按了常常沒反應」的根因：
       原本用 CSS transition 讓三角形落下，transitionend 有時不會觸發，遊戲就卡住；
       現在改成每一影格都自己算位置，不依賴瀏覽器的轉場事件，一定會落地。 */
    function bouncePos(start, dir, speed, t, max) {
        var period = 2 * max;
        var raw = start + dir * speed * t;
        var m = ((raw % period) + period) % period;
        return m <= max ? m : period - m;
    }

    function mount(root, ctx) {
        ctx.setMeta(fmtBest(Reaction.getBest(ID)));

        function round() {
            root.innerHTML = '';
            root.appendChild(h('div', { 'class': 'hint', text: '算準時機按下「落下」，插中中間的紫色最高分！' }));
            var field = h('div', { 'class': 'drop-field' });
            root.appendChild(field);

            var FW = field.clientWidth, FH = field.clientHeight;
            var triW = FW / 10, triH = triW * 2;
            var stripW = FW / 3, cellW = stripW / 9;
            var stripH = Math.min(76, FH * 0.14);
            var triStartTop = 6;
            var triTargetTop = FH - stripH - triH;
            var maxLeft = FW - stripW;
            var contactX = FW / 2;
            var contactY = triTargetTop + triH;

            var zoomRoot = h('div', { 'class': 'drop-zoom-root' });
            var strip = h('div', { 'class': 'drop-strip' });
            strip.style.height = stripH + 'px';
            strip.style.top = (FH - stripH) + 'px';
            strip.style.width = stripW + 'px';
            for (var i = 0; i < 9; i++) {
                var cell = h('span', { 'class': 'drop-cell' + (i === 4 ? ' drop-cell--mid' : ''), text: i === 4 ? '5' : String(LABELS[i]) });
                cell.style.width = cellW + 'px';
                strip.appendChild(cell);
            }
            zoomRoot.appendChild(strip);
            field.appendChild(zoomRoot);

            /* 三角形（釘子）獨立於 zoomRoot 之外：畫面放大只放大尺，
               釘子永遠停在螢幕上同一個位置，不隨畫面縮放，才會有「釘住不動」的感覺 */
            var tri = h('div', { 'class': 'drop-tri' });
            tri.style.width = triW + 'px';
            tri.style.height = triH + 'px';
            tri.style.left = (contactX - triW / 2) + 'px';
            tri.style.top = triStartTop + 'px';
            field.appendChild(tri);

            var dropBtn = h('button', { 'class': 'btn btn--primary drop-btn', text: '落下' });
            field.appendChild(dropBtn);

            /* 開場：鏡頭先特寫最深一層（8 黃＋中間紫），再 zoom out 到真正的初始畫面 */
            var intro = h('div', { 'class': 'drop-intro' });
            for (var k = 0; k < 9; k++) intro.appendChild(h('span', { 'class': k === 4 ? 'drop-intro__mid' : '' }));
            field.appendChild(intro);
            intro.addEventListener('animationend', function () { intro.remove(); });

            /* 按「落下」之前：一般的來回反彈，還不需要預測結果。
               速度刻意放慢：落下要 650 毫秒，速度太快的話，不管什麼時候按，方塊都會在
               這 650 毫秒內移動超過整條尺的寬度，變成「怎麼按都插不到中間」──
               放慢之後，落下時方塊大約移動 1～2 格，只要抓對時機，插中紅色是真的做得到的。 */
            var stripLeft = (FW - stripW) / 2;
            var dir = Math.random() < 0.5 ? -1 : 1;
            var speed = (60 + Math.random() * 70) / 1000; /* px/ms */
            var raf = null, lastT = null, idle = true;

            function idleLoop(now) {
                if (lastT == null) lastT = now;
                var dt = Math.min(48, now - lastT);
                lastT = now;
                stripLeft += dir * speed * dt;
                if (stripLeft < 0) { stripLeft = 0; dir = 1; }
                if (stripLeft > maxLeft) { stripLeft = maxLeft; dir = -1; }
                strip.style.left = stripLeft + 'px';
                if (idle) raf = requestAnimationFrame(idleLoop);
            }
            raf = requestAnimationFrame(idleLoop);

            /* 用 pointerdown（手指一碰到螢幕就觸發），不是 click——click 在觸控裝置上要等
               手指離開螢幕（touchend）才會觸發，對「算準時機」的遊戲來說，玩家看準時機按下去
               的那一刻跟遊戲真正判定的時間點會差了手指按著不放的時間，時機全部算錯。 */
            dropBtn.addEventListener('pointerdown', function (e) {
                if (dropBtn.disabled) return;
                e.preventDefault();
                dropBtn.disabled = true;
                dropBtn.style.display = 'none';
                idle = false;
                cancelAnimationFrame(raf);
                fall(stripLeft, dir, speed);
            });

            function fall(startLeft, dir0, speed0) {
                /* 先算出「落地那一刻」的位置與三層精準度，畫面動畫只是把同一個結果演出來 */
                var finalLeft = bouncePos(startLeft, dir0, speed0, FALL_MS, maxLeft);
                var outcome = computeOutcome(finalLeft);

                if (REDUCED) {
                    strip.style.left = finalLeft + 'px';
                    tri.style.top = triTargetTop + 'px';
                    onLand(outcome);
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
                    strip.style.left = finalLeft + 'px';
                    tri.style.top = triTargetTop + 'px';
                    onLand(outcome);
                }

                var t0 = performance.now();
                function frame(now) {
                    if (landed) return;
                    var el = Math.min(FALL_MS, now - t0);
                    var p = el / FALL_MS;
                    /* 重力自由落下：位置 ∝ 時間平方，一開始慢、越落越快，不是等速被丟出去 */
                    tri.style.top = (triStartTop + (triTargetTop - triStartTop) * p * p) + 'px';
                    strip.style.left = bouncePos(startLeft, dir0, speed0, el, maxLeft) + 'px';
                    if (el < FALL_MS) requestAnimationFrame(frame);
                    else land();
                }
                requestAnimationFrame(frame);
                setTimeout(land, FALL_MS + 400);
            }

            function computeOutcome(finalLeft) {
                /* 接觸點固定在 contactX，尺這時候不一定還在它下面——落點不在尺的範圍內
                   就是真的「插空了」，不能硬夾到最邊上那一格冒充有插中，那樣會誤導玩家。 */
                var localX = contactX - finalLeft;
                if (localX < 0 || localX >= stripW) return { miss: true };
                var idx1 = Math.min(8, Math.floor(localX / cellW));
                var out = { idx1: idx1 };
                if (idx1 === 4) {
                    var localX2 = localX - 4 * cellW, subW = cellW / 9;
                    out.idx2 = Math.min(8, Math.floor(localX2 / subW));
                    if (out.idx2 === 4) {
                        var localX3 = localX2 - 4 * subW, subsubW = subW / 9;
                        out.idx3 = Math.min(8, Math.floor(localX3 / subsubW));
                    }
                }
                return out;
            }

            /* 三角形碰到方塊後就釘在接觸點，不再移動、也不會消失。
               接觸點＝畫面放大的錨點（transform-origin），所以放大時這個點在螢幕上完全不動，
               感覺就像鏡頭一直往「釘子釘進尺」的那一點拉近。 */
            function onLand(outcome) {
                if (outcome.miss) { UI.wait(REDUCED ? 0 : 500).then(function () { finish(outcome); }); return; }
                zoomRoot.style.transformOrigin = contactX + 'px ' + contactY + 'px';

                if (outcome.idx1 === 4) {
                    var cell4 = strip.children[4];
                    var sub = h('div', { 'class': 'drop-substrip' });
                    for (var i = 0; i < 9; i++) sub.appendChild(h('span', { 'class': 'drop-subcell' + (i === 4 ? ' drop-subcell--mid' : '') }));
                    cell4.appendChild(sub);
                    if (outcome.idx2 === 4) {
                        var subMid = sub.children[4];
                        var subsub = h('div', { 'class': 'drop-subsubstrip' });
                        for (var j = 0; j < 9; j++) subsub.appendChild(h('span', { 'class': 'drop-subsubcell' + (j === 4 ? ' drop-subsubcell--mid' : '') }));
                        subMid.appendChild(subsub);
                    }
                }

                UI.wait(REDUCED ? 0 : 300).then(function () { zoomStage(outcome, 1); });
            }

            function zoomStage(outcome, depth) {
                var w = depth === 1 ? cellW : depth === 2 ? cellW / 9 : cellW / 81;
                var s = (FW * REVEAL_FRAC) / w;
                zoomRoot.style.transition = REDUCED ? 'none' : 'transform 520ms ease-out';
                void zoomRoot.offsetHeight; /* 強制 reflow：確保上面這行的 transition 先生效，接著改 transform 才會有動畫 */
                zoomRoot.style.transform = 'scale(' + s + ')';

                UI.wait(REDUCED ? 0 : 700).then(function () {
                    if (depth === 1 && outcome.idx2 != null) { zoomStage(outcome, 2); return; }
                    if (depth === 2 && outcome.idx3 != null) { zoomStage(outcome, 3); return; }
                    UI.wait(REDUCED ? 0 : 350).then(function () { finish(outcome); });
                });
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

                root.innerHTML = '';
                root.appendChild(h('div', { 'class': 'rx-result' }, [
                    h('div', { 'class': 'rx-result__num', text: score + ' 分' }),
                    h('div', { 'class': 'rx-result__label', text: label }),
                    isNew ? h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }) : null,
                    h('button', { 'class': 'btn btn--primary', text: '再挑戰一次', on: { click: round } })
                ]));
            }
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '神準落下',
        rule: '畫面上方是藍色倒三角形，下方 9 格方塊會左右來回移動、撞到邊緣就反彈。請預測落下的時機，點擊「落下」——三角形會像自由落體一樣越落越快，釘在方塊上就不再移動。插中中間的紅色格，畫面會往釘住的那一點持續放大，讓你看清楚插得有多準；再插中紅色裡的黃色核心、再插中黃色裡的紫色核心，就是最高分！',
        mount: mount
    });
})();
