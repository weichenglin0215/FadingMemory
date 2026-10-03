/* ═══════════════════════════════════════════════════════════════════
   reaction_kit.js — 秒反應新遊戲共用的小工具箱（Reaction.kit）
   ───────────────────────────────────────────────────────────────────
   · 這個檔案只放「好幾款遊戲都會用到、而且跟哪一款遊戲無關」的東西，載入順序在
     reaction_core.js 之後、各遊戲之前。舊的七款遊戲各自有自己的一份（svgEl／
     tweenViewBox 等），不動它們，避免影響已經穩定的遊戲。
   · 內容：
       kit.svg()          建 SVG 元素
       kit.ramp()         線性難度（start → end，不是等比例縮小）
       kit.rng()          可重現亂數（mulberry32）＋ pick／shuffle／randInt
       kit.sec()          毫秒 → 「X.XXX」秒字串（畫面一律用秒，不用毫秒）
       kit.round()        一局的「生命週期物件」：這一局排的計時器、動畫迴圈，
                          重開一局（dispose）時全部自動作廢，不會有上一局的計時器
                          殘留下來動到新的一局
       kit.tween()        動畫補間（rAF 為主，setTimeout 保底：分頁在背景時 rAF 會
                          被瀏覽器整個暫停，沒有保底就會卡死）
       kit.tweenViewBox() SVG 鏡頭推進（改 viewBox，向量永遠銳利）
       kit.result()       結算卡片（疊在遊戲畫面上）；data-sfx 讓 reaction.js 自動
                          播「過關／失敗」短旋律＋結算背景音樂
       kit.hold()         「按住／放開」輸入（切到背景一律視為放開）
       kit.pt()／kit.evT()  取得事件的邏輯座標／高精度時間
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var h = UI.h;
    var SVGNS = 'http://www.w3.org/2000/svg';
    var REDUCED = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var kit = {};

    /* ─── SVG ─── */
    kit.svg = function (tag, attrs, parent) {
        var el = document.createElementNS(SVGNS, tag);
        if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    /* ─── 緩動 ─── */
    kit.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
    kit.easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    kit.easeInQuad = function (t) { return t * t; };
    kit.linear = function (t) { return t; };

    /* ─── 線性難度：第 level 關（從 1 起算）的值，從 start 線性走到 maxLevel 關的 end，
           之後維持 end。不用等比例縮小（乘 0.85 那種），那種前幾關降得快、後面幾乎不再變難。 ─── */
    kit.ramp = function (level, start, end, maxLevel) {
        if (maxLevel <= 1) return end;
        var p = Math.min(1, Math.max(0, (level - 1) / (maxLevel - 1)));
        return start + (end - start) * p;
    };

    /* ─── 亂數 ─── */
    kit.rng = function (seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    };
    /* 真正隨機的種子（優先用 crypto） */
    kit.newSeed = function () {
        try {
            var a = new Uint32Array(1);
            global.crypto.getRandomValues(a);
            return a[0];
        } catch (e) { return Math.floor(Math.random() * 4294967296); }
    };
    /* 用 rand（0~1 的函式，預設 Math.random）做的小工具 */
    kit.randInt = function (a, b, rand) { return a + Math.floor((rand || Math.random)() * (b - a + 1)); };
    kit.randFloat = function (a, b, rand) { return a + (b - a) * (rand || Math.random)(); };
    kit.pick = function (arr, rand) { return arr[Math.floor((rand || Math.random)() * arr.length)]; };
    kit.shuffle = function (arr, rand) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor((rand || Math.random)() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };

    /* ─── 顯示格式：時間一律用「秒」，X.XXX ─── */
    kit.sec = function (ms) { return (ms / 1000).toFixed(3); };
    kit.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

    /* ─── 事件：邏輯座標（500×850 舞台）與高精度時間 ─── */
    kit.pt = function (e) { return Stage.toLogical(e.clientX, e.clientY); };
    /* e.timeStamp 跟 performance.now() 是同一個時間基準；合成事件或舊瀏覽器給怪值時退回 now */
    kit.evT = function (e) {
        var now = performance.now();
        var t = e && e.timeStamp;
        return (t > 0 && t <= now + 50 && t > now - 60000) ? t : now;
    };

    kit.ruleOpen = function () {
        var d = document.getElementById('rule-dlg');
        return !!d && !d.hidden;
    };

    /* ═══ 一局的生命週期 ═══
       每一款遊戲的 round() 開頭 new 一個 kit.round()，所有計時器、迴圈都從它身上排；
       重開一局時呼叫舊的 dispose()，這一局排過的東西全部作廢（計時器清掉、迴圈停掉、
       還沒完成的 Promise 永遠不會 resolve，所以接在後面的 .then 也不會再執行）。 */
    kit.round = function () {
        var r = { dead: false, timers: [], rafs: {}, hooks: [] };
        var rafSeq = 0;

        r.after = function (ms, fn) {
            var id = global.setTimeout(function () { if (!r.dead) fn(); }, ms);
            r.timers.push(id);
            return id;
        };
        r.cancel = function (id) { global.clearTimeout(id); };
        r.wait = function (ms) {
            return new Promise(function (res) { r.after(ms, res); });
        };

        /* rAF 迴圈：fn(now, dt) 回傳 false 就停；dispose 也會停。dt 最多 50ms，
           避免分頁從背景回來時一次吃到很大的 dt 讓東西瞬間飛走。 */
        r.loop = function (fn) {
            var last = null, my = ++rafSeq, handle = { stopped: false };
            function frame(now) {
                if (r.dead || handle.stopped) { delete r.rafs[my]; return; }
                var dt = last == null ? 16 : Math.min(50, now - last);
                last = now;
                if (fn(now, dt) === false) { handle.stopped = true; delete r.rafs[my]; return; }
                r.rafs[my] = global.requestAnimationFrame(frame);
            }
            r.rafs[my] = global.requestAnimationFrame(frame);
            handle.stop = function () {
                handle.stopped = true;
                if (r.rafs[my] != null) { global.cancelAnimationFrame(r.rafs[my]); delete r.rafs[my]; }
            };
            return handle;
        };

        /* 補間：duration 毫秒內 p 從 0 跑到 1，每影格呼叫 onFrame(eased p)。
           回傳 Promise，跑完（或保底時間到）resolve。 */
        r.tween = function (duration, onFrame, ease) {
            ease = ease || kit.easeInOutCubic;
            return new Promise(function (resolve) {
                if (REDUCED || duration <= 0) { onFrame(1); resolve(); return; }
                var done = false;
                function finish() {
                    if (done) return;
                    done = true;
                    onFrame(1);
                    resolve();
                }
                var t0 = performance.now();
                var loop = r.loop(function (now) {
                    var p = Math.min(1, (now - t0) / duration);
                    onFrame(ease(p));
                    if (p >= 1) { finish(); return false; }
                });
                /* 保底：rAF 被暫停時，時間到了直接跳到終點 */
                r.after(duration + 400, function () { loop.stop(); finish(); });
            });
        };

        r.onDispose = function (fn) { r.hooks.push(fn); };
        r.dispose = function () {
            if (r.dead) return;
            r.dead = true;
            r.timers.forEach(function (id) { global.clearTimeout(id); });
            for (var k in r.rafs) global.cancelAnimationFrame(r.rafs[k]);
            r.hooks.forEach(function (fn) { try { fn(); } catch (e) { } });
        };
        return r;
    };

    /* ─── SVG 鏡頭推進 ─── */
    kit.setViewBox = function (svg, b) {
        svg.setAttribute('viewBox', b.vx + ' ' + b.vy + ' ' + b.vw + ' ' + b.vh);
    };
    /* 把 viewBox 從 from 補間到 to（r 是 kit.round()）；onFrame(box, p) 讓呼叫端
       跟著放大倍率調整其他東西（例如越放大越顯示更細的刻度） */
    kit.tweenViewBox = function (r, svg, from, to, ms, ease, onFrame) {
        return r.tween(ms, function (e) {
            var b = {
                vx: from.vx + (to.vx - from.vx) * e,
                vy: from.vy + (to.vy - from.vy) * e,
                vw: from.vw + (to.vw - from.vw) * e,
                vh: from.vh + (to.vh - from.vh) * e
            };
            kit.setViewBox(svg, b);
            if (onFrame) onFrame(b, e);
        }, ease || kit.easeInOutCubic);
    };

    /* ═══ 結算卡片 ═══
       疊在遊戲畫面上（跟舊遊戲同一套 .drop-result-overlay／-card）。
       o.sfx：'win'（過關）／'fail'（失敗）／'perfect'／'neutral'——reaction.js 的
       MutationObserver 看到 data-sfx 就會自動播對應短旋律＋結算背景音樂。 */
    kit.result = function (root, o) {
        var kids = [];
        if (o.num != null) kids.push(h('div', { 'class': 'rx-result__num', text: o.num }));
        if (o.label) kids.push(h('div', { 'class': 'rx-result__label', text: o.label }));
        (o.lines || []).forEach(function (t) { kids.push(h('div', { 'class': 'hint rx-result__line', text: t })); });
        if (o.isNew) kids.push(h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }));
        if (o.note) kids.push(h('div', { 'class': 'hint rx-result__note', text: o.note }));
        (o.extra || []).forEach(function (n) { if (n) kids.push(n); });
        if (o.onAgain) kids.push(h('button', {
            'class': 'btn btn--primary', text: o.againText || '再挑戰一次',
            on: { click: function () { Sfx.play('click'); o.onAgain(); } }
        }));
        var attrs = { 'data-sfx': o.sfx || 'neutral' };
        if (o.bgm === false) attrs['data-bgm'] = '0';
        var ov = h('div', { 'class': 'drop-result-overlay', attrs: attrs }, [
            h('div', { 'class': 'drop-result-card' }, kids)
        ]);
        root.appendChild(ov);
        return ov;
    };

    /* ═══ 按住／放開 ═══
       down(e) 在 pointerdown 呼叫，up(e, reason) 在放開時呼叫一次（reason：
       'up'／'cancel'／'hidden'／'api'）。分頁切到背景、視窗失焦一律視為放開。 */
    kit.hold = function (el, o) {
        var holding = false;
        function up(e, reason) {
            if (!holding) return;
            holding = false;
            if (o.up) o.up(e, reason);
        }
        el.addEventListener('pointerdown', function (e) {
            if (holding || (o.enabled && !o.enabled())) return;
            e.preventDefault();
            holding = true;
            try { el.setPointerCapture(e.pointerId); } catch (err) { }
            o.down(e);
        });
        el.addEventListener('pointerup', function (e) { up(e, 'up'); });
        el.addEventListener('pointercancel', function (e) { up(e, 'cancel'); });
        function onHidden() { if (document.hidden) up(null, 'hidden'); }
        function onBlur() { up(null, 'hidden'); }
        document.addEventListener('visibilitychange', onHidden);
        global.addEventListener('blur', onBlur);
        return {
            isHolding: function () { return holding; },
            release: function () { up(null, 'api'); },
            destroy: function () {
                document.removeEventListener('visibilitychange', onHidden);
                global.removeEventListener('blur', onBlur);
            }
        };
    };

    /* 回傳遊戲 id 專屬的 meta 文字小工具：把「第 N 關・最佳 …」這類字串接起來 */
    kit.meta = function (parts) { return parts.filter(function (p) { return p; }).join('・'); };

    kit.REDUCED = REDUCED;
    Reaction.kit = kit;
})(window);
