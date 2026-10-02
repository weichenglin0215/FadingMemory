/* ═══════════════════════════════════════════════════════════════════
   reaction_impossible.js — 秒反應・不可能任務
   畫面上緣是阿湯哥、下緣是一條紅色警戒線。點一下畫面讓他開始自由落體下墜，
   算準時機再點一下讓他停住。不管停得準不準、甚至直接摔到警戒線上，都會接著
   一段絲滑的鏡頭推進：原本「圖片下緣～警戒線上緣」那一小段距離，持續放大到
   填滿整個遊戲介面的高度，用上下箭頭＋藍線＋距離公分數標出來，讓玩家看清楚
   自己到底有多驚險；停在警戒線 10 公分以內才算任務成功，其餘（含直接摔上去）
   都算失敗。
   ───────────────────────────────────────────────────────────────────
   · 物理：自由落體，位置 ∝ 時間平方（跟「神準落下」的三角形下墜公式同一個
     道理），用 9.8 m/s² 換算成「每公尺等於多少 px」（見 PX_PER_M），這樣
     距離公分數才有實際物理意義，不是憑空編的數字。
   · 「停止」只是凍結當下的位置（取消 rAF），不是另一段動畫；凍結那一刻的
     影格可能跟真正點擊的瞬間差了一影格（<16ms），這點誤差對這個遊戲的節奏
     來說完全不影響，不需要更精準的做法。
   · 鏡頭推進：不是數學上真的把整個畫面放大（那樣阿湯哥和警戒線都會被拉到
     變形），而是另外做一個「剛好蓋住那段距離」的長方形圖層，一開始跟那段
     距離一樣小、一樣的位置，再把它的 top／height 慢慢補間到佔滿整個欄位
     ——跟「神準落下」的 viewBox 補間是同一種手法（每一影格自己算位置，
     不依賴 CSS transition 的 transitionend，分頁切到背景也不會卡住），
     只是這裡補間的是一般 DOM 元素的位置／高度，不是 SVG 的 viewBox。
   · 分數／最佳紀錄只在「成功」（10 公分以內）時更新，越小越好。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'impossible';
    var h = UI.h;

    var GRAVITY = 9.8;      /* 重力加速度（公尺／秒²），真實世界的數字 */
    var PX_PER_M = 50;      /* 下墜速度用這個換算 1 公尺等於多少邏輯 px——想讓下墜更快/更慢，調這個數字就好 */
    var ACCEL = GRAVITY * PX_PER_M; /* px/s² */
    var SUCCESS_CM = 10;    /* 停在警戒線幾公分以內才算成功 */
    /* MEASURE_PX_PER_CM：量距離、算成不成功用的換算比例，刻意跟上面下墜速度
       用的 PX_PER_M 不是同一把尺！如果距離也套用「50px=1公尺」（等於 10 公分
       只有 5px），用 ACCEL=490 算一下：落地瞬間速度約 828 px/s，5px 的容許
       誤差換算成時間只有約 6 毫秒——比一格畫面更新（約 16 毫秒）還短，等於
       沒有人按得到，「10 公分內」這個成功門檻會變成數學上不可能達成。
       放寬距離的換算比例（這裡＝10px 算 1 公分），容許誤差變成約 100px、
       換算成時間約 120 毫秒，是玩家靠練習、抓節奏真的碰得到的範圍——下墜
       本身仍然是道地的 9.8 m/s² 重力感，只有「量尺的粗細」不一樣，兩者本來
       就是「動畫節奏」跟「判定寬容度」兩件不同的事，不需要共用同一把尺。 */
    var MEASURE_PX_PER_CM = 10;
    var ZOOM_MS = 1000;     /* 鏡頭推進（補間）的時間 */
    var HOLD_MS = 2000;     /* 看清楚結果之後，停留多久才出現「再挑戰一次」 */
    var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 公分'; }
    function cmOf(px) { return Math.max(0, Math.round(px / MEASURE_PX_PER_CM)); }
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /* 把一個 position:absolute 的元素從 from 補間到 to（只動 top／height）。
       跟 js/reaction_drop.js 的 tweenViewBox 同一個模式：每一影格自己用經過的
       時間算位置，不靠 CSS transition；setTimeout 當安全網，分頁被切到背景、
       requestAnimationFrame 整個暫停時，時間到了還是會強制跳到終點、resolve 掉，
       後面「暫停兩秒再出現按鈕」的流程才不會卡住。 */
    function tweenRect(el, from, to, duration) {
        return new Promise(function (resolve) {
            function setRect(r) { el.style.top = r.top + 'px'; el.style.height = r.height + 'px'; }
            if (REDUCED || duration <= 0) { setRect(to); resolve(); return; }
            var done = false;
            function finishOnce() {
                if (done) return;
                done = true;
                setRect(to);
                resolve();
            }
            var t0 = performance.now();
            function frame(now) {
                if (done) return;
                var p = Math.min(1, (now - t0) / duration);
                var e = easeInOutCubic(p);
                setRect({ top: from.top + (to.top - from.top) * e, height: from.height + (to.height - from.height) * e });
                if (p < 1) requestAnimationFrame(frame); else finishOnce();
            }
            requestAnimationFrame(frame);
            setTimeout(finishOnce, duration + 400);
        });
    }

    function mount(root, ctx) {
        root.classList.add('imp-white-bg');

        function round() {
            root.innerHTML = '';
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));

            var field = h('div', { 'class': 'imp-field' });
            root.appendChild(field);

            var img = h('img', { 'class': 'imp-img', attrs: { src: 'images/Impossible.png', alt: '阿湯哥' } });
            var bar = h('div', { 'class': 'imp-bar' });
            var hint = h('div', { 'class': 'imp-hint', text: '點擊畫面讓阿湯哥下降' });
            field.appendChild(img);
            field.appendChild(bar);
            field.appendChild(hint);

            var phase = 'idle';   /* idle：等第一下點擊／falling：下墜中／done：鏡頭推進中或已結束 */
            var raf = null;

            /* 圖片用 <img src="..."> 載入是非同步的，寬度雖然在 CSS 就固定成 150px，
               但高度要等圖片真的載完才量得準（img.offsetHeight 在載完之前可能是 0），
               而 maxY（能落到哪裡）需要這個高度。imgReady 擋住「圖片還沒載完」時
               誤觸開始下墜，load／error 都算「可以開始了」——萬一圖片真的載入失敗，
               也不該讓遊戲卡住點不動。 */
            var imgReady = img.complete && img.naturalWidth > 0;
            img.addEventListener('load', function () { imgReady = true; });
            img.addEventListener('error', function () { imgReady = true; });

            /* 「點擊畫面任一處」：監聽整個 field，不是某一顆按鈕——phase 決定這一下
               點擊的意思是「開始下墜」還是「停止下墜」，done 階段點畫面不做事，
               只有鏡頭推進完、停留兩秒後出現的「再挑戰一次」小按鈕才能重來。 */
            field.addEventListener('click', function () {
                if (phase === 'idle') { if (imgReady) startFall(); }
                else if (phase === 'falling') stopFall();
            });

            function startFall() {
                phase = 'falling';
                hint.textContent = '點擊畫面讓阿湯哥停止';
                hint.classList.add('imp-hint--danger');

                /* maxY：圖片最多能落到哪裡（下緣剛好碰到紅線上緣）；下墜公式本身
                   不管碰撞，每一影格算完才檢查有沒有超過，超過就當作撞到了。 */
                var maxY = bar.offsetTop - img.offsetHeight;
                var t0 = performance.now();
                var landed = false;

                function frame(now) {
                    if (landed) return;
                    var t = (now - t0) / 1000;
                    var y = 0.5 * ACCEL * t * t;
                    if (y >= maxY) {
                        landed = true;
                        img.style.top = maxY + 'px';
                        finish(true);
                        return;
                    }
                    img.style.top = y + 'px';
                    raf = requestAnimationFrame(frame);
                }
                raf = requestAnimationFrame(frame);
            }

            function stopFall() {
                cancelAnimationFrame(raf);
                finish(false);
            }

            /* crashed：true＝還沒點擊就先摔到警戒線上了；false＝玩家自己停下來的。
               不管哪一種都接著做同一套「鏡頭推進」演出，推進完才判定成功或失敗
               ——碰到警戒線（crashed）一律算失敗，沒碰到的話要停在 10 公分以內
               才算成功，純粹停下來、但離警戒線太遠，也算失敗。 */
            function finish(crashed) {
                phase = 'done';
                hint.style.display = 'none';
                var gapPx = Math.max(0, bar.offsetTop - (img.offsetTop + img.offsetHeight));
                var cm = cmOf(gapPx);
                var success = !crashed && cm <= SUCCESS_CM;

                if (success) {
                    var isNew = Reaction.setBest(ID, cm, function (v, b) { return v < b; });
                    ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                } else {
                    ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                }

                var from = { top: img.offsetTop + img.offsetHeight, height: gapPx };
                var to = { top: 0, height: field.clientHeight };

                var measure = h('div', { 'class': 'imp-measure' }, [
                    h('div', { 'class': 'imp-measure__edge', text: '阿湯哥' }),
                    h('div', {
                        'class': 'imp-measure__title ' + (success ? 'imp-measure__title--ok' : 'imp-measure__title--bad'),
                        text: success ? '成功！' : '任務失敗'
                    }),
                    h('div', { 'class': 'imp-measure__gap' }, [
                        h('div', { 'class': 'imp-measure__bar' }),
                        h('div', { 'class': 'imp-measure__arrow imp-measure__arrow--up' }),
                        h('div', { 'class': 'imp-measure__arrow imp-measure__arrow--down' }),
                        h('div', { 'class': 'imp-measure__num', text: cm + ' 公分' })
                    ]),
                    h('div', { 'class': 'imp-measure__edge imp-measure__edge--bottom', text: '警戒線' })
                ]);
                measure.style.top = from.top + 'px';
                measure.style.height = from.height + 'px';
                field.appendChild(measure);

                /* 推進完、讓玩家看清楚「成功或失敗＋幾公分」之後，先停留 HOLD_MS
                   毫秒，才讓「再挑戰一次」出現——按鈕本身是小小一顆、疊在畫面
                   最下方，不會像卡片那樣把整個鏡頭特寫蓋住。 */
                tweenRect(measure, from, to, ZOOM_MS)
                    .then(function () { return UI.wait(HOLD_MS); })
                    .then(function () {
                        field.appendChild(h('button', { 'class': 'btn btn--primary imp-restart-btn', text: '再挑戰一次', on: { click: round } }));
                    });
            }
        }

        round();
    }

    Reaction.register({
        id: ID,
        name: '不可能任務',
        rule: '畫面上方是阿湯哥，下方是一條紅色警戒線。點一下畫面，他就會像自由落體一樣開始往下墜落；算準時機再點一下畫面，就能讓他停在半空中。停下來之後鏡頭會拉近，讓你看清楚他跟警戒線之間還差幾公分——停在 10 公分以內才算任務成功，其餘（包含直接摔到警戒線上）都算失敗！',
        mount: mount
    });
})();
