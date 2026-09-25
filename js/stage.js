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

    function schedule() {
        if (!pending) pending = global.requestAnimationFrame(apply);
    }

    function prevent(e) { e.preventDefault(); }

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

        /* 訂閱尺寸變化；會立刻以目前尺寸呼叫一次 */
        onResize: function (fn) {
            subs.push(fn);
            if (stageEl) fn(rect);
            return function off() {
                var i = subs.indexOf(fn);
                if (i >= 0) subs.splice(i, 1);
            };
        },

        rect: function () { return rect; },

        /* 螢幕座標（clientX/Y）→ 舞台邏輯座標（0..500, 0..850） */
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
