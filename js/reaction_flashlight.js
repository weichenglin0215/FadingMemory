/* ═══════════════════════════════════════════════════════════════════
   reaction_flashlight.js — 秒反應・手電筒猜圖（企劃 204）
   畫面全黑，手指拖到哪裡，手指「上方」就亮起一個圓形的光圈，黑幕底下藏著一個圖案（數字或符號剪影）。
   用光圈到處掃，猜出藏的是什麼圖案；下面四個選項隨時可以點，選對才過關。
   關卡制：選錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 光圈的中心在手指「上方」OFFSET 像素（光圈不會被手指擋住）；手指放開，光圈就熄掉。
   · 難度線性（RAMP_LEVELS 關走到頂）：光圈半徑 96 → 30 像素（越小，一次看到的越少）；限時 20 → 12 秒。
   · 圖案：第 1～5 關是數字 0～9；第 6～10 關是符號剪影（愛心、星星、月亮、房子、樹、魚、貓、花、鑰匙、杯子、太陽、雨傘、汽車、船）；
     第 11 關起兩種隨機。四個選項裡，數字會挑長得像的（3 配 8、6 配 9…），符號則是隨機挑別的符號。
   · 揭曉：黑幕變透明，整個圖案露出來，並用淡黃色把你掃過的範圍標出來，寫出「掃過了 X.XXXX％」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'flashlight';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var RADIUS = [96, 30];                      /* 光圈半徑（像素）：第 1 關 → 到頂 */
    var TIME_S = [20, 12];                      /* 作答限時（秒）：第 1 關 → 到頂 */
    var OFFSET_GAP = 26;                        /* 光圈下緣離手指多遠（光圈中心在手指上方 半徑＋這個數字 處） */
    var DIGIT_LEVELS = 5, SYMBOL_LEVELS = 10;   /* 第幾關以前只有數字；第幾關以前只有符號（之後兩種都有） */
    var PIC = { size: 280, top: 44 };           /* 圖案的邊長與離遊戲區上緣的距離 */
    var MAX_LEVEL = 60;
    var DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    /* 長得像的數字（選項會優先挑這些） */
    var SIMILAR = { '0': ['6', '8', '9'], '1': ['7', '4', '2'], '2': ['7', '3', '5'], '3': ['8', '5', '2'], '4': ['1', '9', '7'], '5': ['6', '3', '8'], '6': ['5', '8', '0', '9'], '7': ['1', '2', '9'], '8': ['3', '6', '0', '9'], '9': ['4', '8', '0', '6'] };
    var SYMBOLS = ['heart', 'star', 'moon', 'house', 'tree', 'fish', 'cat', 'flower', 'key', 'cup', 'sun', 'umbrella', 'car', 'boat'];
    var NAMES = { heart: '愛心', star: '星星', moon: '月亮', house: '房子', tree: '樹', fish: '魚', cat: '貓', flower: '花', key: '鑰匙', cup: '杯子', sun: '太陽', umbrella: '雨傘', car: '汽車', boat: '船' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function radiusFor(level) { return kit.ramp(level, RADIUS[0], RADIUS[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function isDigit(id) { return DIGITS.indexOf(id) >= 0; }
    /* 這一關可以出哪種圖案 */
    function poolFor(level, rand) {
        if (level <= DIGIT_LEVELS) return DIGITS;
        if (level <= SYMBOL_LEVELS) return SYMBOLS;
        return (rand || Math.random)() < 0.5 ? DIGITS : SYMBOLS;
    }
    /* 出一關：{ target 藏的圖案, options 四個選項（已洗牌）, answer 答案是第幾個選項 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var pool = poolFor(level, rand), target = kit.pick(pool, rand), others;
        if (pool === DIGITS) {
            others = kit.shuffle(SIMILAR[target], rand).slice(0, 3);
            var rest = kit.shuffle(DIGITS.filter(function (d) { return d !== target && others.indexOf(d) < 0; }), rand);
            while (others.length < 3) others.push(rest.shift());
        } else others = kit.sample(SYMBOLS.filter(function (s) { return s !== target; }), 3, rand);
        var options = kit.shuffle([target].concat(others), rand);
        return { target: target, options: options, answer: options.indexOf(target) };
    }
    /* 掃過的範圍：points（光圈中心）、半徑 r，在圖案的方框 box（{x,y,w,h}）裡取 40×40 個取樣點，有幾成被光圈照到？（0～1） */
    function coverage(points, r, box) {
        var N = 40, hit = 0;
        for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
            var x = box.x + (i + 0.5) / N * box.w, y = box.y + (j + 0.5) / N * box.h;
            for (var k = 0; k < points.length; k++) { var dx = x - points[k].x, dy = y - points[k].y; if (dx * dx + dy * dy <= r * r) { hit++; break; } }
        }
        return hit / (N * N);
    }
    /* 圖案的 SVG（畫在 100×100，用 currentColor 上色）；digit 用文字、符號用路徑 */
    function picSvg(id) {
        var body;
        if (isDigit(id)) body = '<text x="50" y="80" text-anchor="middle" font-size="96" font-weight="900" font-family="var(--font-ui)">' + id + '</text>';
        else if (id === 'heart') body = '<path d="M50 88 C8 58 4 26 26 18 C39 13 48 21 50 30 C52 21 61 13 74 18 C96 26 92 58 50 88 Z"/>';
        else if (id === 'star') {
            var pts = [];
            for (var i = 0; i < 10; i++) { var r = i % 2 === 0 ? 46 : 19, a = -Math.PI / 2 + i * Math.PI / 5; pts.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (54 + r * Math.sin(a)).toFixed(1)); }
            body = '<polygon points="' + pts.join(' ') + '"/>';
        } else if (id === 'moon') body = '<path d="M64 10 A42 42 0 1 0 90 66 A34 34 0 1 1 64 10 Z"/>';
        else if (id === 'house') body = '<path fill-rule="evenodd" d="M50 10 L94 50 H82 V90 H18 V50 H6 Z M42 90 V62 H58 V90 Z"/>';
        else if (id === 'tree') body = '<path d="M50 6 L74 40 H62 L84 70 H16 L38 40 H26 Z M44 70 H56 V92 H44 Z"/>';
        else if (id === 'fish') body = '<path fill-rule="evenodd" d="M8 50 C26 20 62 20 80 50 C62 80 26 80 8 50 Z M82 50 L98 34 V66 Z M30 46 a4 4 0 1 0 0.01 0 Z"/>';
        else if (id === 'cat') body = '<path fill-rule="evenodd" d="M16 46 L16 10 L40 28 Q50 25 60 28 L84 10 L84 46 Q92 74 50 90 Q8 74 16 46 Z M33 52 a5 7 0 1 0 0.01 0 Z M67 52 a5 7 0 1 0 0.01 0 Z M46 68 H54 L50 74 Z"/>';
        else if (id === 'flower') {
            body = '<circle cx="50" cy="20" r="16"/><circle cx="74" cy="38" r="16"/><circle cx="65" cy="64" r="16"/><circle cx="35" cy="64" r="16"/><circle cx="26" cy="38" r="16"/><circle cx="50" cy="44" r="14"/>' +
                '<path d="M48 60 H52 V94 H48 Z M52 80 Q74 66 86 78 Q70 92 52 86 Z"/>';
        } else if (id === 'key') body = '<path fill-rule="evenodd" d="M28 14 a22 22 0 1 0 0.01 0 Z M28 28 a8 8 0 1 1 -0.01 0 Z M50 31 H94 V43 H50 Z M78 43 H88 V58 H78 Z M62 43 H70 V54 H62 Z"/>';
        else if (id === 'cup') body = '<path d="M16 26 H70 V60 Q70 86 43 86 Q16 86 16 60 Z M70 36 H80 Q92 36 92 48 Q92 62 80 62 H70 V54 H78 Q82 54 82 48 Q82 44 78 44 H70 Z M8 90 H78 V95 H8 Z"/>';
        else if (id === 'sun') {
            body = '<circle cx="50" cy="50" r="22"/>';
            for (var k = 0; k < 8; k++) body += '<rect x="46" y="4" width="8" height="18" rx="3" transform="rotate(' + (k * 45) + ' 50 50)"/>';
        } else if (id === 'umbrella') body = '<path d="M8 52 A42 42 0 0 1 92 52 Q82 44 71 52 Q60 44 50 52 Q40 44 29 52 Q18 44 8 52 Z M47 52 H53 V80 Q53 92 40 92 Q34 92 34 86 H40 Q47 88 47 80 Z"/>';
        else if (id === 'car') body = '<path fill-rule="evenodd" d="M6 64 V52 Q6 46 12 44 L22 42 L34 26 Q37 22 42 22 H62 Q67 22 70 26 L80 42 L90 46 Q96 48 96 54 V64 Q96 68 92 68 H6 Z M38 30 H50 V42 H30 Z M56 30 H62 L72 42 H56 Z"/><circle cx="28" cy="70" r="12"/><circle cx="76" cy="70" r="12"/>';
        else body = '<path d="M8 64 H92 L78 88 H22 Z M46 8 V58 H16 Z M54 20 V58 H84 Z"/>';       /* boat */
        return '<svg viewBox="0 0 100 100" aria-hidden="true" fill="currentColor">' + body + '</svg>';
    }
    function nameOf(id) { return isDigit(id) ? '數字 ' + id : NAMES[id]; }
    function rating(n) {
        if (n >= 25) return '火眼金睛！';
        if (n >= 15) return '推理高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '光圈掃快一點，抓住特徵，再來一次！';
    }

    var maskSeq = 0;
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6, stageClass: 'flt-stage',
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
        var R = radiusFor(level);
        console.log('[手電筒猜圖] 第 ' + level + ' 關：藏的是 ' + nameOf(q.target) + '，選項 ' + q.options.map(nameOf).join('／') + '；光圈半徑 ' + R.toFixed(2) + '，限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var box = { x: Math.round((W - PIC.size) / 2), y: PIC.top, w: PIC.size, h: PIC.size };
        var mid = 'flt-m' + (++maskSeq);
        var svg = kit.svg('svg', { 'class': 'flt-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        kit.svg('rect', { x: 0, y: 0, width: W, height: H, 'class': 'flt-bg' }, svg);
        var pic = kit.svg('g', { transform: 'translate(' + box.x + ',' + box.y + ') scale(' + (PIC.size / 100) + ')', 'class': 'flt-pic' }, svg);
        pic.innerHTML = picSvg(q.target).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
        var defs = kit.svg('defs', {}, svg), mask = kit.svg('mask', { id: mid }, defs);
        kit.svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, mask);
        var hole = kit.svg('circle', { cx: -999, cy: -999, r: R, fill: '#000' }, mask);
        var cover = kit.svg('rect', { x: 0, y: 0, width: W, height: H, 'class': 'flt-cover', mask: 'url(#' + mid + ')' }, svg);
        var ring = kit.svg('circle', { cx: -999, cy: -999, r: R, 'class': 'flt-ring' }, svg);
        var gScan = kit.svg('g', { 'class': 'flt-scan' }, svg);
        var tip = h('div', { 'class': 'flt-tip', text: '手指在黑幕上拖曳，照出藏著的圖案' });
        stage.appendChild(tip);
        var items = q.options.map(function (id, i) { return { html: picSvg(id), kind: 'line', cls: 'flt-opt', onTap: function () { judge(i); } }; });
        var grid = kit.btnGrid(stage, items, { h: 96, gap: 8 });
        var centers = [], dragging = null, lastC = null;
        function light(pt) {
            var c = { x: pt.x, y: pt.y - (R + OFFSET_GAP) };
            hole.setAttribute('cx', c.x); hole.setAttribute('cy', c.y); ring.setAttribute('cx', c.x); ring.setAttribute('cy', c.y);
            ring.setAttribute('visibility', 'visible');
            /* 記下掃過的位置（每移動超過半徑的 1/3 才記一個，省記憶體） */
            if (!lastC || kit.dist(c.x, c.y, lastC.x, lastC.y) >= R / 3) { centers.push(c); lastC = c; }
        }
        function dark() { hole.setAttribute('cx', -999); ring.setAttribute('visibility', 'hidden'); }
        dark();
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || dragging != null) return;
            if (e.target.closest && e.target.closest('.rx-grid')) return;            /* 按在選項上，不是掃描 */
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            dragging = e.pointerId; light(kit.localPt(e, stage));
        });
        stage.addEventListener('pointermove', function (e) { if (dragging === e.pointerId && !api.over) light(kit.localPt(e, stage)); });
        function end(e) { if (dragging === e.pointerId) { dragging = null; dark(); } }
        stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
        api.timer(timeMs(level), function () { judge(null); });
        if (level === 1 && kit.once('flashlight.hint')) kit.hintOn(stage, null, { mode: 'drag', x: box.x + 40, y: box.y + PIC.size * 0.7, dx: PIC.size - 80, dy: 0, delay: 600, text: '請拖曳手指照亮圖案' });

        function judge(i) {
            if (api.over) return;
            dragging = null; dark();
            var ok = i === q.answer;
            cover.setAttribute('opacity', '0.12');
            centers.forEach(function (c) { kit.svg('circle', { cx: c.x, cy: c.y, r: R }, gScan); });
            var cov = coverage(centers, R, box);
            grid.btns[q.answer].classList.add('flt-opt--right');
            if (i != null && !ok) grid.btns[i].classList.add('flt-opt--wrong');
            tip.textContent = '藏的是「' + nameOf(q.target) + '」，你掃過了 ' + (cov * 100).toFixed(4) + '％ 的範圍';
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1700 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2700, lines: [
                (i == null ? '時間到！' : '選錯了') + '，藏的是「' + nameOf(q.target) + '」',
                '你掃過了圖案範圍的 ' + (cov * 100).toFixed(4) + '％'
            ] });
        }
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge((q.answer + 1) % 4); };
    }

    var G = {
        id: ID,
        name: '手電筒猜圖',
        rule: '畫面全黑，手指拖到哪裡，手指上方就會亮起一圈光，黑幕底下藏著一個圖案。用光圈到處掃，猜出藏的是什麼，點下面四個選項之一。選錯或來不及就結束，看你能過幾關。越後面，光圈越小！',
        mount: mount,
        score: SCORE,
        test: {
            radiusFor: radiusFor, timeMs: timeMs, isDigit: isDigit, poolFor: poolFor, makeLevel: makeLevel, coverage: coverage, picSvg: picSvg, nameOf: nameOf, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, RADIUS: RADIUS, DIGITS: DIGITS, SYMBOLS: SYMBOLS, SIMILAR: SIMILAR, DIGIT_LEVELS: DIGIT_LEVELS, SYMBOL_LEVELS: SYMBOL_LEVELS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
