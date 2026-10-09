/* ═══════════════════════════════════════════════════════════════════
   reaction_kit2.js — 第二批共用工具（V1.20.0 的 28 款新遊戲用）
   ───────────────────────────────────────────────────────────────────
   載入順序：reaction_kit.js 之後、各遊戲之前。內容（都掛在 Reaction.kit 底下）：
     kit.fingerHint()  操作提示（每一種都附一句短文字，例如「請點擊色塊」「請往左右拖曳」）：
                         · 點擊物件（不是按鈕）→ 手指圖示＋縮放動畫（mode:'tap'）；手指擺在「第一關的正確位置」
                         · 拖曳 → 手指圖示＋箭頭，手指從「第一關的起始位置」往「目標位置」重複移動（mode:'drag'）
                         · 上下左右四個方向都能拖 → 四個箭頭，手指依序往四個方向移動（mode:'drag4'）
                         · 需要持續按住 → 手指按下去不放＋波紋＋「請持續按住螢幕」（mode:'hold'）
     kit.onTap()       綁 pointerdown（本專案規定判定一律用 pointerdown，不用 click）
     kit.dragDamp()    「慢速微調」拖曳：手指移動越慢，實際變化量越小（可以微調到很細），
                       手指移動越快，變化量越接近 1:1（粗調很快）
     kit.run()         「闖關」遊戲骨架：標題列（第 N 關／命）、時間條、每關 setup(api)、
                       過關／失敗／扣命、結算（自動登最佳紀錄、送世界排行榜、可從前 5 關繼續）
     kit.single()      「單回合」遊戲骨架：一次機會、api.finish(誤差) 就結算（成績第 3、4 位
                       為 0 時偽造成非 0，只產生一次）
   遊戲檔案只要寫「每一關長什麼樣子、怎麼判定」，其餘流程都在這裡，所以行為一致、也只要測一次。
   ═══════════════════════════════════════════════════════════════════ */

/* 【新手導讀】這個檔案不是遊戲，是「遊戲的骨架」。看遊戲檔案時，遇到 kit.run(...) 或 kit.single(...)，
   意思就是「把這一款遊戲交給骨架去跑」；遊戲檔案自己只負責畫題目、判斷對錯，然後呼叫 api.pass() / api.fail() / api.finish()。 */
