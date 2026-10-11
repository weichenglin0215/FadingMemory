/* ═══════════════════════════════════════════════════════════════════
   scroller.js — 手指／滑鼠拖曳＋慣性捲動（共用元件）
   ───────────────────────────────────────────────────────────────────
   用在：「選一個想玩的遊戲」的遊戲列表（js/menu.js）、世界前 30 名的榜單（js/leaderboard_ui.js）。
   兩個地方共用同一份，手感（摩擦力、橡皮筋）才會一模一樣，要調手感只改下面的 PHYS。

   【為什麼自己做、不用瀏覽器原生捲動】
   瀏覽器原生的捲動在電腦上不能用滑鼠拖曳、各瀏覽器的慣性手感也不一致，所以這裡自己做：
     · 拖曳中：內容跟著手指走（超過頭尾時只跟 45%，有「橡皮筋」的感覺）；
     · 放開手：用「放開前最後 0.1 秒手指移動的速度」當初速，之後每個畫面讓速度指數衰減
       （摩擦力），內容繼續滑一段才停；滑到頭尾會被橡皮筋彈回來；
     · 畫面被縮放過（舞台是 500×850 再整體縮放）：手指移動的距離要先除以縮放倍率，
       換算成舞台裡的像素，內容才會「黏著手指」；
     · 同時支援滑鼠滾輪、鍵盤上下／PageUp／PageDown／Home／End。
   物理計算（flingStep、releaseVelocity、rubber）寫成純函式，Node 測試可直接驗證
   （見 test/reaction/t_leaderboard.js、t_scroller.js）。

   【對外介面】（掛在全域 Scroller 底下）
     Scroller.make(viewport, content, thumb, opts)   做出一個可捲動的區塊，回傳控制物件（見下面）
         viewport  固定高度、overflow:hidden 的視窗（CSS 要設 touch-action:none，讓手指拖曳由這裡處理）
         content   視窗裡面真正很長的內容（用 transform 上下平移，所以不會觸發重新排版）
         thumb     右側的小滑桿元素（可以是 null）
         opts.threshold   手指要移動超過幾個「舞台像素」才算開始拖曳（預設 0＝一按下去就算）。
                          內容裡有按鈕要點的時候（遊戲列表）要設 8 左右：沒超過就是「點一下」，
                          瀏覽器照常把 click 送給按鈕；超過了才接手拖曳，放手後的那一下 click 會被吃掉，不會誤點到按鈕。
         opts.keys        false＝不接鍵盤（預設 true）
     回傳 { refresh(), scrollTo(y), max(), y(), destroy(), state }
     Scroller.PHYS／rubber／releaseVelocity／flingStep   物理純函式（給測試用）
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    /* ═══════════════════════════════════════════════════════════════
       一、慣性捲動的物理（純函式）
       位置 y：0＝最上面，max＝最下面（單位是舞台的邏輯像素）；速度 v：像素／毫秒，正值＝往下捲
       ═══════════════════════════════════════════════════════════════ */
    var PHYS = {
        tau: 380,          /* 摩擦力的時間常數（毫秒）：速度每過 tau 毫秒掉到約 37%。越大＝放手後滑得越遠 */
        stopV: 0.02,       /* 速度（像素／毫秒）低於這個就算停了 */
        edgeTau: 70,       /* 衝出頭尾之後，速度衰減的時間常數（毫秒）：越小剎得越快 */
        springTau: 120,    /* 越界後彈回頭尾的時間常數（毫秒）：越小彈得越快 */
        rubber: 0.45,      /* 手指拖過頭尾時，內容只跟著動這個比例（橡皮筋手感）；1＝完全跟著、0＝完全不動 */
        maxV: 6,           /* 放手速度的上限（像素／毫秒），避免亂甩一下就飛出去 */
        velWindow: 100,    /* 算放手速度時，只看最後這麼多毫秒的手指軌跡 */
        velStale: 90       /* 放手之前手指已經停住超過這麼多毫秒，就當作沒有速度 */
    };

    /* 拖曳中的橡皮筋：y 是「如果完全跟著手指」的位置，回傳實際顯示的位置 */
    function rubber(y, max) {
        if (y < 0) return y * PHYS.rubber;
        if (y > max) return max + (y - max) * PHYS.rubber;
        return y;
    }

    /* 由手指軌跡算放手速度。samples：[{t: 毫秒, y: 手指位置（邏輯像素）}]，時間由舊到新。
       手指往上移（y 變小）＝內容往下捲，所以速度的正負號跟手指移動方向相反。 */
    function releaseVelocity(samples, now) {
        if (!samples || samples.length < 2) return 0;
        var last = samples[samples.length - 1];
        if (now - last.t > PHYS.velStale) return 0;
        var first = last;
        for (var i = 0; i < samples.length; i++) {
            if (last.t - samples[i].t <= PHYS.velWindow) { first = samples[i]; break; }
        }
        var dt = last.t - first.t;
        if (dt <= 0) return 0;
        var v = -(last.y - first.y) / dt;
        return Math.max(-PHYS.maxV, Math.min(PHYS.maxV, v));
    }

    /* 往前走 dt 毫秒（改 s.y、s.v），回傳「是否已經完全停止」。
       · 沒越界：照速度前進，速度指數衰減（每個 dt 都用 Math.exp 精確算，
         所以不管螢幕是 60Hz 還是 120Hz，滑出去的距離都一樣）；
       · 越界：速度很快消掉，位置以指數方式彈回頭尾（橡皮筋）。 */
    function flingStep(s, dt, max) {
        s.y += s.v * dt;
        if (s.y < 0 || s.y > max) {
            var edge = s.y < 0 ? 0 : max;
            s.v *= Math.exp(-dt / PHYS.edgeTau);
            var over = (s.y - edge) * Math.exp(-dt / PHYS.springTau);
            s.y = edge + over;
            if (Math.abs(over) < 0.3 && Math.abs(s.v) < PHYS.stopV * 4) { s.y = edge; s.v = 0; return true; }
            return false;
        }
        s.v *= Math.exp(-dt / PHYS.tau);
        if (Math.abs(s.v) < PHYS.stopV) { s.v = 0; return true; }
        return false;
    }

    /* ═══════════════════════════════════════════════════════════════
       二、元件
       ═══════════════════════════════════════════════════════════════ */

    /* 舞台目前的縮放倍率（手機上通常小於 1）。手指移動的螢幕像素要除以它，才是舞台裡的像素 */
    function stageScale() {
        var r = global.Stage && global.Stage.rect && global.Stage.rect();
        return (r && r.scale) || 1;
    }

    function make(viewport, content, thumb, opts) {
        opts = opts || {};
        var threshold = opts.threshold || 0;
        var s = { y: 0, v: 0 };      /* y：目前捲到哪；v：速度 */
        var max = 0;                 /* 最多能捲多遠＝內容高度 − 視窗高度 */
        var drag = null;             /* 拖曳中的資料；沒有在拖就是 null */
        var raf = 0, lastT = 0, thumbTimer = 0;
        var swallowClick = false;    /* 這次按下去到放開，要不要吃掉隨後的 click（拖曳過、或是為了讓滑動停下來而按的） */

        function measure() { max = Math.max(0, content.offsetHeight - viewport.clientHeight); }

        /* 把 s.y 畫到畫面上：用 transform 平移內容（GPU 處理，可以有小數點、很順），並更新滑桿 */
        function paint() {
            content.style.transform = 'translate3d(0,' + (-s.y).toFixed(2) + 'px,0)';
            if (!thumb) return;
            var vh = viewport.clientHeight, ch = content.offsetHeight;
            if (max <= 0 || ch <= 0) { thumb.style.opacity = '0'; return; }
            var th = Math.max(36, vh * vh / ch);
            var ty = (Math.min(max, Math.max(0, s.y)) / max) * (vh - th);
            thumb.style.height = th.toFixed(1) + 'px';
            thumb.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
            thumb.style.opacity = '';
        }
        /* 滑桿平常淡出，捲動時亮起來，停止 0.9 秒後再淡出 */
        function showThumb() {
            if (!thumb || max <= 0) return;
            thumb.classList.add('is-on');
            global.clearTimeout(thumbTimer);
            thumbTimer = global.setTimeout(function () { thumb.classList.remove('is-on'); }, 900);
        }
        function stop() {
            if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
            s.v = 0;
        }
        /* 放手後的慣性動畫迴圈：每個畫面呼叫 flingStep，停了就結束 */
        function run() {
            if (raf) return;
            lastT = global.performance.now();
            raf = global.requestAnimationFrame(function frame(now) {
                var dt = Math.min(50, Math.max(1, now - lastT));      /* 單格最多算 50ms：夠涵蓋 30fps 的舊手機，又不會在分頁從背景回來時一次飛很遠 */
                lastT = now;
                var done = flingStep(s, dt, max);
                paint();
                showThumb();
                raf = done ? 0 : global.requestAnimationFrame(frame);
            });
        }

        /* 開始拖曳：從這一刻起內容跟著手指，並把手指「抓住」（之後不管手指移到哪裡，事件都送到這個視窗） */
        function startDrag(e) {
            drag.on = true;
            drag.y0 = e.clientY / stageScale();            /* 以「開始拖曳的這一刻」為基準，所以門檻內的小抖動不會讓內容跳一下 */
            drag.pos0 = s.y;
            drag.samples = [{ t: global.performance.now(), y: drag.y0 }];
            try { viewport.setPointerCapture(e.pointerId); } catch (err) { }
            viewport.classList.add('is-drag');
            swallowClick = true;
            showThumb();
        }

        viewport.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            measure();
            /* 還在慣性滑行時按下去＝「讓它停住」，這一下不是要點按鈕：吃掉隨後的 click */
            swallowClick = !!raf && Math.abs(s.v) > PHYS.stopV * 4;
            if (max <= 0) { drag = null; return; }
            stop();
            drag = { id: e.pointerId, on: false, x0: e.clientX / stageScale(), sy0: e.clientY / stageScale() };
            if (threshold <= 0) startDrag(e);
        });
        viewport.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            if (!drag.on) {
                /* 還沒超過門檻：什麼都不做（手指沒真的拖，就是在「點」） */
                var sc = stageScale();
                var dx = e.clientX / sc - drag.x0, dy = e.clientY / sc - drag.sy0;
                if (Math.sqrt(dx * dx + dy * dy) < threshold) return;
                startDrag(e);
                return;
            }
            var y = e.clientY / stageScale(), now = global.performance.now();
            s.y = rubber(drag.pos0 - (y - drag.y0), max);
            s.v = 0;
            drag.samples.push({ t: now, y: y });
            while (drag.samples.length > 2 && now - drag.samples[0].t > PHYS.velWindow * 1.5) drag.samples.shift();
            paint();
            showThumb();
        });
        function end(e) {
            if (!drag || (e && e.pointerId !== drag.id)) return;
            var was = drag;
            drag = null;
            if (!was.on) return;                           /* 沒超過門檻＝只是點一下，click 照常送給按鈕 */
            var v = releaseVelocity(was.samples, global.performance.now());
            viewport.classList.remove('is-drag');
            s.v = v;
            run();          /* 有速度就滑出去；停在界外就彈回；停在界內而且沒速度，下一格就結束 */
        }
        viewport.addEventListener('pointerup', end);
        viewport.addEventListener('pointercancel', end);
        /* 拖曳過（或為了讓滑動停下來而按）→ 放手後瀏覽器仍會送一個 click 給底下的按鈕，在這裡（捕捉階段）攔下來 */
        viewport.addEventListener('click', function (e) {
            if (!swallowClick) return;
            swallowClick = false;
            e.stopPropagation();
            e.preventDefault();
        }, true);

        /* 滑鼠滾輪：直接移動（觸控板本身就會送出帶慣性的連續滾動事件，不用再加一層） */
        viewport.addEventListener('wheel', function (e) {
            measure();
            if (max <= 0) return;
            e.preventDefault();
            var d = e.deltaMode === 1 ? e.deltaY * 40 : (e.deltaMode === 2 ? e.deltaY * viewport.clientHeight : e.deltaY);
            stop();
            s.y = Math.min(max, Math.max(0, s.y + d / stageScale()));
            paint();
            showThumb();
        }, { passive: false });

        /* 鍵盤：上下鍵、PageUp／PageDown、Home／End（這個視窗看得到的時候才生效；destroy 時會移除） */
        function onKey(e) {
            if (!viewport.offsetParent) return;            /* 被藏起來（display:none）就不要動 */
            measure();
            if (max <= 0) return;
            var page = Math.max(60, viewport.clientHeight - 70), to = null;
            if (e.key === 'ArrowDown') to = s.y + 70;
            else if (e.key === 'ArrowUp') to = s.y - 70;
            else if (e.key === 'PageDown') to = s.y + page;
            else if (e.key === 'PageUp') to = s.y - page;
            else if (e.key === 'Home') to = 0;
            else if (e.key === 'End') to = max;
            if (to == null) return;
            e.preventDefault();
            stop();
            s.y = Math.min(max, Math.max(0, to));
            paint();
            showThumb();
        }
        if (opts.keys !== false) global.document.addEventListener('keydown', onKey);

        return {
            /* 內容重畫之後呼叫：重新量高度，位置夾回合法範圍 */
            refresh: function () { measure(); s.y = Math.min(max, Math.max(0, s.y)); paint(); },
            scrollTo: function (y) { stop(); measure(); s.y = Math.min(max, Math.max(0, y)); paint(); },
            destroy: function () { stop(); global.document.removeEventListener('keydown', onKey); global.clearTimeout(thumbTimer); },
            state: s,
            y: function () { return s.y; },
            max: function () { measure(); return max; }
        };
    }

    global.Scroller = { PHYS: PHYS, rubber: rubber, releaseVelocity: releaseVelocity, flingStep: flingStep, make: make };
})(window);
