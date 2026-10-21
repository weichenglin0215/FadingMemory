/* ═══════════════════════════════════════════════════════════════════
   reaction_oddsock.js — 秒反應・落單的襪子
   3×3 九宮格，九隻襪子裡有四對圖案相同、只有一隻沒有伴，點出那隻落單的。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   這是注重直覺反應與點擊速度的遊戲：玩家看到的是明顯的差異，不靠細微的色差。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見）：
       - 刪除「底色色相差」這個參數：不再靠些微的色彩差異出題；
       - 襪子底色固定是七個彩虹顏色（RAINBOW：紅橙黃綠藍靛紫）：第 1～5 關全部襪子用 3 種底色、第 6～10 關只剩 2 種、
         第 11 關起全部只剩 1 種底色（底色種類越少，越要靠花紋分辨，難度越高）；落單襪子的底色一定跟其中一對相同；
       - 每一隻襪子都旋轉成不同的角度（九隻各差至少 ROT_GAP 度），更難辨識；
       - 襪子的形狀改成「L 形」（腿直直的、腳朝右邊伸出去），不再像倒 T。
   · 襪子圖案由參數組成：底色（彩虹七色之一）、腿上橫條紋數、腳上圓點數（腳跟與腳尖的補丁色是底色的對色）。
   · 先產生 4 組互不相同的圖案（花紋 stripes×dots 各不相同），各做一對（8 隻），
     再從其中一組「只改一個花紋參數」做成落單的那隻（條紋數或圓點數差 COUNT_DELTA 3→1，線性）。
   · 九隻位置隨機打亂，位置抖動 ±6px。
   · 限時 TIME_S：V1.34 玩家意見「越後面的關卡要加長秒數」——越後面的關卡底色越少（3 種 → 1 種）、花紋差越小（差 3 → 差 1），越難看出來，
     所以時間反過來「越後面越長」：第 1 關 10 秒 → 第 RAMP_LEVELS 關 30 秒（線性），之後維持。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'oddsock';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;
    var COUNT_DELTA = [3, 1];                   /* 落單襪子和它最像的那一對，條紋數／圓點數差 */
    var TIME_S = [10, 30];                     /* 每關限時（秒）：第 1 關 → 到頂關卡。V1.34 玩家意見：越後面的關卡秒數要加長（原本 15 → 4 越後面越短，現在 10 → 30 越後面越長） */
    var MAX_COUNT = 8;                          /* 條紋、圓點最多幾個 */
    var CELL = 140, GAP = 14;                   /* 格子大小與間距（px） */
    var COLOR_STEPS = [{ from: 1, n: 3 }, { from: 6, n: 2 }, { from: 11, n: 1 }];   /* 從第幾關起，全部襪子共用幾種底色 */
    var ROT_GAP = 16;                           /* 九隻襪子的旋轉角度，彼此至少差幾度 */
    /* 彩虹七色：[名稱, 色相, 彩度%, 明度%]（黃色亮一點、藍紫色暗一點，看起來才像那個顏色） */
    var RAINBOW = [['紅', 0, 72, 52], ['橙', 28, 88, 54], ['黃', 50, 90, 54], ['綠', 125, 52, 42], ['藍', 205, 72, 50], ['靛', 240, 52, 48], ['紫', 280, 55, 50]];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function countDelta(level) { return Math.round(kit.ramp(level, COUNT_DELTA[0], COUNT_DELTA[1], RAMP_LEVELS)); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 第 level 關，全部襪子共用幾種底色：1～5 關 3 種、6～10 關 2 種、11 關起 1 種 */
    function colorCountAt(level) { var n = COLOR_STEPS[0].n; COLOR_STEPS.forEach(function (s) { if (level >= s.from) n = s.n; }); return n; }
    function key(p) { return p.ci + '/' + p.stripes + '/' + p.dots; }
    /* 九隻襪子的旋轉角度：把 360 度分成 9 份，每份挑一個角度（±jitter），再打亂順序，所以任兩隻至少差 ROT_GAP 度 */
    function makeRotations(rand, n) {
        n = n || 9;
        var slot = 360 / n, jit = (slot - ROT_GAP) / 2 - 0.5, base = rand() * 360, out = [];
        for (var i = 0; i < n; i++) out.push(((base + i * slot + kit.randFloat(-jit, jit, rand)) % 360 + 360) % 360);
        return kit.shuffle(out, rand);
    }
    /* 兩個角度（度）的最小差距 */
    function angDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
    /* 出題：回傳 { socks: [9 個 {ci（彩虹色索引）, stripes, dots, rot, dx, dy}]（已洗牌）, odd: 落單那隻的索引, mate: 它最像的那一對的圖案, what: 改了哪個參數, colors: 這一關用到的底色索引 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var nColor = colorCountAt(level), colors = kit.shuffle([0, 1, 2, 3, 4, 5, 6], rand).slice(0, nColor);
        for (var tries = 0; tries < 200; tries++) {
            /* 四組花紋互不相同；底色：先每種底色至少用一次，其餘隨機 */
            var pats = [], used = {}, k, p;
            while (pats.length < 4) {
                p = { stripes: kit.randInt(0, 5, rand), dots: kit.randInt(0, 5, rand) };
                var pk = p.stripes + '/' + p.dots;
                if (!used[pk]) { used[pk] = true; pats.push(p); }
            }
            var cols = colors.slice(); while (cols.length < 4) cols.push(kit.pick(colors, rand));
            cols = kit.shuffle(cols, rand).slice(0, 4);
            pats.forEach(function (pp, i) { pp.ci = cols[i]; });
            var j = kit.randInt(0, 3, rand), base = pats[j], what = kit.pick(['stripes', 'dots'], rand);
            var oddP = { ci: base.ci, stripes: base.stripes, dots: base.dots }, sign = rand() < 0.5 ? 1 : -1, d = countDelta(level), cur = base[what], v = cur + sign * d;
            if (v < 0 || v > MAX_COUNT) v = cur - sign * d;
            oddP[what] = v;
            if (pats.some(function (pp) { return key(pp) === key(oddP); })) continue;      /* 落單的不能剛好跟另一組一樣（不然就有伴了） */
            var socks = [];
            pats.forEach(function (pp) { socks.push(pp, pp); });
            socks.push(oddP);
            var rots = makeRotations(rand, 9);
            socks = socks.map(function (pp, i) { return { ci: pp.ci, stripes: pp.stripes, dots: pp.dots, isOdd: i === 8, rot: rots[i], dx: kit.randFloat(-6, 6, rand), dy: kit.randFloat(-6, 6, rand) }; });
            socks = kit.shuffle(socks, rand);
            return { socks: socks, odd: socks.findIndex(function (s) { return s.isOdd; }), mate: base, what: what, colors: colors };
        }
        return null;
    }
    var WHAT_NAME = { stripes: '條紋數', dots: '圓點數' };
    /* 襪子 SVG（100×130）：L 形的襪子——腿直直的（左邊）、腳朝右邊伸出去，條紋畫在腿上、圓點畫在腳上；每個 SVG 的 clipPath id 要不一樣 */
    var LEG = { x: 16, y: 6, w: 40, h: 98 }, FOOT = { x: 16, y: 72, w: 78, h: 46 };
    function sockSvg(p, uid) {
        var rb = RAINBOW[p.ci], hue = rb[1];
        var base = 'hsl(' + hue + ',' + rb[2] + '%,' + rb[3] + '%)', light = 'hsl(' + hue + ',78%,88%)', patch = 'hsl(' + ((hue + 180) % 360) + ',55%,40%)';
        var legR = '<rect x="' + LEG.x + '" y="' + LEG.y + '" width="' + LEG.w + '" height="' + LEG.h + '" rx="8"', footR = '<rect x="' + FOOT.x + '" y="' + FOOT.y + '" width="' + FOOT.w + '" height="' + FOOT.h + '" rx="23"';
        var clip = '<clipPath id="sk' + uid + '">' + legR + '/>' + footR + '/></clipPath>';
        var body = '<g clip-path="url(#sk' + uid + ')"><rect x="0" y="0" width="100" height="130" fill="' + base + '"/>';
        var i;
        for (i = 0; i < p.stripes; i++) body += '<rect x="0" y="' + (14 + i * 7) + '" width="100" height="3.6" fill="' + light + '"/>';
        var spots = [[42, 90], [56, 104], [70, 90], [84, 104], [56, 80], [76, 80], [90, 90], [38, 106]];
        for (i = 0; i < p.dots && i < spots.length; i++) body += '<circle cx="' + spots[i][0] + '" cy="' + spots[i][1] + '" r="3.6" fill="' + light + '"/>';
        body += '<circle cx="30" cy="100" r="12" fill="' + patch + '"/><circle cx="84" cy="96" r="12" fill="' + patch + '"/></g>';
        var outline = legR + ' fill="none" stroke="#4A3B1E" stroke-width="3"/>' + footR + ' fill="none" stroke="#4A3B1E" stroke-width="3"/>';
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
        console.log('[落單的襪子] 第 ' + level + ' 關：落單在第 ' + (q.odd + 1) + ' 格（改了' + WHAT_NAME[q.what] + '，差 ' + countDelta(level) + '）；底色 ' + q.colors.map(function (c) { return RAINBOW[c][0]; }).join('、') + '；限時 ' + timeMs(level) + ' ms；九隻 ' + q.socks.map(key).join(' | '));

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
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「落單的那一隻」上（第一關的正確答案） */
        if (level === 1 && kit.once('oddsock.hint')) hint = kit.hintOn(stage, cells[q.odd], { mode: 'tap', text: '請點擊沒有伴的襪子' });
        api.timer(timeMs(level), function () { judge(-1); });

        function judge(i) {
            if (api.over) return;
            var odd = q.odd;
            cells[odd].classList.add('os-cell--odd');
            q.socks.forEach(function (s, k) { if (k !== odd && key(s) === key(q.mate)) cells[k].classList.add('os-cell--mate'); });
            if (i === odd) { api.pass({ delay: 800 }); return; }
            if (i >= 0) cells[i].classList.add('os-cell--bad');
            api.fail({
                delay: 2000, lines: [
                    (i < 0 ? '時間到！' : '選錯了！') + '落單的是第 ' + (Math.floor(odd / 3) + 1) + ' 列第 ' + (odd % 3 + 1) + ' 隻',
                    '它和最像的那一對只差' + WHAT_NAME[q.what] + '：差 ' + countDelta(level) + ' 個'
                ]
            });
        }
        api.solve = function () { judge(q.odd); };
        api.wrong = function () { judge(q.odd === 0 ? 1 : 0); };
    }

    var G = {
        id: ID,
        name: '落單的襪子',
        rule: '九隻襪子排成九宮格，其中有四對圖案一模一樣，只有一隻沒有伴。**找出那隻落單的襪子**，點下去。襪子的底色只有彩虹七色，**每一隻都轉成不同的角度**。每關有時間限制，答錯或來不及就結束。越後面，**底色種類越少**，要靠條紋和圓點來分辨！',
        mount: mount,
        score: SCORE,
        test: { countDelta: countDelta, timeMs: timeMs, colorCountAt: colorCountAt, makeRotations: makeRotations, angDiff: angDiff, makeLevel: makeLevel, sockSvg: sockSvg, key: key, rating: rating, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, TIME_S: TIME_S, COUNT_DELTA: COUNT_DELTA, MAX_COUNT: MAX_COUNT, ROT_GAP: ROT_GAP, RAINBOW: RAINBOW, COLOR_STEPS: COLOR_STEPS }
    };
    Reaction.register(G);
})();