(function (global) {
    'use strict';

    var h = UI.h;
    var kit = Reaction.kit;

    /* ─── 手指圖示（SVG 字串）：食指伸出的手。指尖在 viewBox 的 (17, 3) ─── */
    var FINGER_SVG =
        '<svg viewBox="0 0 48 60" width="56" height="70" aria-hidden="true">' +
        '<path d="M17 3c-2.6 0-4.5 2-4.5 4.6V30l-3.4-3.6c-1.9-2-5-1.8-6.4.4-1 1.6-.7 3.6.7 5.1L16 49c2 2.2 4.8 3.4 7.8 3.4H33c5.6 0 10.2-4.600 10.200-10.200V27c0-2.500-2-4.500-4.500-4.500-.7 0-1.400.2-2 .5-.6-1.800-2.300-3-4.300-3-1.100 0-2.100.4-2.900 1.100-.8-1.700-2.400-2.800-4.300-2.800-.6 0-1.200.1-1.800.4V7.600C21.500 5 19.600 3 17 3z" ' +
        'fill="#FFFDF3" stroke="#4A3B1E" stroke-width="2.4" stroke-linejoin="round"/></svg>';
    var FINGER_TIP = { x: 17, y: 3 };       /* 指尖在 svg 裡的位置（px，svg 顯示大小 56×70，viewBox 48×60，比例 1.1667） */

    /* 拖曳方向 → 短文字：橫向「請往左右拖曳」、直向「請往上下拖曳」、斜向「請往上下左右拖曳」 */
    kit.dragText = function (dx, dy) {
        var ax = Math.abs(dx || 0), ay = Math.abs(dy || 0);
        if (ax > ay * 2) return '請往左右拖曳';
        if (ay > ax * 2) return '請往上下拖曳';
        return '請往上下左右拖曳';
    };

    /* kit.fingerHint(parent, o)：在 parent（要是 position:relative 的容器）裡顯示操作提示（手指圖示＋一句短文字）。
       o.mode：'tap'（縮放＋波紋）／'drag'（從起點往終點重複移動＋箭頭）／'drag4'（上下左右四個方向）／'hold'（按住不放）
       o.x, o.y：指尖的位置（parent 左上角為原點，邏輯 px）。tap／hold＝要點（按）的位置；drag＝第一關的「起始位置」
       o.dx, o.dy：drag 模式，終點（目標位置）相對起點的位移；drag4 的 o.len＝四個箭頭各多長（預設 80）
       o.text：短文字（例如「請點擊色塊」）；drag／drag4／hold 沒給就依方向自動產生（kit.dragText）
       o.labelAbove：true＝文字放在手指上方（預設放下方，放不下會自動翻到另一邊）
       o.delay：幾毫秒後才顯示（預設 0）
       回傳 { el, label, remove() }；提示不攔截任何點擊（pointer-events:none）。 */
    kit.fingerHint = function (parent, o) {
        var mode = o.mode || 'tap';
        var root = h('div', { 'class': 'rx-hint rx-hint--' + mode });
        root.style.left = o.x + 'px';
        root.style.top = o.y + 'px';
        var fx = FINGER_TIP.x * 56 / 48, fy = FINGER_TIP.y * 70 / 60;
        var finger = h('div', { 'class': 'rx-hint__finger', html: FINGER_SVG });
        finger.style.marginLeft = (-fx) + 'px';
        finger.style.marginTop = (-fy) + 'px';
        /* box：整個提示佔的範圍（parent 座標），用來決定文字放哪裡 */
        var box = { l: o.x - 30, r: o.x + 40, t: o.y - 30, b: o.y + 72 };
        var text = o.text;
        if (mode === 'drag') {
            var dx = o.dx || 0, dy = o.dy || 0;
            var len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
            /* 箭頭：從起點畫到終點（淡淡的線＋箭頭尖端），手指沿著它重複移動 */
            var arrow = h('div', { 'class': 'rx-hint__arrow' });
            arrow.style.width = len + 'px';
            arrow.style.transform = 'rotate(' + ang.toFixed(2) + 'deg)';
            root.appendChild(arrow);
            finger.style.setProperty('--dx', dx + 'px');
            finger.style.setProperty('--dy', dy + 'px');
            box.l = Math.min(o.x, o.x + dx) - 30; box.r = Math.max(o.x, o.x + dx) + 40;
            box.t = Math.min(o.y, o.y + dy) - 30; box.b = Math.max(o.y, o.y + dy) + 72;
            if (!text) text = kit.dragText(dx, dy);
        } else if (mode === 'drag4') {
            /* 四個方向各一支箭頭；手指依序往上、右、下、左各走一趟再回到中心（見 css 的 rx-drag4） */
            var L = o.len || 80;
            [[0, -1, -90], [1, 0, 0], [0, 1, 90], [-1, 0, 180]].forEach(function (d) {
                var a = h('div', { 'class': 'rx-hint__arrow' });
                a.style.width = L + 'px';
                a.style.transform = 'rotate(' + d[2] + 'deg)';
                root.appendChild(a);
            });
            finger.style.setProperty('--l', L + 'px');
            box.l = o.x - L - 30; box.r = o.x + L + 40; box.t = o.y - L - 30; box.b = o.y + L + 72;
            if (!text) text = '請往上下左右拖曳';
        } else if (mode === 'hold') {
            root.appendChild(h('div', { 'class': 'rx-hint__ring' }));
            if (!text) text = '請持續按住螢幕';
        } else {
            root.appendChild(h('div', { 'class': 'rx-hint__ring' }));
        }
        root.appendChild(finger);
        parent.appendChild(root);
        /* 短文字：放在提示範圍的下方；下方放不下就翻到上方，再放不下就貼邊 */
        var label = null;
        if (text) {
            label = h('div', { 'class': 'rx-hint__label', text: text });
            parent.appendChild(label);
            var pw = parent.clientWidth || 500, ph = parent.clientHeight || 850;
            var lw = label.offsetWidth, lh = label.offsetHeight;
            var left = Math.max(6, Math.min(pw - lw - 6, (box.l + box.r) / 2 - lw / 2));
            var top = o.labelAbove ? box.t - lh - 8 : box.b + 8;
            if (top + lh > ph - 6) top = box.t - lh - 8;
            if (top < 6) top = Math.max(6, Math.min(ph - lh - 6, top));
            label.style.left = left + 'px';
            label.style.top = top + 'px';
        }
        /* 延遲出現：先藏起來，時間到才顯示 */
        if (o.delay) {
            root.style.visibility = 'hidden';
            if (label) label.style.visibility = 'hidden';
            setTimeout(function () {
                root.style.visibility = '';
                if (label) label.style.visibility = '';
            }, o.delay);
        }
        return {
            el: root, label: label,
            remove: function () {
                if (root.parentNode) root.parentNode.removeChild(root);
                if (label && label.parentNode) label.parentNode.removeChild(label);
            }
        };
    };

    /* kit.ptIn(host, el, fx, fy)：元素 el 的某個位置（寬的 fx、高的 fy，預設正中央）在 host 裡的座標（邏輯 px）。
       操作提示的手指要擺在「正確的點擊位置」，就用它從答案元素算出座標。 */
    kit.ptIn = function (host, el, fx, fy) {
        var hr = host.getBoundingClientRect(), r = el.getBoundingClientRect();
        var sc = hr.width / (host.clientWidth || hr.width) || 1;
        return {
            x: (r.left - hr.left + r.width * (fx == null ? 0.5 : fx)) / sc,
            y: (r.top - hr.top + r.height * (fy == null ? 0.5 : fy)) / sc
        };
    };

    /* kit.onTap：綁 pointerdown（preventDefault 避免觸控裝置多送一次 click）；fn 回傳 false 不擋預設行為 */
    kit.onTap = function (el, fn) {
        el.addEventListener('pointerdown', function (e) { e.preventDefault(); fn(e); });
    };

    /* kit.dragDamp(el, o)：慢速微調拖曳。
       o.start(p, e)：手指按下（p 是 o.ref || el 左上角為原點的邏輯座標），回傳 false 表示不接這次按下
       o.move(dx, dy, p, e)：每次移動，dx／dy 是「打過折」的變化量（邏輯 px）
       o.end(e)：放開（或被系統取消）
       o.enabled()：回傳 false 時完全不理
       o.gainMin（預設 0.25）：手指很慢時的增益；o.speedFull（預設 1）：速度（px／毫秒）達到這個值以上增益才是 1 */
    kit.dragDamp = function (el, o) {
        var gMin = o.gainMin == null ? 0.25 : o.gainMin, vFull = o.speedFull || 1;
        var d = null;
        function gainFor(speed) { return kit.lerp(gMin, 1, kit.clamp(speed / vFull, 0, 1)); }
        el.addEventListener('pointerdown', function (e) {
            if (d || (o.enabled && !o.enabled())) return;
            var p = kit.localPt(e, o.ref || el);
            if (o.start && o.start(p, e) === false) return;
            e.preventDefault();
            try { el.setPointerCapture(e.pointerId); } catch (err) { }
            d = { id: e.pointerId, x: p.x, y: p.y, t: performance.now() };
        });
        el.addEventListener('pointermove', function (e) {
            if (!d || e.pointerId !== d.id) return;
            var p = kit.localPt(e, o.ref || el), now = performance.now();
            var rx = p.x - d.x, ry = p.y - d.y, dt = Math.max(1, now - d.t);
            var g = gainFor(Math.sqrt(rx * rx + ry * ry) / dt);
            d.x = p.x; d.y = p.y; d.t = now;
            o.move(rx * g, ry * g, p, e);
        });
        function end(e) {
            if (!d || e.pointerId !== d.id) return;
            d = null;
            if (o.end) o.end(e);
        }
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        return { gainFor: gainFor, active: function () { return !!d; } };
    };


    /* kit.startCover(stage, o)：在遊戲區蓋一層「準備好了按開始」的遮罩，按下才呼叫 o.onStart()。
       o.text：遮罩上的說明；o.btn：按鈕字（預設「開始」）。回傳 { remove() } */
    kit.startCover = function (stage, o) {
        var btn = h('button', { 'class': 'btn btn--go', text: o.btn || '開始' });
        var cover = h('div', { 'class': 'rx-cover' }, [h('div', { 'class': 'rx-cover__text', text: o.text || '' }), btn]);
        stage.appendChild(cover);
        kit.onTap(btn, function () {
            if (!cover.parentNode) return;
            cover.parentNode.removeChild(cover);
            Sfx.play('go');
            o.onStart();
        });
        return { remove: function () { if (cover.parentNode) cover.parentNode.removeChild(cover); }, btn: btn };
    };

    /* kit.clock(parent, my)：碼表（顯示「時間 X.XXXX 秒」）。
       start()／stop()（回傳含罰秒的總毫秒）／penalty(ms)（加罰秒）／ms()（目前總毫秒） */
    kit.clock = function (parent, my) {
        var el = h('div', { 'class': 'rx-clock', text: '時間 0.0000 秒' });
        if (parent) parent.appendChild(el);
        var t0 = null, pen = 0, stopped = null, loop = null;
        function total() { return stopped != null ? stopped : (t0 == null ? 0 : performance.now() - t0 + pen); }
        function paint() { el.textContent = '時間 ' + kit.sec(total()) + ' 秒'; }
        return {
            el: el,
            start: function () {
                t0 = performance.now(); pen = 0; stopped = null;
                loop = my.loop(function () { paint(); });
            },
            stop: function () { if (stopped == null) stopped = total(); if (loop) { loop.stop(); loop = null; } paint(); return stopped; },
            penalty: function (ms) { pen += ms; el.classList.add('rx-clock--pen'); my.after(400, function () { el.classList.remove('rx-clock--pen'); }); paint(); },
            ms: total
        };
    };


    /* kit.hintOn(host, el, o)：把操作提示放在「某個元素」上（舊的 35 款遊戲用）。
       host：提示的容器（要是 position:relative／absolute，例如 #screen 或遊戲區）；
       el：手指要擺的元素——tap／hold＝要點（按）的正確元素；drag＝第一關拖曳的「起始元素」；
       o.fx／o.fy：指尖落在元素寬／高的幾分之幾（預設正中央）；
       el 給 null 時改用 o.x／o.y（host 左上角起算的邏輯座標），用在「整個畫面都可以點／滑」的遊戲。
       drag 的目標位置：o.to ＝目標元素（o.tfx／o.tfy 指定落在它的哪裡，預設正中央）或 { x, y }（host 座標）；
       或直接給位移 o.dx／o.dy。
       o.mode：'tap'／'drag'／'drag4'／'hold'；o.text：短文字（例如「請點擊色塊」）；o.delay：延遲幾毫秒才出現。
       玩家在 host 裡第一次按下（pointerdown）就自動消失；回傳 { remove() }。 */
    kit.hintOn = function (host, el, o) {
        o = o || {};
        var x = o.x, y = o.y, dx = o.dx, dy = o.dy;
        if (el) { var p = kit.ptIn(host, el, o.fx, o.fy); x = p.x; y = p.y; }
        if (o.to) {
            var q = o.to.getBoundingClientRect ? kit.ptIn(host, o.to, o.tfx, o.tfy) : o.to;
            dx = q.x - x; dy = q.y - y;
        }
        var hint = kit.fingerHint(host, { mode: o.mode || 'tap', x: x, y: y, dx: dx, dy: dy, len: o.len, text: o.text, labelAbove: o.labelAbove, delay: o.delay });
        function off() { hint.remove(); host.removeEventListener('pointerdown', off, true); }
        host.addEventListener('pointerdown', off, true);
        return { remove: off, el: hint.el };
    };


    /* kit.once(key)：同一個頁面只有第一次呼叫回傳 true（舊遊戲的操作提示只在第一次進遊戲時顯示，重玩不再顯示） */
    var onceSeen = {};
    kit.once = function (key) { if (onceSeen[key]) return false; onceSeen[key] = true; return true; };

    /* ═══ 共用的最佳紀錄比較 ═══ */
    function gt(v, b) { return v > b; }
    function lt(v, b) { return v < b; }

    /* ═══════════════════════════════════════════════════════════════
       kit.run(root, ctx, o)：闖關式遊戲骨架
       ───────────────────────────────────────────────────────────────
       o.id／o.G：遊戲 id、遊戲物件（骨架會把 G.debug 掛上去）
       o.setup(api)：每一關開始時呼叫，在 api.stage 裡畫這一關
       o.numText(score)：結算大字（例如 '12 關'）；o.fmtBest 省略就用 numText
       o.rating(score, S)：結算評語（字串）
       o.lives：幾條命（預設 1）；o.maxLevel：最後一關（過了就全破）
       o.scoreOf(S)：成績不是「過幾關」時的算法（例如累計分數）；有這個就不提供「從前 5 關繼續」
       o.head(level, S)：標題列左邊的文字（預設「第 N 關」）
       o.info(S)：標題列右邊的文字（預設：多條命時顯示命）
       o.lines(S)：結算頁的說明行
       o.resume：false 表示不提供從前 5 關繼續
       api：
         api.level／api.S／api.stage／api.my／api.rand
         api.timer(ms, onTimeout)／api.stopTimer()：時間條（只能同時有一個）
         api.after(ms, fn)：這一關專用的延遲（換關後自動作廢）
         api.pass({gain, delay})：過關；api.fail({lines, delay})：失敗結束；api.lose({lines})：扣一條命（命沒了就失敗）
         api.setInfo(text)：改標題列右邊文字
         api.solve／api.wrong：遊戲設定，給驗證用（debug.solve() 會呼叫它們）
       ═══════════════════════════════════════════════════════════════ */
    kit.run = function (root, ctx, o) {
        var R = null, S = null, api = null, tok = 0;
        var elLv, elInfo, bar, stage;
        var G = o.G;
        function numText(v) { return o.numText(v); }
        function fmtBest(v) { return v == null ? '' : '最佳 ' + (o.fmtBest || numText)(v); }
        ctx.setMeta(fmtBest(Reaction.getBest(o.id)));

        function livesText() {
            if (!(o.lives > 1)) return '';
            var s = '命 ';
            for (var i = 0; i < o.lives; i++) s += i < S.lives ? '●' : '○';
            return s;
        }
        function paintHead() {
            elLv.textContent = o.head ? o.head(S.level, S) : '第 ' + S.level + ' 關';
            var info = o.info ? o.info(S) : livesText();
            elInfo.textContent = info || '';
        }

        function start(from) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            from = from || 1;
            S = { level: from, cleared: from - 1, lives: o.lives || 1, score: 0, over: false, finished: false, log: [] };
            elLv = h('div', { 'class': 'rx-head__lv' });
            elInfo = h('div', { 'class': 'rx-head__info' });
            var head = h('div', { 'class': 'rx-head' }, [elLv, elInfo]);
            bar = kit.timebar();
            bar.el.classList.add('rx-timebar');
            stage = h('div', { 'class': 'rx-stage' });
            root.appendChild(head); root.appendChild(bar.el); root.appendChild(stage);
            bar.set(0);
            if (o.mountExtra) o.mountExtra(root, my);
            my.after(250, function () { nextLevel(from); });
        }

        function nextLevel(n) {
            if (R.dead) return;
            tok++;
            S.level = n;
            var my = R, myTok = tok;
            var tm = null, tmLoop = null;
            stage.innerHTML = '';
            stage.className = 'rx-stage' + (o.stageClass ? ' ' + o.stageClass : '');
            bar.set(0);
            api = {
                level: n, S: S, stage: stage, my: my, rand: Math.random, over: false, root: root,
                after: function (ms, fn) { return my.after(ms, function () { if (myTok === tok) fn(); }); },
                setInfo: function (t) { elInfo.textContent = t; },
                stopTimer: function () {
                    if (tm != null) { my.cancel(tm); tm = null; }
                    if (tmLoop) { tmLoop.stop(); tmLoop = null; }
                },
                timer: function (ms, onTimeout) {
                    api.stopTimer();
                    var t0 = performance.now();
                    bar.set(1);
                    tm = my.after(ms, function () {
                        if (myTok !== tok || api.over) return;
                        tm = null; if (tmLoop) { tmLoop.stop(); tmLoop = null; }
                        bar.set(0); onTimeout();
                    });
                    tmLoop = my.loop(function () { bar.set(1 - (performance.now() - t0) / ms); });
                    return { left: function () { return Math.max(0, ms - (performance.now() - t0)); }, total: ms };
                },
                /* api.skip(ms)：不算過關也不算失敗，直接進下一關（例如「先記住」的暖身題） */
                skip: function (ms) {
                    if (api.over) return; api.over = true; api.stopTimer(); bar.set(0);
                    my.after(ms || 0, function () { nextLevel(n + 1); });
                },
                pass: function (x) {
                    if (api.over) return; api.over = true; api.stopTimer(); bar.set(0);
                    x = x || {};
                    S.cleared++; S.score += x.gain || 0;
                    if (x.log) S.log.push(x.log);
                    Sfx.play('ok'); paintHead();
                    var wait = x.delay != null ? x.delay : (o.passDelay != null ? o.passDelay : 700);
                    if (o.maxLevel && n >= o.maxLevel) my.after(wait, function () { finish(x, true); });
                    else my.after(wait, function () { nextLevel(n + 1); });
                },
                fail: function (x) {
                    if (api.over) return; api.over = true; api.stopTimer(); bar.set(0);
                    x = x || {};
                    Sfx.play('bad');
                    my.after(x.delay != null ? x.delay : 1500, function () { finish(x, false); });
                },
                lose: function (x) {
                    if (api.over) return S.lives;
                    S.lives--;
                    paintHead();
                    if (S.lives <= 0) { api.fail(x); return 0; }
                    Sfx.play('bad');
                    return S.lives;
                }
            };
            paintHead();
            o.setup(api);
        }

        function finish(x, allClear) {
            if (S.finished) return;
            S.finished = true;
            var score = o.scoreOf ? o.scoreOf(S) : S.cleared;
            var isNew = score > 0 ? Reaction.setBest(o.id, score, gt) : false;
            ctx.setMeta(fmtBest(Reaction.getBest(o.id)));
            var resume = null;
            if (o.resume !== false && !o.scoreOf && !allClear && S.level > 1) {
                var from = kit.resumeFrom(S.level);
                resume = { level: from, run: function () { start(from); } };
            }
            var lines = (o.lines ? o.lines(S, allClear) : []).concat((x && x.lines) || []);
            console.log('[' + (G && G.name || o.id) + '] 結算：成績 ' + score + (S.level ? '（停在第 ' + S.level + ' 關）' : ''));
            kit.result(root, {
                score: score,
                num: numText(score),
                label: o.rating ? o.rating(score, S) : '',
                lines: lines, isNew: isNew, note: o.note,
                sfx: allClear ? 'perfect' : (score >= (o.goodAt || 5) ? 'win' : 'fail'),
                onAgain: function () { start(1); },
                resume: resume
            });
        }

        if (G) {
            G.debug = {
                state: function () { return { level: S.level, cleared: S.cleared, lives: S.lives, score: S.score, over: !!(api && api.over), finished: S.finished }; },
                api: function () { return api; },
                solve: function () { return api && api.solve && api.solve(); },
                wrong: function () { return api && api.wrong && api.wrong(); },
                restart: function () { start(1); },
                goto: function (n) { if (R) { api && (api.over = true); nextLevel(n); } },
                info: function () { return api && api.info; }
            };
        }
        start(1);
    };

    /* ═══════════════════════════════════════════════════════════════
       kit.single(root, ctx, o)：單回合（一次機會）遊戲骨架
       ───────────────────────────────────────────────────────────────
       o.id／o.G／o.title（上方說明文字）／o.better（'min'|'max'）
       o.setup(api)：每一回合開始呼叫，在 api.stage 裡畫題目
       o.numText(v)：結算大字；o.rating(v)；o.sfx(v)（'perfect'|'win'|'fail'）
       o.fake4：預設 true（成績第 3、4 位為 0 時偽造成非 0，結算時只產生一次）；整數成績設 false
       o.max：成績上限（偽造後不超過）
       api：
         api.stage／api.my／api.setTip(text)
         api.finish(real, x)：real 是真實成績；x.lines 是結算說明行
       ═══════════════════════════════════════════════════════════════ */
    kit.single = function (root, ctx, o) {
        var R = null, api = null, done = false, G = o.G;
        var better = o.better === 'min' ? lt : gt;
        function fmtBest(v) { return v == null ? '' : '最佳 ' + (o.fmtBest || o.numText)(v); }
        ctx.setMeta(fmtBest(Reaction.getBest(o.id)));

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            done = false;
            root.innerHTML = '';
            var tip = h('div', { 'class': 'rx-tip', text: o.title || '' });
            var stage = h('div', { 'class': 'rx-stage' + (o.stageClass ? ' ' + o.stageClass : '') });
            root.appendChild(tip); root.appendChild(stage);
            api = {
                stage: stage, my: my, root: root, rand: Math.random, tip: tip,
                restart: function () { round(); },
                setTip: function (t) { tip.textContent = t; },
                finish: function (real, x) {
                    if (done) return;
                    done = true;
                    x = x || {};
                    var v = o.fake4 === false ? real : Leaderboard.fake4(real);
                    if (o.max != null && v > o.max) v = o.max;
                    console.log('[' + (G && G.name || o.id) + '] 實際 ' + Number(real).toFixed(6) + ' → 成績 ' + Number(v).toFixed(4));
                    var isNew = Reaction.setBest(o.id, v, better);
                    ctx.setMeta(fmtBest(Reaction.getBest(o.id)));
                    kit.result(root, {
                        score: v, num: o.numText(v), label: o.rating ? o.rating(v) : '',
                        lines: x.lines || [], isNew: isNew,
                        sfx: o.sfx ? o.sfx(v) : 'win', onAgain: round
                    });
                }
            };
            if (G) G.debug = o.debug ? o.debug(api) : {};
            o.setup(api);
        }
        round();
    };
})(window);
