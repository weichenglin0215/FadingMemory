/* ═══════════════════════════════════════════════════════════════════
   reaction_beans.js — 秒反應・挑豆子（企劃 387）
   阿嬤挑豆子。一盤紅豆裡混著別的東西。**把紅豆以外的雜物（小石頭、綠豆、黑豆……）一顆一顆拖到下面的碗裡**。
   **拖錯紅豆就結束**；限時 20 秒，成績＝挑出幾顆雜物。盤子裡的雜物都挑光了，會自動換下一盤（豆子更多、雜物更少、更像紅豆）。
   ───────────────────────────────────────────────────────────────────
   · 一盤豆子（makePlate）：總共 total 顆（40 → 150），其中雜物占 ratio（30% → 8%，至少 1 顆）。雜物分兩種：
       容易分的：小石頭（灰色、有稜角）、綠豆（綠色）、黑豆（黑色）；
       很像紅豆的（look-alike，比例 0 → 0.8）：紅色小石頭（顏色一樣、但形狀有稜角、沒有光澤）、暗紅色的花豆（顏色偏暗、有淺色斑點）、赤小豆（比較小、比較細長）。
     豆子會互相蓋住（隨機的前後順序）；為了公平，**每顆雜物上面最多只被 1 顆別的豆子蓋到中心附近**（不會整顆被蓋死，不然撥都撥不到）。
   · 難度（線性，依「已經清空幾盤」，到 RAMP_PLATES 盤到頂）：豆子數 40 → 150、雜物比例 0.30 → 0.08、像紅豆的雜物比例 0 → 0.8、每顆豆子的大小 24 → 17 px。
   · 拖曳：按住一顆豆子拖到碗裡放開；放在碗外面就彈回原位。拖進碗裡的是雜物＝挑出一顆；是紅豆＝失敗。
   · 揭曉：盤子上剩下的雜物用紅圈標出；旁邊把「紅豆」和那幾種很像的雜物並排放大，寫出差在哪裡（顏色、形狀還是大小）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'beans';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 顆', label: '挑出', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_PLATES = 12;                       /* 清空幾盤之後難度到頂 */
    var TOTAL = [40, 150];                      /* 一盤總共幾顆豆子：第 0 盤 → 到頂（四捨五入） */
    var RATIO = [0.30, 0.08];                   /* 雜物占的比例：第 0 盤 → 到頂 */
    var LOOK = [0, 0.8];                        /* 雜物裡「很像紅豆」的比例：第 0 盤 → 到頂 */
    var SIZE = [24, 17];                        /* 一顆豆子的大小（px）：第 0 盤 → 到頂 */
    var TIME_S = 20;                            /* 全部的限時（秒） */
    var PLATE_R = 168;                          /* 盤子的半徑（px） */
    var BOWL_R = 64;                            /* 碗的半徑（px，拖進這個圓圈裡才算） */
    var LIFT = 26;                              /* 拖曳時豆子比手指高一點（才不會被手指擋住）（px） */
    var COVER_MAX = 1;                          /* 每顆雜物中心附近最多被幾顆別的豆子蓋到 */
    var NEXT_MS = 300;                          /* 清空一盤之後多久換下一盤 */
    var SOLVE_CAP = 12;                         /* 驗證用：api.solve 最多幫忙挑幾顆 */
    var MAX_LEVEL = 90;
    /* 豆子的種類：good＝紅豆；easy＝容易分的雜物；look＝很像紅豆的雜物；diff＝跟紅豆差在哪 */
    var EASY = ['stone', 'mung', 'black'], LOOKS = ['redstone', 'pinto', 'adz'];
    var DIFF = {
        stone: '灰色、有稜角', mung: '綠色、比較圓', black: '黑色',
        redstone: '紅色小石頭：顏色一樣，但形狀有稜角、表面沒有光澤（紅豆是光滑的橢圓）',
        pinto: '花豆：顏色偏暗紅，還有淺色的斑點',
        adz: '赤小豆：比紅豆小、而且比較細長'
    };
    var NAME = { red: '紅豆', stone: '小石頭', mung: '綠豆', black: '黑豆', redstone: '紅色小石頭', pinto: '花豆', adz: '赤小豆' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_PLATES)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function totalFor(n) { return Math.round(lerp(TOTAL, n)); }
    function ratioFor(n) { return Math.round(lerp(RATIO, n) * 1000) / 1000; }
    function lookFor(n) { return Math.round(lerp(LOOK, n) * 1000) / 1000; }
    function sizeFor(n) { return Math.round(lerp(SIZE, n) * 10) / 10; }
    function junkCount(n) { return Math.max(1, Math.round(totalFor(n) * ratioFor(n))); }
    /* 做一盤：{ n, size, items（依前後順序，後面的蓋在前面上面：[{ id, type, good, x, y, rot }]，座標以盤心為原點）, junk（雜物顆數）, total } */
    function makePlate(n, rand) {
        rand = rand || Math.random;
        var total = totalFor(n), k = junkCount(n), size = sizeFor(n), nLook = Math.round(k * lookFor(n)), types = [], i;
        for (i = 0; i < total - k; i++) types.push('red');
        for (i = 0; i < nLook; i++) types.push(kit.pick(LOOKS, rand));
        for (i = 0; i < k - nLook; i++) types.push(kit.pick(EASY, rand));
        types = kit.shuffle(types, rand);
        /* 位置：雜物彼此至少隔 0.6 顆豆子的大小（雜物不會互相蓋住）；紅豆隨機放。再把所有豆子的前後順序洗牌（後面的蓋在前面上面） */
        var items = [], junkPos = [];
        types.forEach(function (t, id) {
            var good = t === 'red', x = 0, y = 0;
            for (var tr = 0; tr < 300; tr++) {
                var a = rand() * 2 * Math.PI, d = Math.sqrt(rand()) * (PLATE_R - size * 0.9); x = d * Math.cos(a); y = d * Math.sin(a);
                if (good) break;
                var far = true; for (var q = 0; q < junkPos.length; q++) if (Math.hypot(x - junkPos[q][0], y - junkPos[q][1]) < size * 0.6) { far = false; break; }
                if (far) break;
            }
            if (!good) junkPos.push([x, y]);
            items.push({ id: id, type: t, good: good, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, rot: Math.round(rand() * 180) });
        });
        items = kit.shuffle(items, rand);
        /* 公平：每顆雜物中心附近最多被 COVER_MAX 顆「更上面」的豆子蓋到；蓋太多的，把它挪到最上面（雜物彼此隔得夠遠，挪上去不會蓋到別的雜物） */
        for (var p = 0; p < items.length; p++) {
            if (items[p].good) continue;
            var cover = 0; for (var q2 = p + 1; q2 < items.length; q2++) if (Math.hypot(items[q2].x - items[p].x, items[q2].y - items[p].y) < size * 0.55) cover++;
            if (cover > COVER_MAX) { var it = items.splice(p, 1)[0]; items.push(it); p--; }
        }
        return { n: n, size: size, items: items, junk: k, total: total };
    }
    /* 這個位置在碗裡嗎 */
    function inBowl(x, y, bx, by) { return Math.hypot(x - bx, y - by) <= BOWL_R; }
    /* 一盤裡剩下的雜物 */
    function junkLeft(plate, removed) { return plate.items.filter(function (it) { return !it.good && !removed[it.id]; }); }
    /* 這一盤蓋住雜物的程度：回傳每顆雜物中心附近有幾顆更上面的豆子 */
    function coverCounts(plate) {
        var out = [];
        plate.items.forEach(function (it, p) { if (it.good) return; var c = 0; for (var q = p + 1; q < plate.items.length; q++) if (Math.hypot(plate.items[q].x - it.x, plate.items[q].y - it.y) < plate.size * 0.55) c++; out.push(c); });
        return out;
    }
    function rating(n) {
        if (n >= 40) return '挑豆子達人！';
        if (n >= 25) return '眼力超強！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '只挑不是紅豆的！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'bns-stage', resume: false,
            head: function () { return '挑豆子'; },
            info: function (S) { return '挑出 ' + S.score + ' 顆'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 顆'; },
            rating: rating,
            lines: function (S) { return ['一共挑出 ' + S.score + ' 顆雜物']; },
            setup: setup
        });
    }

    /* 一顆豆子的 SVG（viewBox −12～12）：依種類畫形狀；rot＝旋轉角度 */
    function beanSvg(type, size, rot, parent, seed) {
        var s = Math.round(size * 1.5), svg = kit.svg('svg', { 'class': 'bns-bean bns-t-' + type, viewBox: '-12 -12 24 24', width: s, height: s }, parent);
        var g = kit.svg('g', { transform: 'rotate(' + rot + ')' }, svg);
        function ell(rx, ry, cls) { return kit.svg('ellipse', { 'class': cls, cx: 0, cy: 0, rx: rx, ry: ry }, g); }
        function poly(r0, r1, cls) { var pts = [], nv = 7, sd = seed || 1; for (var i = 0; i < nv; i++) { var a = i / nv * 6.283, rr = r0 + (r1 - r0) * (((Math.sin(sd * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1); pts.push((rr * Math.cos(a)).toFixed(2) + ',' + (rr * Math.sin(a)).toFixed(2)); } return kit.svg('polygon', { 'class': cls, points: pts.join(' ') }, g); }
        if (type === 'red') { ell(10, 7, 'bns-red'); ell(3.4, 1.7, 'bns-shine').setAttribute('transform', 'translate(-3,-2.5)'); }
        else if (type === 'adz') { ell(8.2, 5.4, 'bns-adz'); ell(2.8, 1.4, 'bns-shine').setAttribute('transform', 'translate(-2.5,-2)'); }
        else if (type === 'pinto') { ell(10, 7, 'bns-pinto'); [[-4, -1.5], [2, 2], [5, -2.5]].forEach(function (d) { kit.svg('circle', { 'class': 'bns-spot', cx: d[0], cy: d[1], r: 1.3 }, g); }); }
        else if (type === 'mung') { ell(7.4, 6.4, 'bns-mung'); ell(2.6, 1.4, 'bns-shine').setAttribute('transform', 'translate(-2.5,-2.2)'); }
        else if (type === 'black') { ell(8.4, 6.4, 'bns-black'); ell(2.6, 1.3, 'bns-shine').setAttribute('transform', 'translate(-2.5,-2.2)'); }
        else if (type === 'redstone') poly(6, 10, 'bns-redstone');
        else poly(5.5, 10, 'bns-stone');
        return svg;
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var count = 0, plateNo = 0, plate = null, removed = {}, els = {}, phase = 'play', drag = null;
        api.info = { get count() { return count; }, get plate() { return plate; }, get removed() { return removed; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('挑出 0 顆');
        console.log('[挑豆子] 開始：限時 ' + TIME_S + ' 秒；第 0 盤 ' + totalFor(0) + ' 顆（雜物 ' + junkCount(0) + '）→ 到頂 ' + totalFor(RAMP_PLATES) + ' 顆（雜物 ' + junkCount(RAMP_PLATES) + '）');

        var field = h('div', { 'class': 'bns-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note bns-tip', text: '把不是紅豆的拖到碗裡，別拖到紅豆！' });
        field.appendChild(tip);
        var pcx = Math.round(W / 2), pcy = 112 + PLATE_R, bx = pcx, by = pcy + PLATE_R + 14 + BOWL_R;
        var plateEl = h('div', { 'class': 'bns-plate' }); plateEl.style.cssText = 'left:' + (pcx - PLATE_R) + 'px;top:' + (pcy - PLATE_R) + 'px;width:' + 2 * PLATE_R + 'px;height:' + 2 * PLATE_R + 'px;'; field.appendChild(plateEl);
        var layer = h('div', { 'class': 'bns-layer' }); layer.style.cssText = 'left:' + pcx + 'px;top:' + pcy + 'px;'; field.appendChild(layer);
        var bowl = h('div', { 'class': 'bns-bowl' }); bowl.style.cssText = 'left:' + (bx - BOWL_R) + 'px;top:' + (by - BOWL_R) + 'px;width:' + 2 * BOWL_R + 'px;height:' + 2 * BOWL_R + 'px;'; bowl.appendChild(h('div', { 'class': 'bns-bowl__t', text: '放這裡' })); field.appendChild(bowl);
        var info = h('div', { 'class': 'qz-note bns-info', text: '' }); field.appendChild(info);

        function newPlate() {
            plate = makePlate(plateNo, api.rand); removed = {}; els = {}; layer.innerHTML = '';
            console.log('[挑豆子] 第 ' + (plateNo + 1) + ' 盤：' + plate.total + ' 顆，雜物 ' + plate.junk + '（像紅豆的 ' + plate.items.filter(function (it) { return LOOKS.indexOf(it.type) >= 0; }).length + '）');
            plate.items.forEach(function (it, i) {
                var el = h('div', { 'class': 'bns-item' }), sz = Math.round(plate.size * 1.5);
                el.style.cssText = 'left:' + (it.x - sz / 2) + 'px;top:' + (it.y - sz / 2) + 'px;width:' + sz + 'px;height:' + sz + 'px;z-index:' + (i + 1) + ';';
                el.dataset.id = String(it.id); beanSvg(it.type, plate.size, it.rot, el, it.id + 1); layer.appendChild(el); els[it.id] = el;
            });
            if (plateNo === 0 && kit.once('beans.hint2')) { var j = plate.items.filter(function (it) { return !it.good; })[0]; if (j) kit.hintOn(stage, null, { mode: 'drag', x: pcx + j.x, y: pcy + j.y, dx: bx - (pcx + j.x), dy: by - (pcy + j.y), delay: 600, text: '把雜物拖到碗裡' }); }
        }
        newPlate();

        /* 拖曳：按住一顆豆子（最上面那顆）→ 跟著手指（比手指高一點）→ 放在碗裡＝丟進去；放在別處＝彈回原位 */
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over || drag) return;
            var t = e.target.closest ? e.target.closest('.bns-item') : null; if (!t) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            var id = +t.dataset.id, it = plate.items.filter(function (q) { return q.id === id; })[0], el = els[id];
            drag = { pid: e.pointerId, id: id, it: it, el: el }; el.classList.add('bns-item--drag'); el.style.zIndex = '9999'; moveTo(e);
        });
        function moveTo(e) {
            var r = field.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
            drag.px = px; drag.py = py; var sz = Math.round(plate.size * 1.5);
            drag.el.style.left = (px - pcx - sz / 2) + 'px'; drag.el.style.top = (py - LIFT - pcy - sz / 2) + 'px';
            bowl.classList.toggle('bns-bowl--hot', inBowl(px, py - LIFT, bx, by) || inBowl(px, py, bx, by));
        }
        field.addEventListener('pointermove', function (e) { if (drag && e.pointerId === drag.pid) moveTo(e); });
        function release(e, cancel) {
            if (!drag || e.pointerId !== drag.pid) return;
            var d = drag; drag = null; bowl.classList.remove('bns-bowl--hot'); d.el.classList.remove('bns-item--drag');
            if (!cancel && (inBowl(d.px, d.py - LIFT, bx, by) || inBowl(d.px, d.py, bx, by))) drop(d.it); else back(d.it);
        }
        field.addEventListener('pointerup', function (e) { release(e, false); });
        field.addEventListener('pointercancel', function (e) { release(e, true); });
        function back(it) { var el = els[it.id], sz = Math.round(plate.size * 1.5); el.style.left = (it.x - sz / 2) + 'px'; el.style.top = (it.y - sz / 2) + 'px'; el.style.zIndex = String(plate.items.indexOf(it) + 1); }
        /* 丟進碗裡 */
        function drop(it) {
            if (phase !== 'play') return;
            if (it.good) { fail('red', it); return; }
            removed[it.id] = true; els[it.id].classList.add('bns-item--gone'); count++; S.score = count; api.setInfo('挑出 ' + count + ' 顆'); Sfx.play('click');
            bowl.classList.add('bns-bowl--pop'); api.after(180, function () { bowl.classList.remove('bns-bowl--pop'); });
            if (junkLeft(plate, removed).length === 0) { phase = 'next'; info.textContent = '這盤挑乾淨了！下一盤～'; api.after(NEXT_MS, function () { if (api.over) return; plateNo++; info.textContent = ''; newPlate(); phase = 'play'; }); }
        }
        /* 結束：標出剩下的雜物，並排放大「紅豆」和很像的雜物 */
        function finish(kind, it) {
            if (phase === 'end' || api.over) return; var left = phase === 'play' || kind === 'red' ? junkLeft(plate, removed) : [];
            phase = 'end'; api.stopTimer(); drag = null;
            left.forEach(function (j) { var c = h('div', { 'class': 'bns-ring' }); var sz = Math.round(plate.size * 2.4); c.style.cssText = 'left:' + (j.x - sz / 2) + 'px;top:' + (j.y - sz / 2) + 'px;width:' + sz + 'px;height:' + sz + 'px;'; layer.appendChild(c); });
            if (kind === 'red' && it) { var c2 = h('div', { 'class': 'bns-ring bns-ring--red' }), s2 = Math.round(plate.size * 2.4); c2.style.cssText = 'left:' + (it.x - s2 / 2) + 'px;top:' + (it.y - s2 / 2) + 'px;width:' + s2 + 'px;height:' + s2 + 'px;'; layer.appendChild(c2); back(it); }
            var types = {}; left.forEach(function (j) { types[j.type] = 1; }); var showTypes = LOOKS.filter(function (t) { return types[t]; }).concat(EASY.filter(function (t) { return types[t]; })).slice(0, 3);
            if (!showTypes.length) showTypes = LOOKS.slice(0, 3);
            showCompare(showTypes);
            var why = kind === 'red' ? '拖錯了！那是紅豆，不是雜物' : '時間到！一共挑出 ' + count + ' 顆雜物' + (left.length ? '，盤子裡還剩 ' + left.length + ' 顆（紅圈）' : '');
            tip.textContent = why; tip.classList.add('bns-tip--bad'); kit.flash(stage, kind !== 'red' && count >= 1, api.my);          /* 結果寫在最上面的提示列（下面要留給「紅豆 VS 雜物」的並排比較） */
            api.fail({ delay: 4200, lines: [why, '紅豆是光滑的暗紅色橢圓', showTypes.map(function (t) { return NAME[t] + '：' + DIFF[t]; }).join('；')] });
        }
        function fail(kind, it) { finish(kind, it); }
        function showCompare(showTypes) {
            bowl.style.display = 'none';
            var box = h('div', { 'class': 'bns-cmp' }), row = function (t, label) { var c = h('div', { 'class': 'bns-cmp__c' }); var sv = h('div', { 'class': 'bns-cmp__s' }); beanSvg(t, 40, 20, sv, 3); c.appendChild(sv); c.appendChild(h('div', { 'class': 'bns-cmp__n', text: label })); return c; };
            box.appendChild(row('red', '紅豆'));
            box.appendChild(h('div', { 'class': 'bns-cmp__vs', text: 'VS' }));
            showTypes.forEach(function (t) { var c = row(t, NAME[t]); c.appendChild(h('div', { 'class': 'bns-cmp__d', text: t === 'redstone' ? '有稜角、沒光澤' : t === 'pinto' ? '偏暗、有斑點' : t === 'adz' ? '比較小、細長' : DIFF[t] })); box.appendChild(c); });
            field.appendChild(box);
        }
        /* 全部的限時 */
        api.timer(TIME_S * 1000, function () { finish('time', null); });
        /* 驗證用：直接把一顆雜物丟進碗裡（solve，每次呼叫挑一顆，最多 SOLVE_CAP 顆）；wrong＝把一顆紅豆丟進碗裡；可以重複呼叫 */
        api.solve = function () { if (phase !== 'play' || count >= SOLVE_CAP) return; var j = junkLeft(plate, removed)[0]; if (j) drop(j); };
        api.wrong = function () { if (phase !== 'play') return; var r = plate.items.filter(function (it) { return it.good; })[0]; if (r) drop(r); };
    }

    var G = {
        id: ID,
        name: '挑豆子',
        rule: '阿嬤的紅豆裡混著別的東西。**把不是紅豆的雜物（小石頭、綠豆、黑豆……）一顆一顆拖到下面的碗裡**。**拖錯紅豆就結束**。紅豆是光滑的暗紅色橢圓；越後面，混進來的東西**越來越像紅豆**——紅色的小石頭、暗紅色有斑點的花豆、比較小又細長的赤小豆；豆子會互相蓋住，雜物也越來越少。限時 20 秒，一盤挑乾淨會換下一盤，看你能挑出幾顆。',
        mount: mount,
        score: SCORE,
        test: {
            totalFor: totalFor, ratioFor: ratioFor, lookFor: lookFor, sizeFor: sizeFor, junkCount: junkCount, makePlate: makePlate, inBowl: inBowl, junkLeft: junkLeft, coverCounts: coverCounts, rating: rating,
            RAMP_PLATES: RAMP_PLATES, TOTAL: TOTAL, RATIO: RATIO, LOOK: LOOK, SIZE: SIZE, TIME_S: TIME_S, PLATE_R: PLATE_R, BOWL_R: BOWL_R, COVER_MAX: COVER_MAX, SOLVE_CAP: SOLVE_CAP, EASY: EASY, LOOKS: LOOKS, DIFF: DIFF, NAME: NAME, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
