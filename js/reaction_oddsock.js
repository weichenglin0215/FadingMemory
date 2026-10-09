/* ═══════════════════════════════════════════════════════════════════
   reaction_oddsock.js — 秒反應・落單的襪子
   3×3 九宮格，九隻襪子裡有四對圖案相同、只有一隻沒有伴，點出那隻落單的。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 襪子圖案由參數組成：底色色相、腿上橫條紋數、腳上圓點數（腳跟與腳尖的補丁色是底色的對色）。
   · 先產生 4 組互不相同的圖案（底色色相相隔約 90°），各做一對（8 隻），
     再從其中一組「只改一個參數」做成落單的那隻；改多少由關卡決定：
     色相差 HUE_DELTA 100°→15°、條紋或圓點數差 COUNT_DELTA 3→1（線性）。
   · 九隻位置隨機打亂，每隻輕微旋轉 ±6°、位置抖動 ±6px。
   · 限時 TIME_S 30→10 秒（線性）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'oddsock';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 40;
    var HUE_DELTA = [100, 15];                  /* 落單襪子和它最像的那一對，底色色相差（度） */
    var COUNT_DELTA = [3, 1];                   /* 條紋數／圓點數差 */
    var TIME_S = [30, 10];                      /* 每關限時（秒） */
    var MAX_COUNT = 8;                          /* 條紋、圓點最多幾個 */
    var CELL = 140, GAP = 14;                   /* 格子大小與間距（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function hueDelta(level) { return kit.ramp(level, HUE_DELTA[0], HUE_DELTA[1], RAMP_LEVELS); }
    function countDelta(level) { return Math.round(kit.ramp(level, COUNT_DELTA[0], COUNT_DELTA[1], RAMP_LEVELS)); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function key(p) { return Math.round(p.hue) + '/' + p.stripes + '/' + p.dots; }
    /* 出題：回傳 { socks: [9 個 {hue, stripes, dots, rot, dx, dy}]（已洗牌）, odd: 落單那隻的索引, mate: 它最像的那一對的圖案, what: 改了哪個參數 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var h0 = rand() * 360, pats = [], k;
        for (k = 0; k < 4; k++) {
            pats.push({ hue: (h0 + k * 90 + kit.randFloat(-12, 12, rand) + 360) % 360, stripes: kit.randInt(0, 5, rand), dots: kit.randInt(0, 5, rand) });
        }
        var j = kit.randInt(0, 3, rand), base = pats[j], what = kit.pick(['hue', 'stripes', 'dots'], rand);
        var oddP = { hue: base.hue, stripes: base.stripes, dots: base.dots };
        var sign = rand() < 0.5 ? 1 : -1;
        if (what === 'hue') oddP.hue = (base.hue + sign * hueDelta(level) + 360) % 360;
        else {
            var d = countDelta(level), cur = base[what], v = cur + sign * d;
            if (v < 0 || v > MAX_COUNT) v = cur - sign * d;
            oddP[what] = v;
        }
        var socks = [];
        pats.forEach(function (p) { socks.push(p, p); });
        socks.push(oddP);
        socks = socks.map(function (p, i) { return { hue: p.hue, stripes: p.stripes, dots: p.dots, isOdd: i === 8, rot: kit.randFloat(-6, 6, rand), dx: kit.randFloat(-6, 6, rand), dy: kit.randFloat(-6, 6, rand) }; });
        socks = kit.shuffle(socks, rand);
        return { socks: socks, odd: socks.findIndex(function (s) { return s.isOdd; }), mate: base, what: what };
    }
    var WHAT_NAME = { hue: '底色', stripes: '條紋數', dots: '圓點數' };
    /* 襪子 SVG（100×130）：腿＋腳的剪影，條紋畫在腿上、圓點畫在腳上；每個 SVG 的 clipPath id 要不一樣 */
    function sockSvg(p, uid) {
        var base = 'hsl(' + p.hue.toFixed(1) + ',62%,56%)', light = 'hsl(' + p.hue.toFixed(1) + ',70%,86%)', patch = 'hsl(' + ((p.hue + 180) % 360).toFixed(1) + ',55%,42%)';
        var clip = '<clipPath id="sk' + uid + '"><rect x="30" y="6" width="40" height="84" rx="8"/><rect x="12" y="70" width="80" height="46" rx="23"/></clipPath>';
        var body = '<g clip-path="url(#sk' + uid + ')"><rect x="0" y="0" width="100" height="130" fill="' + base + '"/>';
        var i;
        for (i = 0; i < p.stripes; i++) body += '<rect x="0" y="' + (14 + i * 7) + '" width="100" height="3.6" fill="' + light + '"/>';
        var spots = [[26, 86], [40, 100], [54, 86], [68, 100], [40, 74], [60, 74], [76, 86], [24, 104]];
        for (i = 0; i < p.dots && i < spots.length; i++) body += '<circle cx="' + spots[i][0] + '" cy="' + spots[i][1] + '" r="3.6" fill="' + light + '"/>';
        body += '<circle cx="25" cy="98" r="11" fill="' + patch + '"/><circle cx="82" cy="100" r="12" fill="' + patch + '"/></g>';
        var outline = '<rect x="30" y="6" width="40" height="84" rx="8" fill="none" stroke="#4A3B1E" stroke-width="3"/><rect x="12" y="70" width="80" height="46" rx="23" fill="none" stroke="#4A3B1E" stroke-width="3"/>';
        return '<svg viewBox="0 0 100 130" width="120" height="156" xmlns="http://www.w3.org/2000/svg"><defs>' + clip + '</defs>' + body + outline + '</svg>';
    }
    function rating(n) {
        if (n >= 25) return '襪子之神！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多看幾次，花紋就分得出來了！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[落單的襪子] 第 ' + level + ' 關：落單在第 ' + (q.odd + 1) + ' 格（改了' + WHAT_NAME[q.what] + '；色相差 ' + hueDelta(level).toFixed(1) + '°、數量差 ' + countDelta(level) + '）；限時 ' + timeMs(level) + ' ms；九隻 ' + q.socks.map(key).join(' | '));

        var W = stage.clientWidth || 472, x0 = Math.round((W - (3 * CELL + 2 * GAP)) / 2), y0 = 6;
        var tip = h('div', { 'class': 'os-tip', text: '九隻襪子裡有四對相同，找出沒有伴的那一隻' });
        stage.appendChild(tip);
        var cells = q.socks.map(function (s, i) {
            var el = h('div', { 'class': 'os-cell', html: sockSvg(s, level + '_' + i) });
            el.style.left = (x0 + (i % 3) * (CELL + GAP)) + 'px'; el.style.top = (y0 + 66 + Math.floor(i / 3) * (CELL + GAP)) + 'px';
            el.firstChild.style.transform = 'translate(' + s.dx.toFixed(1) + 'px,' + s.dy.toFixed(1) + 'px) rotate(' + s.rot.toFixed(1) + 'deg)';
            kit.onTap(el, function () { judge(i); });
            stage.appendChild(el);
            return el;
        });
        var hint = null;
        if (level === 1) {
            hint = kit.fingerHint(stage, { mode: 'tap', x: x0 + CELL + GAP + CELL / 2 + 10, y: y0 + 66 + CELL + GAP + CELL / 2 + 10, delay: 400 });
            stage.addEventListener('pointerdown', function () { if (hint) { hint.remove(); hint = null; } }, { once: true });
        }
        api.timer(timeMs(level), function () { judge(-1); });

        function judge(i) {
            if (api.over) return;
            var odd = q.odd;
            cells[odd].classList.add('os-cell--odd');
            q.socks.forEach(function (s, k) { if (k !== odd && key(s) === key(q.mate) && s.hue === q.mate.hue) cells[k].classList.add('os-cell--mate'); });
            if (i === odd) { api.pass({ delay: 800 }); return; }
            if (i >= 0) cells[i].classList.add('os-cell--bad');
            api.fail({ delay: 2000, lines: [
                (i < 0 ? '時間到！' : '選錯了！') + '落單的是第 ' + (Math.floor(odd / 3) + 1) + ' 列第 ' + (odd % 3 + 1) + ' 隻',
                '它和最像的那一對只差' + WHAT_NAME[q.what] + '：' + (q.what === 'hue' ? '色相差 ' + hueDelta(level).toFixed(4) + ' 度' : '差 ' + countDelta(level) + ' 個')
            ] });
        }
        api.solve = function () { judge(q.odd); };
        api.wrong = function () { judge(q.odd === 0 ? 1 : 0); };
    }

    var G = {
        id: ID,
        name: '落單的襪子',
        rule: '九隻襪子排成九宮格，其中有四對圖案一模一樣，只有一隻沒有伴。找出那隻落單的襪子，點下去。每關有時間限制，答錯或來不及就結束。越後面，落單的襪子和它最像的那一對差得越少！',
        mount: mount,
        score: SCORE,
        test: { hueDelta: hueDelta, countDelta: countDelta, timeMs: timeMs, makeLevel: makeLevel, sockSvg: sockSvg, key: key, rating: rating, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, HUE_DELTA: HUE_DELTA, COUNT_DELTA: COUNT_DELTA, MAX_COUNT: MAX_COUNT }
    };
    Reaction.register(G);
})();
