/* ═══════════════════════════════════════════════════════════════════
   reaction_twinsock.js — 秒反應・找出雙胞胎襪子（原企劃「057 找出雙胞胎襪子」的復活版）
   一格一格的襪子，左上角那隻是「目標」（不會轉動，格子底色跟別人不一樣）；
   其餘的襪子都在慢慢轉動，其中恰好有一隻跟目標「一模一樣」（底色、條紋數、圓點數都相同），點出它。
   關卡制：答錯或逾時就結束，成績＝過了幾關。
   ───────────────────────────────────────────────────────────────────
   · 格數（寬×高）：第 1 關 2×3，之後 2×4、3×4、3×5、4×5，第 6 關起固定 4×6（最後的難度）。
   · 其他襪子（假的）跟目標只差「一個參數」：底色色相、腿上的條紋數、腳上的圓點數，三擇一，差多少隨關卡線性縮小
     （色相差 HUE_DELTA 90°→18°、條紋／圓點數差 COUNT_DELTA 3→1）。真的雙胞胎三個參數全部相同。
   · 轉速：SPIN 從 10°／秒（很慢）線性加快到 110°／秒；每隻轉的方向與初始角度隨機。
   · 限時：TIME_S 30 秒 → 12 秒（線性）。
   · 轉動用 CSS 動畫（animation），不靠 JS 每影格更新，所以很順、也不會因為分頁暫停而亂掉。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'twinsock';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 40 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 40;
    var SIZES = [[2, 3], [2, 4], [3, 4], [3, 5], [4, 5], [4, 6]];     /* 第 1～6 關的格數（寬×高），之後維持最後一個 */
    var HUE_DELTA = [90, 18];                   /* 假襪子跟目標的底色色相差（度） */
    var COUNT_DELTA = [3, 1];                   /* 條紋數／圓點數差 */
    var SPIN = [10, 110];                       /* 轉速（度／秒） */
    var TIME_S = [30, 12];                      /* 每關限時（秒） */
    var MAX_COUNT = 6;                          /* 條紋、圓點最多幾個 */
    var GAP = 10;                               /* 格子間距（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeAt(level) { return SIZES[Math.min(SIZES.length, level) - 1]; }
    function hueDelta(level) { return kit.ramp(level, HUE_DELTA[0], HUE_DELTA[1], RAMP_LEVELS); }
    function countDelta(level) { return Math.round(kit.ramp(level, COUNT_DELTA[0], COUNT_DELTA[1], RAMP_LEVELS)); }
    function spinAt(level) { return kit.ramp(level, SPIN[0], SPIN[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function key(p) { return Math.round(p.hue) + '/' + p.stripes + '/' + p.dots; }
    function same(a, b) { return Math.round(a.hue) === Math.round(b.hue) && a.stripes === b.stripes && a.dots === b.dots; }
    /* 一隻「只改一個參數」的假襪子：改色相／條紋數／圓點數三擇一，改的量由關卡決定，而且一定跟目標不一樣 */
    function variant(target, level, rand) {
        var what = kit.pick(['hue', 'stripes', 'dots'], rand), p = { hue: target.hue, stripes: target.stripes, dots: target.dots }, sign = rand() < 0.5 ? 1 : -1;
        if (what === 'hue') p.hue = (target.hue + sign * hueDelta(level) * kit.randFloat(1, 1.35, rand) + 360) % 360;
        else {
            var d = Math.max(1, countDelta(level)), v = target[what] + sign * d;
            if (v < 0 || v > MAX_COUNT) v = target[what] - sign * d;
            p[what] = v;
        }
        return p;
    }
    /* 出題：回傳 { cols, rows, socks:[{hue,stripes,dots, spin（度／秒，含方向）, delay（秒，負數＝一開始轉到哪）}], twin（雙胞胎的格子編號，1 起）, target } ；socks[0] 是目標 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var sz = sizeAt(level), n = sz[0] * sz[1];
        var target = { hue: kit.randFloat(0, 360, rand), stripes: kit.randInt(0, MAX_COUNT, rand), dots: kit.randInt(0, MAX_COUNT, rand) };
        var twin = kit.randInt(1, n - 1, rand), socks = [];
        for (var i = 0; i < n; i++) {
            var p = i === 0 || i === twin ? { hue: target.hue, stripes: target.stripes, dots: target.dots } : variant(target, level, rand);
            var sp = spinAt(level) * kit.randFloat(0.75, 1.25, rand), dur = 360 / sp;
            p.spin = i === 0 ? 0 : (rand() < 0.5 ? 1 : -1) * sp;
            p.dur = i === 0 ? 0 : dur;
            p.delay = i === 0 ? 0 : -kit.randFloat(0, dur, rand);
            socks.push(p);
        }
        return { cols: sz[0], rows: sz[1], socks: socks, twin: twin, target: target };
    }
    /* 襪子 SVG（100×130）：腿＋腳的剪影，條紋畫在腿上、圓點畫在腳上；每個 SVG 的 clipPath id 要不一樣 */
    function sockSvg(p, uid) {
        var base = 'hsl(' + p.hue.toFixed(1) + ',62%,56%)', light = 'hsl(' + p.hue.toFixed(1) + ',70%,86%)', patch = 'hsl(' + ((p.hue + 180) % 360).toFixed(1) + ',55%,42%)';
        var clip = '<clipPath id="tw' + uid + '"><rect x="30" y="6" width="40" height="84" rx="8"/><rect x="12" y="70" width="80" height="46" rx="23"/></clipPath>';
        var body = '<g clip-path="url(#tw' + uid + ')"><rect x="0" y="0" width="100" height="130" fill="' + base + '"/>';
        var i;
        for (i = 0; i < p.stripes; i++) body += '<rect x="0" y="' + (14 + i * 7) + '" width="100" height="3.6" fill="' + light + '"/>';
        var spots = [[26, 86], [40, 100], [54, 86], [68, 100], [40, 74], [60, 74], [76, 86], [24, 104]];
        for (i = 0; i < p.dots && i < spots.length; i++) body += '<circle cx="' + spots[i][0] + '" cy="' + spots[i][1] + '" r="3.6" fill="' + light + '"/>';
        body += '<circle cx="25" cy="98" r="11" fill="' + patch + '"/><circle cx="82" cy="100" r="12" fill="' + patch + '"/></g>';
        var outline = '<rect x="30" y="6" width="40" height="84" rx="8" fill="none" stroke="#4A3B1E" stroke-width="3"/><rect x="12" y="70" width="80" height="46" rx="23" fill="none" stroke="#4A3B1E" stroke-width="3"/>';
        return '<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg"><defs>' + clip + '</defs>' + body + outline + '</svg>';
    }
    function rating(n) {
        if (n >= 25) return '襪子之神！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '先看清楚目標的顏色、條紋、圓點，再來找！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            stageClass: 'tw-stage',
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[雙胞胎襪子] 第 ' + level + ' 關：' + q.cols + '×' + q.rows + '；雙胞胎在第 ' + (q.twin + 1) + ' 格；轉速約 ' + spinAt(level).toFixed(1) + '°／秒；色相差 ' + hueDelta(level).toFixed(1) + '°、數量差 ' + countDelta(level) + '；限時 ' + timeMs(level) + ' ms；' + q.socks.map(key).join(' | '));

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var tip = h('div', { 'class': 'tw-tip', text: '找出和左上角（藍底）一樣的襪子' });
        stage.appendChild(tip);
        var TOP = 56, availH = H - TOP;
        var cell = Math.floor(Math.min((W - GAP * (q.cols - 1)) / q.cols, (availH - GAP * (q.rows - 1)) / q.rows));
        var gx = Math.round((W - (q.cols * cell + (q.cols - 1) * GAP)) / 2), gy = TOP + Math.round((availH - (q.rows * cell + (q.rows - 1) * GAP)) / 2);
        var cells = q.socks.map(function (s, i) {
            var el = h('div', { 'class': 'tw-cell' + (i === 0 ? ' tw-cell--target' : '') });
            el.style.width = el.style.height = cell + 'px';
            el.style.left = (gx + (i % q.cols) * (cell + GAP)) + 'px'; el.style.top = (gy + Math.floor(i / q.cols) * (cell + GAP)) + 'px';
            var inner = h('div', { 'class': 'tw-sock', html: sockSvg(s, level + '_' + i) });
            if (i > 0) {
                inner.style.animationDuration = s.dur.toFixed(2) + 's';
                inner.style.animationDelay = s.delay.toFixed(2) + 's';
                inner.style.animationDirection = s.spin < 0 ? 'reverse' : 'normal';
                inner.classList.add('tw-sock--spin');
            }
            el.appendChild(inner);
            if (i > 0) kit.onTap(el, function () { judge(i); });
            stage.appendChild(el);
            return el;
        });
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「和目標一模一樣的那一隻」上（第一關的正確答案） */
        if (level === 1 && kit.once('twinsock.hint')) kit.hintOn(stage, cells[q.twin], { mode: 'tap', delay: 400, text: '請點擊和左上角一樣的襪子' });
        var done = false;
        function judge(i) {
            if (done || api.over) return;
            done = true; api.stopTimer();
            var ok = i === q.twin;
            cells[q.twin].classList.add('tw-cell--ok');
            if (i >= 0 && !ok) cells[i].classList.add('tw-cell--bad');
            if (ok) { api.pass({ gain: 1, delay: 700 }); return; }
            api.fail({ delay: 1500, lines: [i < 0 ? '時間到了' : '點到不一樣的襪子了', '只要底色、條紋數、圓點數有一個不同就不是雙胞胎'] });
        }
        api.timer(timeMs(level), function () { judge(-1); });
        api.solve = function () { judge(q.twin); };
        api.wrong = function () { judge(q.twin === 1 ? 2 : 1); };
    }

    var G = {
        id: ID,
        name: '找出雙胞胎襪子',
        rule: '左上角有一隻不會動的目標襪子（藍色底）。其他襪子都在慢慢轉動，其中只有一隻跟目標「完全一樣」（底色、腿上的條紋數、腳上的圓點數都相同），其他的至少有一處不同。找出它並點下去！格子會從 2×3 一路增加到 4×6，轉得也越來越快，時間有限，答錯就結束。',
        mount: mount,
        score: SCORE,
        test: { sizeAt: sizeAt, hueDelta: hueDelta, countDelta: countDelta, spinAt: spinAt, timeMs: timeMs, variant: variant, makeLevel: makeLevel, same: same, key: key, sockSvg: sockSvg, SIZES: SIZES, MAX_COUNT: MAX_COUNT, SPIN: SPIN }
    };
    Reaction.register(G);
})();
