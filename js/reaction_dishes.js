/* ═══════════════════════════════════════════════════════════════════
   reaction_dishes.js — 秒反應・洗盤子（企劃 386，依使用者的修改：完全洗淨會自動換下一個盤子）
   辦桌之後的洗碗。盤子一個一個送過來，上面有咖啡色的醬汁污漬。**手指在污漬上來回（畫圈）刷，污漬就慢慢淡掉**；
   **整個盤子的污漬都洗掉了，會自動換下一個盤子**（不用按按鈕）。限時 30 秒，成績＝洗了幾個盤子（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · 污漬 vs 花紋：盤子上除了污漬，還有**洗不掉的花紋**（青花紋）。越後面花紋越多、顏色越像醬油（從藍色一路變成咖啡色），刷花紋只是浪費時間。
     分辨方法：**污漬是軟軟的、形狀不規則的一塊一塊；花紋是清楚的規則圖案（花瓣、點、短弧），沿著盤緣排整齊**。
   · 刷的方式（scrub）：手指在畫面上移動，每移動一小段（長度 len），在手指半徑 BRUSH_R 之內的每一塊污漬，剩餘的「髒度」v（1 → 0）就減少 len ÷ need
     （need＝刷掉這塊污漬需要的移動距離，px）。所以來回刷、畫圈刷都可以，刷得越快越有效率。所有污漬的 v ≤ CLEAN_EPS 就算洗乾淨。
   · 難度（線性，依「已經洗了幾個盤子」，到 RAMP_PLATES 個到頂）：污漬數 2 → 6 塊、每塊的大小 52 → 26 px、每塊要刷的距離 300 → 900 px、
     污漬的濃度（看得清楚的程度）1 → 0.5、花紋數 3 → 10 個、花紋和污漬的顏色相似度 0 → 3（藍 → 灰藍 → 灰褐 → 咖啡色）。
   · 揭曉（時間到）：目前的盤子放大，沒洗掉的污漬用紅圈圈起來，寫出「洗了 N 個盤子」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'dishes';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 個', label: '洗了', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_PLATES = 24;                       /* 洗了幾個盤子之後難度到頂 */
    var SPOTS = [2, 6];                         /* 污漬塊數：第 0 個盤子 → 到頂（四捨五入） */
    var SPOT_R = [52, 26];                      /* 每塊污漬的半徑（px，盤子畫在 300×300 的座標裡）：第 0 個 → 到頂 */
    var NEED = [300, 900];                      /* 刷掉一塊污漬要在上面移動多遠（px，盤子座標的單位）：第 0 個 → 到頂 */
    var VIS = [1, 0.5];                         /* 污漬的濃度（不透明度的上限）：第 0 個 → 到頂（越淡越難看見） */
    var PATS = [3, 10];                         /* 花紋的數量（沿著盤緣排的花瓣／點）：第 0 個 → 到頂（四捨五入） */
    var SIM_MAX = 3;                            /* 花紋顏色相似度的最大級數：0＝青花藍、1＝灰藍、2＝灰褐、3＝咖啡色（和污漬很像） */
    var TIME_S = 30;                            /* 全部的限時（秒） */
    var BRUSH_R = 26;                           /* 刷子的半徑（盤子座標，px） */
    var CLEAN_EPS = 0.03;                       /* 污漬剩下的髒度低於這個就算洗掉 */
    var PLATE_R = 140;                          /* 盤子的半徑（盤子座標） */
    var EDGE_PAD = 14;                          /* 污漬離盤子邊緣至少這麼遠（盤子座標） */
    var MIN_GAP = 4;                            /* 兩塊污漬之間至少隔這麼遠（邊與邊，盤子座標） */
    var NEXT_MS = 260;                          /* 洗乾淨之後多久換下一個盤子 */
    var SOLVE_CAP = 6;                          /* 驗證用：api.solve 最多幫忙洗幾個盤子 */
    var MAX_LEVEL = 90;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_PLATES)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function spotsFor(n) { return Math.round(lerp(SPOTS, n)); }
    function spotRFor(n) { return Math.round(lerp(SPOT_R, n) * 10) / 10; }
    function needFor(n) { return Math.round(lerp(NEED, n)); }
    function visFor(n) { return Math.round(lerp(VIS, n) * 1000) / 1000; }
    function patsFor(n) { return Math.round(lerp(PATS, n)); }
    function simFor(n) { return Math.min(SIM_MAX, Math.floor(prog(n) * (SIM_MAX + 1) * 0.999)); }
    /* 做一個盤子：{ n, vis, sim, spots（[{ x, y, r, need, v, blob }]，座標以盤心為原點）, pats（[{ kind, x, y, rot, size }]）}
       污漬在離盤心 INNER_R 之內、彼此不重疊（至少隔 MIN_GAP）；花紋沿著盤緣排成一圈（第一圈）、多的排在第二圈，另外盤心有一朵大的 */
    function makePlate(n, rand) {
        rand = rand || Math.random;
        var k = spotsFor(n), r = spotRFor(n), spots = [];
        /* 放污漬：「最佳候選」法——每塊污漬抽 40 個候選位置，挑「離已經放好的污漬最遠」的那個（污漬就會分散開）；
           放不下（盤子太擠）就把所有污漬縮小 6%（最多縮到 55%）重放，保證塊數一定夠 */
        for (var shrink = 1; shrink >= 0.5 && spots.length < k; shrink -= 0.06) {
            spots = [];
            for (var i = 0; i < k; i++) {
                var best = null, bestGap = -1e9;
                for (var c = 0; c < 40; c++) {
                    var a = rand() * 2 * Math.PI, rr = r * shrink * kit.randFloat(0.85, 1.05, rand), d = Math.sqrt(rand()) * (PLATE_R - EDGE_PAD - rr), x = d * Math.cos(a), y = d * Math.sin(a), gap = 1e9;
                    for (var j = 0; j < spots.length; j++) gap = Math.min(gap, Math.hypot(x - spots[j].x, y - spots[j].y) - rr - spots[j].r);
                    if (gap >= MIN_GAP + 0.3 && gap > bestGap) { bestGap = gap; best = { x: x, y: y, rr: rr }; }
                }
                if (!best) break;
                var blob = []; for (var bb = 0; bb < 3; bb++) { var ba = rand() * 6.283, bd = best.rr * 0.4 * rand(); blob.push([Math.round(bd * Math.cos(ba) * 10) / 10, Math.round(bd * Math.sin(ba) * 10) / 10, Math.round(best.rr * kit.randFloat(0.55, 0.85, rand) * 10) / 10]); }
                spots.push({ x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, r: Math.round(best.rr * 10) / 10, need: Math.round(needFor(n) * kit.randFloat(0.85, 1.15, rand)), v: 1, blob: blob });
            }
        }
        var np = patsFor(n), pats = [], kinds = ['petal', 'dot', 'arc'];
        for (var j = 0; j < np; j++) { var pa = j / np * 2 * Math.PI + rand() * 0.1; pats.push({ kind: kinds[j % 3], x: Math.round(120 * Math.cos(pa) * 10) / 10, y: Math.round(120 * Math.sin(pa) * 10) / 10, rot: Math.round(pa * 180 / Math.PI + 90), size: 9 + (j % 3) * 2 }); }
        pats.push({ kind: 'flower', x: 0, y: 0, rot: Math.round(rand() * 72), size: 26 });
        return { n: n, vis: visFor(n), sim: simFor(n), spots: spots, pats: pats };
    }
    /* 刷：手指在盤子座標 (x, y)、剛移動了 len（px）：半徑 BRUSH_R 之內的每塊污漬，v 減少 len ÷ need；回傳這一刷之後「這個盤子洗乾淨了沒」 */
    function scrub(plate, x, y, len) {
        var clean = true;
        plate.spots.forEach(function (s) {
            if (s.v > CLEAN_EPS && Math.hypot(x - s.x, y - s.y) <= s.r + BRUSH_R) s.v = Math.max(0, s.v - len / s.need);
            if (s.v > CLEAN_EPS) clean = false;
        });
        return clean;
    }
    function isClean(plate) { return plate.spots.every(function (s) { return s.v <= CLEAN_EPS; }); }
    function remaining(plate) { return plate.spots.filter(function (s) { return s.v > CLEAN_EPS; }); }
    /* 刷乾淨一個盤子至少要移動多遠（px）：每塊污漬的 need 總和（刷子可以同時刷到相鄰的污漬，所以實際可能更少） */
    function totalNeed(plate) { return plate.spots.reduce(function (s, p) { return s + p.need; }, 0); }
    function rating(n) {
        if (n >= 20) return '洗碗達人！';
        if (n >= 12) return '手腳俐落！';
        if (n >= 6) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '只刷污漬，不刷花紋！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, stageClass: 'dsh-stage', resume: false,
            head: function () { return '洗盤子'; },
            info: function (S) { return '洗了 ' + S.score + ' 個'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 個'; },
            rating: rating,
            lines: function (S) { return ['一共洗了 ' + S.score + ' 個盤子']; },
            setup: setup
        });
    }

    /* 畫一個盤子（SVG，viewBox 300×300，盤心在 150,150）：盤子本體、花紋、污漬；回傳每塊污漬的 SVG 群組 */
    function drawPlate(parent, plate) {
        var svg = kit.svg('svg', { 'class': 'dsh-svg', viewBox: '0 0 300 300', width: 330, height: 330 }, parent);
        var g = kit.svg('g', { transform: 'translate(150,150)' }, svg);
        kit.svg('circle', { 'class': 'dsh-plate', cx: 0, cy: 0, r: PLATE_R }, g);
        kit.svg('circle', { 'class': 'dsh-rim', cx: 0, cy: 0, r: PLATE_R - 18 }, g);
        plate.pats.forEach(function (p) {
            var pg = kit.svg('g', { 'class': 'dsh-pat dsh-pat' + plate.sim, transform: 'translate(' + p.x + ',' + p.y + ') rotate(' + p.rot + ')' }, g);
            if (p.kind === 'petal') kit.svg('ellipse', { cx: 0, cy: 0, rx: p.size * 0.55, ry: p.size }, pg);
            else if (p.kind === 'dot') kit.svg('circle', { cx: 0, cy: 0, r: p.size * 0.6 }, pg);
            else if (p.kind === 'arc') kit.svg('path', { 'class': 'dsh-pat__stroke', d: 'M-' + p.size + ',2 Q0,-' + p.size + ' ' + p.size + ',2' }, pg);
            else { for (var k = 0; k < 5; k++) kit.svg('ellipse', { cx: 0, cy: -p.size * 0.62, rx: p.size * 0.38, ry: p.size * 0.62, transform: 'rotate(' + (k * 72) + ')' }, pg); kit.svg('circle', { cx: 0, cy: 0, r: p.size * 0.22 }, pg); }
        });
        var spotG = plate.spots.map(function (s) {
            var sg = kit.svg('g', { 'class': 'dsh-spot', transform: 'translate(' + s.x + ',' + s.y + ')', opacity: plate.vis }, g);
            s.blob.forEach(function (b) { kit.svg('circle', { cx: b[0], cy: b[1], r: b[2] }, sg); });
            kit.svg('circle', { cx: 0, cy: 0, r: s.r * 0.7 }, sg);
            return sg;
        });
        return { svg: svg, g: g, spots: spotG };
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var count = 0, plate = null, view = null, phase = 'play', last = null, bubbles = 0;
        api.info = { get count() { return count; }, get plate() { return plate; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('洗了 0 個');
        console.log('[洗盤子] 開始：限時 ' + TIME_S + ' 秒；第 0 個盤子 ' + spotsFor(0) + ' 塊污漬 → 到頂 ' + spotsFor(RAMP_PLATES) + ' 塊');

        var field = h('div', { 'class': 'dsh-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note dsh-tip', text: '用手指在污漬上來回刷，花紋刷不掉' });
        field.appendChild(tip);
        var holder = h('div', { 'class': 'dsh-holder' }); holder.style.cssText = 'left:' + Math.round((W - 330) / 2) + 'px;top:90px;'; field.appendChild(holder);
        var info = h('div', { 'class': 'qz-note dsh-info', text: '' }); info.style.top = '440px'; field.appendChild(info);
        /* 盤子座標 ↔ 螢幕座標：盤子的 SVG 330px 對應 300 個單位 */
        var SC = 330 / 300;
        function toPlate(e) { var r = holder.getBoundingClientRect(), sx = r.width / 300; return { x: (e.clientX - r.left) / sx - 150, y: (e.clientY - r.top) / sx - 150 }; }
        function newPlate(first) {
            plate = makePlate(count, api.rand); holder.innerHTML = ''; view = drawPlate(holder, plate);
            view.svg.classList.add('dsh-svg--in'); api.after(20, function () { view.svg.classList.remove('dsh-svg--in'); });
            console.log('[洗盤子] 第 ' + (count + 1) + ' 個：污漬 ' + plate.spots.length + ' 塊（半徑約 ' + spotRFor(count) + '、要刷 ' + needFor(count) + ' px）、花紋 ' + plate.pats.length + '、花紋顏色級數 ' + plate.sim + '、濃度 ' + plate.vis);
            if (first && kit.once('dishes.hint')) { var sp = plate.spots[0]; kit.hintOn(stage, null, { mode: 'drag', x: holder.offsetLeft + (150 + sp.x - 40) * SC, y: holder.offsetTop + (150 + sp.y) * SC, dx: 80 * SC, dy: 0, delay: 700, text: '在污漬上來回刷' }); }
        }
        newPlate(true);
        function paintSpots() { plate.spots.forEach(function (s, i) { view.spots[i].setAttribute('opacity', (plate.vis * s.v).toFixed(3)); }); }
        /* 手指：按住移動就是在刷；每個移動事件算移動的距離（盤子座標），套用 scrub */
        var down = null;
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            down = { id: e.pointerId }; last = toPlate(e);
        });
        field.addEventListener('pointermove', function (e) {
            if (!down || e.pointerId !== down.id || phase !== 'play') return;
            var p = toPlate(e), len = Math.hypot(p.x - last.x, p.y - last.y); last = p;
            if (len <= 0 || Math.hypot(p.x, p.y) > PLATE_R + 20) return;
            var onDirt = plate.spots.some(function (s) { return s.v > CLEAN_EPS && Math.hypot(p.x - s.x, p.y - s.y) <= s.r + BRUSH_R; });
            if (len > 3 && bubbles < 14) bubble(e, onDirt);
            var clean = scrub(plate, p.x, p.y, len); paintSpots();
            if (clean) washed();
        });
        function up(e) { if (down && e.pointerId === down.id) { down = null; last = null; } }
        field.addEventListener('pointerup', up); field.addEventListener('pointercancel', up);
        /* 泡泡（裝飾）：刷的地方冒幾個泡泡 */
        function bubble(e, onDirt) {
            var r = field.getBoundingClientRect(), b = h('div', { 'class': 'dsh-bubble' + (onDirt ? ' dsh-bubble--dirt' : '') }); bubbles++;
            b.style.cssText = 'left:' + (e.clientX - r.left - 8 + (Math.random() - 0.5) * 24).toFixed(0) + 'px;top:' + (e.clientY - r.top - 8 + (Math.random() - 0.5) * 24).toFixed(0) + 'px;';
            field.appendChild(b); api.after(520, function () { bubbles--; if (b.parentNode) b.parentNode.removeChild(b); });
        }
        /* 洗乾淨了：自動換下一個盤子 */
        function washed() {
            if (phase !== 'play') return; phase = 'next';
            count++; S.score = count; api.setInfo('洗了 ' + count + ' 個'); Sfx.play('ok'); info.textContent = '乾淨了！下一個～'; view.svg.classList.add('dsh-svg--out');
            api.after(NEXT_MS, function () { if (api.over) return; info.textContent = ''; newPlate(false); phase = 'play'; });
        }
        /* 全部的限時：時間到就結束，把目前盤子沒洗掉的污漬圈起來 */
        api.timer(TIME_S * 1000, function () { timeUp(); });
        function timeUp() {
            if (phase === 'end' || api.over) return;
            var rem = phase === 'play' ? remaining(plate) : [];
            phase = 'end';
            if (rem.length) rem.forEach(function (s) { var c = kit.svg('circle', { 'class': 'dsh-ring', cx: s.x, cy: s.y, r: s.r + 8 }, view.g); void c; });
            var why = '時間到！一共洗了 ' + count + ' 個盤子' + (rem.length ? '；這個盤子還有 ' + rem.length + ' 塊污漬沒洗掉（紅圈）' : '');
            info.textContent = why; info.classList.add('dsh-info--end'); down = null; holder.classList.add('dsh-holder--big');
            kit.flash(stage, count >= 1, api.my);
            api.fail({ delay: 3800, lines: [why] });
        }
        /* 驗證用：直接把目前盤子的污漬全刷掉（solve；最多 SOLVE_CAP 個盤子）；wrong＝馬上時間到；可以重複呼叫 */
        api.solve = function () { if (phase !== 'play' || count >= SOLVE_CAP) return; plate.spots.forEach(function (s) { scrub(plate, s.x, s.y, s.need * 2); }); paintSpots(); if (isClean(plate)) washed(); };
        api.wrong = function () { timeUp(); };
    }

    var G = {
        id: ID,
        name: '洗盤子',
        rule: '盤子一個一個送過來，上面有咖啡色的醬汁污漬。**手指在污漬上來回刷（畫圈）**，污漬就慢慢淡掉；**整個盤子的污漬都洗掉，會自動換下一個盤子**。盤子上還有洗不掉的青花紋——污漬是軟軟的、形狀不規則的一塊一塊，花紋是清楚的規則圖案、沿著盤緣排整齊，**刷花紋只是浪費時間**。限時 30 秒，看你能洗幾個盤子。',
        mount: mount,
        score: SCORE,
        test: {
            spotsFor: spotsFor, spotRFor: spotRFor, needFor: needFor, visFor: visFor, patsFor: patsFor, simFor: simFor, makePlate: makePlate, scrub: scrub, isClean: isClean, remaining: remaining, totalNeed: totalNeed, rating: rating,
            RAMP_PLATES: RAMP_PLATES, SPOTS: SPOTS, SPOT_R: SPOT_R, NEED: NEED, VIS: VIS, PATS: PATS, SIM_MAX: SIM_MAX, TIME_S: TIME_S, BRUSH_R: BRUSH_R, CLEAN_EPS: CLEAN_EPS, PLATE_R: PLATE_R, EDGE_PAD: EDGE_PAD, MIN_GAP: MIN_GAP, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
