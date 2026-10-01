/* ═══════════════════════════════════════════════════════════════════
   stage.js — 2D＋3D 混合舞台：讓手機與電腦看到一模一樣的畫面
   ───────────────────────────────────────────────────────────────────
   【規範】
   1. 邏輯解析度固定 500 × 850（直式）。所有 2D 介面放在 #stage 裡，
      單位一律 px，由 transform: scale() 整體縮放、置中。
   2. 3D 畫布放在 #world，「不放進」#stage：
      本檔把 #world 擺在與 #stage 完全相同的螢幕矩形，
      3D 引擎用 Stage.rect 的寬高 × devicePixelRatio 設定畫布解析度。
      → 3D 不會被 CSS 縮放弄糊；相機長寬比永遠 500/850，
        所以手機與電腦的 3D 構圖一模一樣。
   3. 可用區域 = visualViewport（網址列收合、鍵盤、系統縮放都會即時更新）
      再扣掉 safe-area（瀏海、Home 條）。
      連 visualViewport 的偏移也算進去：就算使用者用無障礙功能強制放大頁面，
      舞台也會跟著可見區域移動，不會露出底色。
   4. 螢幕座標 → 邏輯座標：Stage.toLogical(clientX, clientY)。
      搖桿、拖曳等 2D 計算一律用邏輯座標。
   5. 禁止瀏覽器縮放手勢、長按選單、拖曳圖片。
   用法：
      Stage.init();                    // DOM 載入後呼叫一次
      Stage.onResize(function (r) {}); // r = {left, top, width, height, scale, dpr}
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var DESIGN_W = 500;
    var DESIGN_H = 850;
    var MAX_DPR = 2;

    var stageEl = null;
    var worldEl = null;
    var probeEl = null;
    var debugEl = null;
    var subs = [];
    var pending = 0;
    var rect = { left: 0, top: 0, width: DESIGN_W, height: DESIGN_H, scale: 1, dpr: 1, vw: DESIGN_W, vh: DESIGN_H };

    /* 讀「安全區」（iPhone 瀏海、Home 指示條這些系統保留區域）有多大。
       做法有點繞：瀏覽器沒有直接「給我安全區尺寸」的 JS API，但有 CSS 的
       env(safe-area-inset-top) 這些環境變數。所以 init() 會建一個看不見的
       .sa-probe 元素，它的 CSS（見 css/stage.css）把 padding 設成這四個
       env() 值，這裡再用 getComputedStyle 把算好的 padding 數值讀回來——
       借 CSS 的手算出一個 JS 原生讀不到的數字。 */
    function readSafeArea() {
        if (!probeEl) return { t: 0, r: 0, b: 0, l: 0 };
        var cs = global.getComputedStyle(probeEl);
        return {
            t: parseFloat(cs.paddingTop) || 0,
            r: parseFloat(cs.paddingRight) || 0,
            b: parseFloat(cs.paddingBottom) || 0,
            l: parseFloat(cs.paddingLeft) || 0
        };
    }

    /* 核心計算：「現在這個裝置的可視範圍」要怎麼縮放、置中成 500×850 的舞台。
       1. 可視範圍優先用 visualViewport（手機鍵盤彈出、網址列收合都會即時反映在這裡，
          比 window.innerWidth/innerHeight 準，那兩個在手機上常常不會跟著即時更新）。
       2. 扣掉安全區（aw/ah＝扣完之後「真正能放內容」的寬高）。
       3. scale＝寬和高兩個縮放比例取小的那個（min）：保證 500×850 整塊都放得進可視
          範圍，不會有任何一邊被裁掉——這就是「等比縮放、維持比例」的實作方式。
       4. 算出縮放後的實際寬高（w/h），再算 left/top 讓這塊範圍置中在可視範圍內
          （連 visualViewport 的偏移 ox/oy 都算進去，所以強制縮放頁面時舞台還是會
          跟著可見範圍移動，不會跑出去看到背景底色）。 */
    function measure() {
        var vv = global.visualViewport;
        var vw = vv ? vv.width : global.innerWidth;
        var vh = vv ? vv.height : global.innerHeight;
        var ox = vv ? vv.offsetLeft : 0;
        var oy = vv ? vv.offsetTop : 0;
        var sa = readSafeArea();
        var aw = Math.max(1, vw - sa.l - sa.r);
        var ah = Math.max(1, vh - sa.t - sa.b);
        var scale = Math.min(aw / DESIGN_W, ah / DESIGN_H);
        var w = DESIGN_W * scale;
        var h = DESIGN_H * scale;
        return {
            left: Math.round(ox + sa.l + (aw - w) / 2),
            top: Math.round(oy + sa.t + (ah - h) / 2),
            width: w,
            height: h,
            scale: scale,
            dpr: Math.min(global.devicePixelRatio || 1, MAX_DPR),
            vw: vw,
            vh: vh
        };
    }

    /* 把 measure() 算出來的結果真正「套用」到畫面上：
       · #stage 用 CSS transform（translate 置中位移＋scale 縮放）整塊縮放——所有
         2D 介面都在這個元素底下，單位永遠是設計時的 500×850 px，不用另外寫一堆
         響應式 CSS 去適應不同螢幕尺寸。
       · #world（3D 畫布）故意「不」放進 #stage、不吃 CSS transform：而是直接把
         它的 CSS left/top/width/height 設成跟 #stage 一樣大的矩形——尺寸用真正的
         像素數字（不是縮放出來的），3D 引擎才能用這個尺寸設定渲染解析度，
         畫面才不會因為 CSS 縮放而模糊（這跟 js/reaction_drop.js 用 SVG viewBox
         而不是 CSS transform 縮放的理由是同一個道理）。
       · 算完之後把 html 加上 class="stage-ready"，對應 HTML 裡
         `html:not(.stage-ready) body{visibility:hidden}` 那條規則，這是整個頁面
         第一次真正「顯示出來」的時機點（在這之前都是刻意藏起來的素顏畫面）。
       · 最後通知所有訂閱者（靠 Stage.onResize() 註冊進來的函式，例如 3D 引擎要
         更新相機長寬比），每一個訂閱者包在 try/catch 裡——避免某一個訂閱者的
         callback 出錯，連累後面其他訂閱者都收不到這次的尺寸更新。 */
    function apply() {
        pending = 0;
        if (!stageEl) return;
        var r = measure();
        stageEl.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px) scale(' + r.scale + ')';
        if (worldEl) {
            var s = worldEl.style;
            s.left = r.left + 'px';
            s.top = r.top + 'px';
            s.width = r.width + 'px';
            s.height = r.height + 'px';
        }
        rect = r;
        document.documentElement.classList.add('stage-ready');
        for (var i = 0; i < subs.length; i++) {
            try { subs[i](rect); } catch (e) { console.error(e); }
        }
        if (debugEl) {
            debugEl.textContent =
                'viewport ' + Math.round(r.vw) + '×' + Math.round(r.vh) +
                '\nstage ×' + r.scale.toFixed(3) + '  dpr ' + r.dpr;
        }
    }

    /* resize/scroll 事件在某些裝置上會短時間內連續觸發好幾次（例如手機轉向、
       拖拉視窗邊緣），每次都重算整個版面很浪費。這裡用 requestAnimationFrame
       節流（throttle）：同一個畫面刷新週期內不管 schedule() 被呼叫幾次，
       apply() 最多只會真正執行一次（pending 旗標避免重複排程）。 */
    function schedule() {
        if (!pending) pending = global.requestAnimationFrame(apply);
    }

    function prevent(e) { e.preventDefault(); }

    /* 擋掉會干擾「遊戲」體驗的瀏覽器預設手勢：雙指縮放整頁、長按跳出系統選單、
       把圖片拖出頁面——這些在一般網頁是正常功能，但在這種固定版面的遊戲介面裡
       會讓畫面跑版或誤觸。 */
    function installGuards() {
        /* iOS Safari 會忽略 user-scalable=no，雙指縮放要另外擋 */
        document.addEventListener('gesturestart', prevent, { passive: false });
        document.addEventListener('gesturechange', prevent, { passive: false });
        document.addEventListener('touchmove', function (e) {
            if (e.touches && e.touches.length > 1 && !e.target.closest('.multitouch')) e.preventDefault();
        }, { passive: false });
        /* 長按不跳出系統選單、不拖出圖片 */
        document.addEventListener('contextmenu', prevent);
        document.addEventListener('dragstart', prevent);
    }

    var Stage = {
        W: DESIGN_W,
        H: DESIGN_H,

        init: function (opts) {
            opts = opts || {};
            stageEl = document.querySelector(opts.stage || '#stage');
            worldEl = document.querySelector(opts.world || '#world');
            if (!stageEl) throw new Error('Stage.init：找不到 #stage');

            probeEl = document.createElement('div');
            probeEl.className = 'sa-probe';
            document.body.appendChild(probeEl);

            if (/[?&]debug\b/.test(global.location.search)) {
                debugEl = document.createElement('div');
                debugEl.className = 'stage-debug';
                document.body.appendChild(debugEl);
            }

            apply();
            global.addEventListener('resize', schedule);
            global.addEventListener('orientationchange', function () { global.setTimeout(apply, 300); });
            if (global.visualViewport) {
                global.visualViewport.addEventListener('resize', schedule);
                global.visualViewport.addEventListener('scroll', schedule);
            }
            installGuards();
            return Stage;
        },

        /* 訂閱尺寸變化；會立刻以目前尺寸呼叫一次（這樣訂閱者不用自己再多寫一次
           「拿目前尺寸初始化」的程式碼，註冊當下就等於也呼叫了一次）。
           回傳一個「取消訂閱」函式，用不到這個監聽時（例如離開某個畫面）要記得
           呼叫它，不然舊的 callback 會一直留在 subs 陣列裡白白被呼叫。 */
        onResize: function (fn) {
            subs.push(fn);
            if (stageEl) fn(rect);
            return function off() {
                var i = subs.indexOf(fn);
                if (i >= 0) subs.splice(i, 1);
            };
        },

        rect: function () { return rect; },

        /* 滑鼠/觸控事件給的座標（clientX/Y）是「真實螢幕像素」，但遊戲邏輯裡
           （例如 3D 場景的搖桿判斷手指移動了多少）想用的是「設計時的 500×850
           座標系」，兩者之間差了 Stage 目前的縮放比例，所以要轉換：先量
           #stage 元素目前實際畫出來的寬度 b.width，除以設計寬度 500 得到目前
           縮放倍率 s，再用這個倍率把滑鼠座標換算回邏輯座標。 */
        toLogical: function (clientX, clientY) {
            var b = stageEl.getBoundingClientRect();
            var s = b.width / DESIGN_W;
            return { x: (clientX - b.left) / s, y: (clientY - b.top) / s };
        },

        /* 強制立即重算（例如動態插入 #world 之後） */
        refresh: apply
    };

    global.Stage = Stage;
})(window);
