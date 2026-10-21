/* ═══════════════════════════════════════════════════════════════════
   reaction_layerdrink.js — 秒反應・照樣調一杯（企劃 319）
   吧台先展示一杯分層的漸層飲料（底下紅、中間黃、上面藍，各層高度不同），3 秒後收走。**照記憶一層一層調出一樣的**：
   按住紅色瓶子倒紅色、放手；再按住黃色……每層的高度要跟剛才一樣。倒完後兩杯並排：「最大差 6.1238%」。
   ───────────────────────────────────────────────────────────────────
   · 示範杯是直筒的，**你的杯子上寬下窄**（杯口寬 / 杯底寬 = 1 ÷ RATIO，RATIO 隨關卡 0.9 → 0.5：越後面越像漏斗）。倒的流量是固定的（每秒倒進多少「體積」），
     但杯子下面窄、上面寬，所以**液面上升的速度越倒越慢**（高度每秒上升 = 流量 ÷ 這個高度的截面積；截面積 ∝ 寬的平方，見 volumeAt／heightAt）。
     要靠眼睛看液面高度，一邊估一邊放手。
   · 層與顏色：n 層（2 → 5，LAYERS）顏色互不相同，每層厚度（佔杯高的比例）至少 MIN_FRAC，加起來剛好 1（倒滿）。一次只能倒「下一層該用的顏色」——
     按錯瓶子馬上結束（顏色順序是記憶的一部分）。
   · 判定：每層的厚度 = 這一層放手時的液面高度 − 上一層放手時的高度（佔杯高的比例）；跟示範杯同一層的厚度差，取最大的那個（maxDiff），就是「最大差 X.XXXX%」。
     容許 15% → 3%（TOL）。倒到杯口會自動停；最後一層放手就開始比（沒倒滿的部分算在最後一層上）。
   · 難度（線性）：層數 2 → 5、看的時間 3 → 2 秒（VIEW_S）、容許誤差 15% → 3%、杯子的下窄上寬 0.9 → 0.5、倒滿一杯要的時間 8 → 6 秒（FILL_S）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'layerdrink';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var LAYERS = [2, 5];                        /* 層數：第 1 關 → 到頂 */
    var VIEW_S = [3, 2];                        /* 看示範杯的時間（秒）：第 1 關 → 到頂 */
    var TOL = [15, 3];                          /* 容許的最大差（佔杯高的 %）：第 1 關 → 到頂 */
    var RATIO = [0.9, 0.5];                     /* 你的杯子杯底寬 ÷ 杯口寬：第 1 關 → 到頂（越小越像漏斗、液面上升速度變化越大） */
    var FILL_S = [8, 6];                        /* 一路倒下去，多少秒會倒滿你的杯子：第 1 關 → 到頂 */
    var MIN_FRAC = 0.1;                         /* 每一層至少佔杯高多少 */
    var GLASS_H = 200;                          /* 杯子的高度（px，畫面上） */
    var DEMO_W = 112, TOP_W = 132;              /* 示範杯的寬度、你的杯子的杯口寬度（px） */
    var BLEND = 0.045;                          /* 層與層之間的漸層帶有多厚（佔杯高的比例） */
    var MAX_LEVEL = 90;
    var COLORS = [{ id: 'red', name: '紅' }, { id: 'yellow', name: '黃' }, { id: 'green', name: '綠' }, { id: 'blue', name: '藍' }, { id: 'purple', name: '紫' }];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function layersFor(level) { return Math.round(ramp(level, LAYERS)); }
    function viewMs(level) { return Math.round(ramp(level, VIEW_S) * 1000); }
    function tolFor(level) { return Math.round(ramp(level, TOL) * 10) / 10; }
    function ratioFor(level) { return Math.round(ramp(level, RATIO) * 1000) / 1000; }
    function fillS(level) { return Math.round(ramp(level, FILL_S) * 10) / 10; }
    /* 倒進杯子的體積到液面高度 y（0～1，佔杯高）時的累計體積：杯寬 w(y) = ratio + (1 − ratio)×y（以杯口寬為 1），截面積 ∝ w²，所以體積是 w² 的積分 */
    function volumeAt(y, ratio) { var d = 1 - ratio; return ratio * ratio * y + ratio * d * y * y + d * d * y * y * y / 3; }
    /* 反過來：累計體積 v 對應的液面高度（二分搜尋；v 超過整杯就回傳 1） */
    function heightAt(v, ratio) {
        if (v >= volumeAt(1, ratio)) return 1;
        var lo = 0, hi = 1;
        for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (volumeAt(mid, ratio) < v) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    }
    /* 每秒倒進的體積（讓一路倒下去 fillTime 秒剛好倒滿你的杯子） */
    function flowRate(ratio, fillTime) { return volumeAt(1, ratio) / fillTime; }
    /* 兩杯的最大差：demo[i]、player[i] 都是第 i 層的厚度（佔杯高的比例）；回傳百分比（0～100） */
    function maxDiff(demo, player) {
        var m = 0; for (var i = 0; i < demo.length; i++) m = Math.max(m, Math.abs(demo[i] - (player[i] || 0)));
        return m * 100;
    }
    /* 由每層放手時的液面高度（累積）算每層厚度 */
    function thicknesses(bounds) { return bounds.map(function (b, i) { return b - (i ? bounds[i - 1] : 0); }); }
    /* 隨機分成 n 層，每層至少 MIN_FRAC、總和 1（用「先給每層最小值，剩下的隨機分配」）*/
    function splitLayers(n, rand) {
        rand = rand || Math.random;
        for (var tr = 0; tr < 200; tr++) {
            var rest = 1 - n * MIN_FRAC, w = [], s = 0, i;
            for (i = 0; i < n; i++) { var x = -Math.log(1 - rand() * 0.999) + 0.25; w.push(x); s += x; }
            var f = w.map(function (x) { return MIN_FRAC + rest * x / s; });
            if (n < 2 || Math.max.apply(null, f) - Math.min.apply(null, f) > 0.08) return f;                 /* 不要每層一樣厚（那就不用記了） */
        }
        return Array.apply(null, { length: n }).map(function (x, i) { return 1 / n; });
    }
    /* 出一關：{ n, colors（色碼編號，下到上）, fracs（每層厚度）, ratio, rate（每秒倒進的體積）, fillS, tol, viewMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = layersFor(level), colors = kit.shuffle([0, 1, 2, 3, 4], rand).slice(0, n), ratio = ratioFor(level), fs = fillS(level);
        return { n: n, colors: colors, fracs: splitLayers(n, rand), ratio: ratio, rate: flowRate(ratio, fs), fillS: fs, tol: tolFor(level), viewMs: viewMs(level), level: level };
    }
    /* 完美的倒法：每層要按住多久（秒）——從 demo 的累計高度反推需要的累計體積，一層一層相減，再除以流量 */
    function perfectHolds(q) {
        var y = 0, prev = 0, out = [];
        q.fracs.forEach(function (f) { y += f; var v = volumeAt(Math.min(1, y), q.ratio); out.push((v - prev) / q.rate); prev = v; });
        return out;
    }
    function rating(n) {
        if (n >= 15) return '調酒大師！';
        if (n >= 10) return '手感和記憶都很棒！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '記住每層的高度比例，看液面放手！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'lyd-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 杯子（SVG）：glassTop／glassBottom 是杯口、杯底的寬（px）；回傳 { svg, setLayers(bounds, colors, cur) }
       bounds：每一層「上緣」的高度（0～1，由下往上累計）；cur：{ top, color }＝正在倒的那一層（上緣隨時間變高） */
    var gid = 0;
    function glass(parent, wTop, wBottom) {
        var W = 170, cx = W / 2, y0 = 12, y1 = y0 + GLASS_H, id = 'lyd-clip-' + (++gid);
        var svg = kit.svg('svg', { 'class': 'lyd-glass', viewBox: '0 0 ' + W + ' ' + (GLASS_H + 28), width: W, height: GLASS_H + 28 }, parent);
        var defs = kit.svg('defs', {}, svg), cp = kit.svg('clipPath', { id: id }, defs);
        var pts = (cx - wTop / 2) + ',' + y0 + ' ' + (cx + wTop / 2) + ',' + y0 + ' ' + (cx + wBottom / 2) + ',' + y1 + ' ' + (cx - wBottom / 2) + ',' + y1;
        kit.svg('polygon', { points: pts }, cp);
        kit.svg('polygon', { 'class': 'lyd-glass__bg', points: pts }, svg);                          /* 杯子裡淡淡的玻璃色（畫在液體後面，才不會把液體的顏色蓋淡） */
        var liquid = kit.svg('g', { 'clip-path': 'url(#' + id + ')' }, svg);
        kit.svg('polygon', { 'class': 'lyd-glass__edge', points: pts }, svg);
        kit.svg('rect', { 'class': 'lyd-glass__foot', x: cx - 30, y: y1 + 3, width: 60, height: 8, rx: 4 }, svg);
        function Y(f) { return y1 - GLASS_H * f; }
        return {
            svg: svg,
            setLayers: function (bounds, colors, cur) {
                liquid.innerHTML = '';
                var prev = 0, list = bounds.map(function (b, i) { return { top: b, color: colors[i] }; });
                if (cur) list.push(cur);
                list.forEach(function (L, i) {
                    var yT = Y(L.top), yB = Y(prev);
                    var r = kit.svg('rect', { 'class': 'lyd-layer lyd-c--' + COLORS[L.color].id, x: 0, y: yT, width: W, height: Math.max(0, yB - yT) }, liquid);
                    prev = L.top;
                });
                /* 層與層之間一小段漸層（下面那層的顏色慢慢變成上面那層的顏色） */
                for (var i = 0; i < list.length - 1; i++) {
                    var b = list[i].top, gy = Y(b + BLEND), gh = GLASS_H * 2 * BLEND, gidn = 'lyd-gr-' + (++gid), g = kit.svg('linearGradient', { id: gidn, x1: 0, y1: 0, x2: 0, y2: 1 }, liquid);
                    kit.svg('stop', { offset: '0%', 'class': 'lyd-stop lyd-stop--' + COLORS[list[i + 1].color].id }, g); kit.svg('stop', { offset: '100%', 'class': 'lyd-stop lyd-stop--' + COLORS[list[i].color].id }, g);
                    kit.svg('rect', { x: 0, y: gy, width: W, height: gh, fill: 'url(#' + gidn + ')' }, liquid);
                }
            }
        };
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n;
        api.info = q;
        var holds = perfectHolds(q);
        console.log('[照樣調一杯] 第 ' + level + ' 關：' + n + ' 層 ' + q.colors.map(function (c, i) { return COLORS[c].name + (q.fracs[i] * 100).toFixed(1) + '%'; }).join('、') + '（下到上）；杯底/杯口 ' + q.ratio + '；倒滿要 ' + q.fillS + ' 秒；容許最大差 ' + q.tol + '%；完美倒法每層按 ' + holds.map(function (t) { return t.toFixed(2); }).join('／') + ' 秒');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'lyd-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note lyd-tip', text: '記住每一層的顏色和高度' });
        field.appendChild(tip);
        /* 左：示範杯（直筒）；右：你的杯子（上寬下窄） */
        var demoBox = h('div', { 'class': 'lyd-box' }), myBox = h('div', { 'class': 'lyd-box' });
        demoBox.style.cssText = 'left:' + (W / 2 - 190) + 'px;top:62px;'; myBox.style.cssText = 'left:' + (W / 2 + 20) + 'px;top:62px;';
        field.appendChild(demoBox); field.appendChild(myBox);
        demoBox.appendChild(h('div', { 'class': 'lyd-cap', text: '示範杯' })); myBox.appendChild(h('div', { 'class': 'lyd-cap', text: '你的杯子' }));
        var demo = glass(demoBox, DEMO_W, DEMO_W), mine = glass(myBox, TOP_W, TOP_W * q.ratio);
        var cum = 0, demoBounds = q.fracs.map(function (f) { cum += f; return Math.min(1, cum); });
        demo.setLayers(demoBounds, q.colors);
        var stream = h('div', { 'class': 'lyd-stream' }); myBox.appendChild(stream);
        var info = h('div', { 'class': 'qz-note lyd-info', text: '' });
        info.style.top = (62 + GLASS_H + 70) + 'px';
        field.appendChild(info);
        /* 瓶子：五種顏色 */
        var bottles = h('div', { 'class': 'lyd-bottles' }), bEls = [];
        COLORS.forEach(function (c, i) { var b = h('div', { 'class': 'lyd-bottle lyd-c--' + c.id }, [h('div', { 'class': 'lyd-bottle__neck' }), h('div', { 'class': 'lyd-bottle__body', text: c.name })]); bottles.appendChild(b); bEls.push(b); });
        field.appendChild(bottles);

        var phase = 'view', step = 0, bounds = [], v = 0, y = 0, pouring = -1, done = false, ctl = [], loop = null;
        info.textContent = '看 ' + Math.round(q.viewMs / 1000) + ' 秒';
        api.timer(q.viewMs, begin);
        function begin() {
            if (api.over) return;
            phase = 'pour'; demoBox.classList.add('lyd-box--hide'); tip.textContent = '照順序倒：按住瓶子倒、放手停'; info.textContent = '第 1 層：' + COLORS[q.colors[0]].name + '色';
            mine.setLayers([], [], null);
            api.timer(20000 + n * 6000, function () { finish(true); });
            if (level === 1 && kit.once('layerdrink.hint')) kit.hintOn(stage, bEls[q.colors[0]], { mode: 'hold', delay: 500, text: '按住倒，到記得的高度放手' });
        }
        /* 每個瓶子：按住開始倒（要是這一層該用的顏色，不然馬上結束）、放手結束這一層 */
        bEls.forEach(function (el, ci) {
            ctl[ci] = kit.hold(el, {
                down: function () {
                    if (phase !== 'pour' || done || api.over || pouring >= 0) return;
                    if (ci !== q.colors[step]) { wrongColor(ci); return; }
                    pouring = ci; el.classList.add('lyd-bottle--pour'); stream.className = 'lyd-stream lyd-stream--on lyd-c--' + COLORS[ci].id; Sfx.play('click');
                    loop = api.my.loop(frame);
                },
                up: function () { if (pouring === ci) endLayer(); }
            });
        });
        function frame(now, dt) {
            if (pouring < 0 || done) return false;
            v += q.rate * Math.min(dt, 50) / 1000; y = heightAt(v, q.ratio);
            mine.setLayers(bounds, q.colors, { top: y, color: q.colors[step] });
            if (y >= 1) { y = 1; endLayer(); return false; }
        }
        function endLayer() {
            if (pouring < 0) return;
            bEls[pouring].classList.remove('lyd-bottle--pour'); stream.className = 'lyd-stream'; pouring = -1; if (loop) loop.stop();
            bounds.push(y); mine.setLayers(bounds, q.colors, null); step++;
            if (step >= n || y >= 1) { finish(false); return; }
            info.textContent = '第 ' + (step + 1) + ' 層：' + COLORS[q.colors[step]].name + '色';
        }
        function wrongColor(ci) {
            done = true; phase = 'end'; api.stopTimer();
            ctl.forEach(function (c) { c.destroy(); });
            info.textContent = '第 ' + (step + 1) + ' 層要倒「' + COLORS[q.colors[step]].name + '」，你按了「' + COLORS[ci].name + '」';
            demoBox.classList.remove('lyd-box--hide'); bEls[q.colors[step]].classList.add('lyd-bottle--ok'); bEls[ci].classList.add('lyd-bottle--bad');
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3200, lines: ['第 ' + (step + 1) + ' 層顏色錯了：要倒「' + COLORS[q.colors[step]].name + '」，你按了「' + COLORS[ci].name + '」', '顏色順序（下到上）：' + q.colors.map(function (c) { return COLORS[c].name; }).join('、')] });
        }
        function finish(timeout) {
            if (done || api.over) return;
            done = true; phase = 'end'; api.stopTimer();
            if (pouring >= 0) { bEls[pouring].classList.remove('lyd-bottle--pour'); stream.className = 'lyd-stream'; pouring = -1; if (loop) loop.stop(); bounds.push(y); }
            ctl.forEach(function (c) { c.destroy(); });
            /* 沒倒完的層厚度算 0；最後一層以外都有放手的高度 */
            var thick = thicknesses(bounds), md = maxDiff(q.fracs, thick), ok = !timeout && md <= q.tol;
            mine.setLayers(bounds, q.colors, null); demoBox.classList.remove('lyd-box--hide');
            tip.textContent = '兩杯並排比一比';
            info.textContent = '最大差 ' + md.toFixed(4) + '%' + (ok ? '，一樣了！' : '（要在 ' + q.tol + '% 內）');
            kit.flash(stage, ok, api.my);
            if (ok) { api.pass({ delay: 2000 }); return; }
            var worst = 0; q.fracs.forEach(function (f, i) { if (Math.abs(f - (thick[i] || 0)) > Math.abs(q.fracs[worst] - (thick[worst] || 0))) worst = i; });
            api.fail({ delay: 3200, lines: ['最大差 ' + md.toFixed(4) + '%（要在 ' + q.tol + '% 內）', '差最多的是第 ' + (worst + 1) + ' 層（' + COLORS[q.colors[worst]].name + '）：示範 ' + (q.fracs[worst] * 100).toFixed(4) + '%、你倒了 ' + ((thick[worst] || 0) * 100).toFixed(4) + '%'] });
        }
        /* 驗證用：solve＝依完美倒法算出每層的累計高度，直接放進去結算；wrong＝第一層倒到一半就結束 */
        api.solve = function () {
            if (phase !== 'pour' || done) return;
            bounds = demoBounds.slice(); step = n; y = bounds[n - 1]; finish(false);
        };
        api.wrong = function () {
            if (phase !== 'pour' || done) return;
            bounds = [Math.min(1, q.fracs[0] * 0.5)]; y = bounds[0]; step = 1; finish(false);
        };
    }

    var G = {
        id: ID,
        name: '照樣調一杯',
        rule: '吧台先展示一杯分層的漸層飲料（各層顏色不同、高度也不同），幾秒後收走。**照記憶一層一層調出一樣的**：**按住那個顏色的瓶子倒、放手停**，再換下一個顏色，由下往上、顏色順序要對（按錯瓶子就結束）。倒完兩杯並排，告訴你每一層最大差幾 %，在容許範圍內才過關。小心：**你的杯子上寬下窄**，所以**越倒到上面，液面升得越慢**，要看著液面一邊估一邊放手！越後面，層數越多、杯子越像漏斗、容許的誤差越小！',
        mount: mount,
        score: SCORE,
        test: {
            layersFor: layersFor, viewMs: viewMs, tolFor: tolFor, ratioFor: ratioFor, fillS: fillS, volumeAt: volumeAt, heightAt: heightAt, flowRate: flowRate, maxDiff: maxDiff, thicknesses: thicknesses, splitLayers: splitLayers, makeLevel: makeLevel, perfectHolds: perfectHolds, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, LAYERS: LAYERS, VIEW_S: VIEW_S, TOL: TOL, RATIO: RATIO, FILL_S: FILL_S, MIN_FRAC: MIN_FRAC, GLASS_H: GLASS_H, BLEND: BLEND, COLORS: COLORS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
