/* ═══════════════════════════════════════════════════════════════════
   reaction_beans.js — 秒反應・挑豆子（企劃 387；V1.38.0 改成關卡制、往盤子外面拖）
   樣式：css/games/reaction_beans.css（這款專屬的 class 一律以「beans-」開頭；共用元件在 css/reaction_common.css）
   阿嬤挑豆子。一盤紅豆裡混著別的東西。**用手指把紅豆以外的雜物（小石頭、綠豆、黑豆……）往盤子外面拖出去**，不用拖到哪裡、拖出盤緣就算。
   **拖到紅豆只會扣時間**（紅豆彈回原位）；每一關有時間限制，**時間內把盤子裡的雜物全部挑光就過關**，時間到才結束。成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 這款遊戲考驗的是「快速辨識」與「手指拖曳」：玩家意見指出原本要把豆子拖進碗裡太麻煩，改成只要往外拖；拖錯紅豆原本一次就結束，改成扣秒。
   · 一盤豆子（makePlate）：總共 total 顆（30 → 150），其中雜物 junk 顆（5 → 12）。雜物分兩種：
       容易分的：小石頭（灰色、有稜角）、綠豆（綠色）、黑豆（黑色）；
       很像紅豆的（look-alike，比例 0 → 0.8）：紅色小石頭（顏色一樣、但形狀有稜角、沒有光澤）、暗紅色的花豆（顏色偏暗、有淺色斑點）、赤小豆（比較小、比較細長）。
     **豆子之間不會互相重疊**（placeBeans：用圓形的「占地」隨機擺放，每顆至少隔 GAP px；擺不下就改用六角形格子），盤子是 PLATE_D＝480px 的圓盤。
   · 難度（線性，第 1 關 → 第 RAMP_LEVELS 關）：豆子數 30 → 150、雜物 5 → 12 顆、像紅豆的雜物比例 0 → 0.8、每顆豆子的大小 24 → 17 px、
     每關的限時 20 → 30 秒（雜物越多、越像紅豆，給的時間越多）。
   · 拖曳：按住一顆豆子（豆子比手指高一點，才不會被手指擋住）往外拖，豆子的中心**超出盤緣**的那一刻就判定（不用放開）：
     雜物＝挑出一顆（消失）；紅豆＝扣 PENALTY_S 秒、紅豆彈回原位。在盤子裡放開＝彈回原位，什麼都不發生。
   · 揭曉（時間到）：盤子上剩下的雜物用紅圈標出；下面把「紅豆」和那幾種很像的雜物並排放大，寫出差在哪裡（顏色、形狀還是大小）。
     結算彈窗一定疊在揭曉畫面的上面（揭曉畫面的疊放層級被收在遊戲區裡，見 css/games/reaction_beans.css 的 .beans-field），按鈕點得到。
   · 成績意義改過（挑出幾顆 → 通過幾關）：玩家瀏覽器裡舊的最佳紀錄第一次進來會清掉；伺服器上的舊成績要清掉（見 README V1.38.0）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'beans';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TOTAL = [30, 150];                      /* 一盤總共幾顆豆子：第 1 關 → 到頂（四捨五入） */
    var JUNK = [5, 12];                         /* 雜物幾顆：第 1 關 → 到頂 */
    var LOOK = [0, 0.8];                        /* 雜物裡「很像紅豆」的比例：第 1 關 → 到頂 */
    var SIZE = [24, 17];                        /* 一顆豆子的大小（px）：第 1 關 → 到頂 */
    var TIME_S = [20, 30];                      /* 每一關的限時（秒）：第 1 關 → 到頂 */
    var PENALTY_S = 3;                          /* 拖到紅豆扣幾秒 */
    var PLATE_D = 480;                          /* 盤子的直徑（px） */
    var PLATE_R = PLATE_D / 2;                  /* 盤子的半徑 */
    var RIM = 8;                                /* 盤緣的寬度（px，跟 css 的 .beans-plate border 一樣） */
    var GAP = 3;                                /* 兩顆豆子之間至少留幾 px 的縫 */
    var LIFT = 26;                              /* 拖曳時豆子比手指高一點（才不會被手指擋住）（px） */
    var NEXT_MS = 600;                          /* 挑光一盤之後多久換下一關 */
    var END_MS = 3600;                          /* 時間到之後，揭曉畫面停多久才跳出結算 */
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
    function ramp(pair, level) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function totalFor(level) { return Math.round(ramp(TOTAL, level)); }
    function junkFor(level) { return Math.max(1, Math.round(ramp(JUNK, level))); }
    function lookFor(level) { return Math.round(ramp(LOOK, level) * 1000) / 1000; }
    function sizeFor(level) { return Math.round(ramp(SIZE, level) * 10) / 10; }
    function timeMs(level) { return Math.round(ramp(TIME_S, level) * 1000); }
    /* 一顆豆子占的圓形半徑（畫出來的形狀最遠約 0.625 倍的豆子大小，再多一點點） */
    function beanRadius(size) { return Math.round(size * 0.64 * 10) / 10; }
    /* 盤子裡可以放豆子「中心」的範圍半徑（豆子整顆都要在盤緣裡面） */
    function centerRadius(size) { return PLATE_R - RIM - beanRadius(size); }
    /* 六角形格子：相鄰距離 sp，覆蓋半徑 R 的圓，回傳全部的格子（座標以盤心為原點） */
    function hexSlots(R, sp) {
        var rowH = sp * Math.sqrt(3) / 2, out = [], rows = Math.floor(R / rowH);
        for (var r = -rows; r <= rows; r++) {
            var y = r * rowH, off = (Math.abs(r) % 2) ? sp / 2 : 0;
            for (var x = -Math.floor(R / sp) * sp - off; x <= R; x += sp) if (Math.hypot(x, y) <= R) out.push([x, y]);
        }
        return out;
    }
    /* 豆子的位置：n 顆、互不重疊（中心距離 ≥ 2 × 半徑 ＋ GAP；擺不下就只要不重疊 ≥ 2 × 半徑；再不行改用六角形格子）。回傳 [[x, y], …]（盤心為原點） */
    function placeBeans(n, size, rand) {
        rand = rand || Math.random;
        var r = beanRadius(size), R = centerRadius(size), pts = [];
        var gaps = [2 * r + GAP, 2 * r];
        for (var i = 0; i < n; i++) {
            var p = null;
            for (var g = 0; g < gaps.length && !p; g++) {
                var d2 = gaps[g] * gaps[g];
                for (var tr = 0; tr < 400; tr++) {
                    var a = rand() * 2 * Math.PI, dd = Math.sqrt(rand()) * R, x = dd * Math.cos(a), y = dd * Math.sin(a), ok = true;
                    for (var q = 0; q < pts.length; q++) { var dx = pts[q][0] - x, dy = pts[q][1] - y; if (dx * dx + dy * dy < d2) { ok = false; break; } }
                    if (ok) { p = [x, y]; break; }
                }
            }
            if (!p) return kit.shuffle(hexSlots(R, 2 * r + GAP), rand).slice(0, n);        /* 保底：格子一定放得下（格子數 > 150） */
            pts.push(p);
        }
        return pts;
    }
    /* 做一盤：{ level, size, items（[{ id, type, good, x, y, rot }]，座標以盤心為原點）, junk（雜物顆數）, total } */
    function makePlate(level, rand) {
        rand = rand || Math.random;
        var total = totalFor(level), k = junkFor(level), size = sizeFor(level), nLook = Math.round(k * lookFor(level)), types = [], i;
        for (i = 0; i < total - k; i++) types.push('red');
        for (i = 0; i < nLook; i++) types.push(kit.pick(LOOKS, rand));
        for (i = 0; i < k - nLook; i++) types.push(kit.pick(EASY, rand));
        types = kit.shuffle(types, rand);
        var pts = placeBeans(total, size, rand);
        var items = types.map(function (t, id) {
            return { id: id, type: t, good: t === 'red', x: Math.round(pts[id][0] * 10) / 10, y: Math.round(pts[id][1] * 10) / 10, rot: Math.round(rand() * 180) };
        });
        return { level: level, size: size, items: items, junk: k, total: total };
    }
    /* 這個位置（盤心為原點）算不算已經拖出盤子：中心超出盤子的外緣 */
    function isOut(x, y) { return Math.hypot(x, y) > PLATE_R; }
    /* 一盤裡剩下的雜物 */
    function junkLeft(plate, removed) { return plate.items.filter(function (it) { return !it.good && !removed[it.id]; }); }
    /* 兩兩之間最近的「中心距離減去兩顆的半徑」（≥ 0 就是沒有重疊；測試用） */
    function minClearance(plate) {
        var r = beanRadius(plate.size), m = Infinity;
        for (var i = 0; i < plate.items.length; i++) for (var j = i + 1; j < plate.items.length; j++) {
            m = Math.min(m, Math.hypot(plate.items[i].x - plate.items[j].x, plate.items[i].y - plate.items[j].y) - 2 * r);
        }
        return m;
    }
    function rating(n) {
        if (n >= 40) return '挑豆子達人！';
        if (n >= 25) return '眼力超強！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '只挑不是紅豆的！';
    }

    function mount(root, ctx) {
        /* V1.38.0：成績從「挑出幾顆」變成「通過幾關」，舊的最佳紀錄不能比，第一次進來清掉。
           不用 Reaction.migrateBest：它看到 .sync 記號（現行版本寫的最佳紀錄都有）就當成新單位、不會清。 */
        var flag = Reaction.bestKey(ID) + '.v138';
        if (!UI.store.get(flag, false)) {
            UI.store.set(Reaction.bestKey(ID), null);
            UI.store.set(Reaction.bestKey(ID) + '.sync', false);
            UI.store.set(flag, true);
        }
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, stageClass: 'beans-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一顆豆子的 SVG（viewBox −12～12）：依種類畫形狀；rot＝旋轉角度 */
    function beanSvg(type, size, rot, parent, seed) {
        var s = Math.round(size * 1.5), svg = kit.svg('svg', { 'class': 'beans-bean beans-t-' + type, viewBox: '-12 -12 24 24', width: s, height: s }, parent);
        var g = kit.svg('g', { transform: 'rotate(' + rot + ')' }, svg);
        function ell(rx, ry, cls) { return kit.svg('ellipse', { 'class': cls, cx: 0, cy: 0, rx: rx, ry: ry }, g); }
        function poly(r0, r1, cls) { var pts = [], nv = 7, sd = seed || 1; for (var i = 0; i < nv; i++) { var a = i / nv * 6.283, rr = r0 + (r1 - r0) * (((Math.sin(sd * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1); pts.push((rr * Math.cos(a)).toFixed(2) + ',' + (rr * Math.sin(a)).toFixed(2)); } return kit.svg('polygon', { 'class': cls, points: pts.join(' ') }, g); }
        if (type === 'red') { ell(10, 7, 'beans-red'); ell(3.4, 1.7, 'beans-shine').setAttribute('transform', 'translate(-3,-2.5)'); }
        else if (type === 'adz') { ell(8.2, 5.4, 'beans-adz'); ell(2.8, 1.4, 'beans-shine').setAttribute('transform', 'translate(-2.5,-2)'); }
        else if (type === 'pinto') { ell(10, 7, 'beans-pinto'); [[-4, -1.5], [2, 2], [5, -2.5]].forEach(function (d) { kit.svg('circle', { 'class': 'beans-spot', cx: d[0], cy: d[1], r: 1.3 }, g); }); }
        else if (type === 'mung') { ell(7.4, 6.4, 'beans-mung'); ell(2.6, 1.4, 'beans-shine').setAttribute('transform', 'translate(-2.5,-2.2)'); }
        else if (type === 'black') { ell(8.4, 6.4, 'beans-black'); ell(2.6, 1.3, 'beans-shine').setAttribute('transform', 'translate(-2.5,-2.2)'); }
        else if (type === 'redstone') poly(6, 10, 'beans-redstone');
        else poly(5.5, 10, 'beans-stone');
        return svg;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472;
        var plate = makePlate(level, api.rand), removed = {}, els = {}, phase = 'play', drag = null, left = plate.junk, penalties = 0, timer = null;
        api.info = { get plate() { return plate; }, get removed() { return removed; }, get phase() { return phase; }, get left() { return left; }, get penalties() { return penalties; } };
        api.setInfo('還剩 ' + left + ' 顆');
        console.log('[挑豆子] 第 ' + level + ' 關：' + plate.total + ' 顆，雜物 ' + plate.junk + '（像紅豆的 ' + plate.items.filter(function (it) { return LOOKS.indexOf(it.type) >= 0; }).length + '），限時 ' + (timeMs(level) / 1000) + ' 秒，拖到紅豆扣 ' + PENALTY_S + ' 秒');

        var field = h('div', { 'class': 'beans-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note beans-tip', text: '雜物拖出盤子，拖到紅豆會扣時間' });
        field.appendChild(tip);
        var pcx = Math.round(W / 2), pcy = 50 + PLATE_R;
        var plateEl = h('div', { 'class': 'beans-plate' }); plateEl.style.cssText = 'left:' + (pcx - PLATE_R) + 'px;top:' + (pcy - PLATE_R) + 'px;width:' + PLATE_D + 'px;height:' + PLATE_D + 'px;'; field.appendChild(plateEl);
        var layer = h('div', { 'class': 'beans-layer' }); layer.style.cssText = 'left:' + pcx + 'px;top:' + pcy + 'px;'; field.appendChild(layer);
        var info = h('div', { 'class': 'qz-note beans-info', text: '' }); field.appendChild(info);
        var sz = Math.round(plate.size * 1.5);

        plate.items.forEach(function (it, i) {
            var el = h('div', { 'class': 'beans-item' });
            el.style.cssText = 'left:' + (it.x - sz / 2) + 'px;top:' + (it.y - sz / 2) + 'px;width:' + sz + 'px;height:' + sz + 'px;z-index:' + (i + 1) + ';';
            el.dataset.id = String(it.id); beanSvg(it.type, plate.size, it.rot, el, it.id + 1); layer.appendChild(el); els[it.id] = el;
        });
        if (level === 1 && kit.once('beans.hint3')) {
            var j = plate.items.filter(function (it) { return !it.good; })[0];
            if (j) {
                var d = Math.hypot(j.x, j.y) || 1, ux = j.x / d, uy = j.y / d || -1;
                kit.hintOn(stage, null, { mode: 'drag', x: pcx + j.x, y: pcy + j.y, dx: ux * (PLATE_R + 30) - j.x, dy: uy * (PLATE_R + 30) - j.y, delay: 600, text: '把雜物往盤子外面拖' });
            }
        }

        /* 拖曳：按住一顆豆子 → 跟著手指（比手指高一點）→ 中心超出盤緣就判定（雜物：挑出；紅豆：扣時間、彈回）；在盤子裡放開＝彈回原位 */
        field.addEventListener('pointerdown', function (e) {
            if (phase !== 'play' || api.over || drag) return;
            var t = e.target.closest ? e.target.closest('.beans-item') : null; if (!t) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            var id = +t.dataset.id, it = plate.items.filter(function (q) { return q.id === id; })[0], el = els[id];
            drag = { pid: e.pointerId, id: id, it: it, el: el }; el.classList.add('beans-item--drag'); el.style.zIndex = '9999'; moveTo(e);
        });
        function moveTo(e) {
            var p = kit.localPt(e, field), px = p.x, py = p.y - LIFT;                              /* 豆子中心（遊戲區座標，已換算舞台縮放）：比手指高 LIFT */
            drag.el.style.left = (px - pcx - sz / 2) + 'px'; drag.el.style.top = (py - pcy - sz / 2) + 'px';
            if (isOut(px - pcx, py - pcy)) throwOut(drag);
        }
        field.addEventListener('pointermove', function (e) { if (drag && e.pointerId === drag.pid) moveTo(e); });
        function release(e, cancel) {
            if (!drag || e.pointerId !== drag.pid) return;
            var d = drag; drag = null; d.el.classList.remove('beans-item--drag'); back(d.it);
        }
        field.addEventListener('pointerup', function (e) { release(e, false); });
        field.addEventListener('pointercancel', function (e) { release(e, true); });
        function back(it) { var el = els[it.id]; el.style.left = (it.x - sz / 2) + 'px'; el.style.top = (it.y - sz / 2) + 'px'; el.style.zIndex = String(plate.items.indexOf(it) + 1); }

        /* 豆子被拖出盤子：雜物＝挑出（消失）；紅豆＝扣時間、彈回原位。這一次拖曳到此結束（drag 清掉，手指還按著也不會再動它） */
        function throwOut(d) {
            if (drag !== d) return;
            drag = null; d.el.classList.remove('beans-item--drag');
            if (d.it.good) { penalize(d.it); return; }
            pickOut(d.it);
        }
        function pickOut(it) {
            if (phase !== 'play' || removed[it.id]) return;
            removed[it.id] = true; els[it.id].classList.add('beans-item--gone'); left--; api.setInfo('還剩 ' + left + ' 顆'); Sfx.play('click');
            if (left === 0) {
                phase = 'next'; info.textContent = '這盤挑乾淨了！'; info.classList.remove('beans-info--bad');
                api.pass({ delay: NEXT_MS });
            }
        }
        function penalize(it) {
            back(it);
            if (phase !== 'play') return;
            penalties++; Sfx.play('bad');
            if (timer) timer.cut(PENALTY_S * 1000);
            info.textContent = '拖到紅豆了！扣 ' + PENALTY_S + ' 秒'; info.classList.add('beans-info--bad');
            plateEl.classList.add('beans-plate--hit');
            api.after(900, function () { plateEl.classList.remove('beans-plate--hit'); if (phase === 'play') { info.textContent = ''; info.classList.remove('beans-info--bad'); } });
        }

        /* 時間到：標出剩下的雜物，並排放大「紅豆」和很像的雜物，停一下再跳出結算 */
        function timeUp() {
            if (phase !== 'play' || api.over) return;
            var rest = junkLeft(plate, removed);
            phase = 'end'; drag = null;
            rest.forEach(function (j) { var c = h('div', { 'class': 'beans-ring' }); var rs = Math.round(plate.size * 2.4); c.style.cssText = 'left:' + (j.x - rs / 2) + 'px;top:' + (j.y - rs / 2) + 'px;width:' + rs + 'px;height:' + rs + 'px;'; layer.appendChild(c); });
            var types = {}; rest.forEach(function (j) { types[j.type] = 1; });
            var showTypes = LOOKS.filter(function (t) { return types[t]; }).concat(EASY.filter(function (t) { return types[t]; })).slice(0, 3);
            if (!showTypes.length) showTypes = LOOKS.slice(0, 3);
            showCompare(showTypes);
            var why = '時間到！第 ' + level + ' 關還剩 ' + rest.length + ' 顆雜物（紅圈）';
            tip.textContent = why; tip.classList.add('beans-tip--bad'); info.textContent = ''; kit.flash(stage, false, api.my);          /* 結果寫在最上面的提示列（下面要留給「紅豆 VS 雜物」的並排比較） */
            api.fail({ delay: END_MS, lines: [why, '紅豆是光滑的暗紅色橢圓', showTypes.map(function (t) { return NAME[t] + '：' + DIFF[t]; }).join('；')] });
        }
        function showCompare(showTypes) {
            var box = h('div', { 'class': 'beans-cmp' }), row = function (t, label) { var c = h('div', { 'class': 'beans-cmp__c' }); var sv = h('div', { 'class': 'beans-cmp__s' }); beanSvg(t, 32, 20, sv, 3); c.appendChild(sv); c.appendChild(h('div', { 'class': 'beans-cmp__n', text: label })); return c; };
            box.style.top = (pcy + PLATE_R + 6) + 'px';
            box.appendChild(row('red', '紅豆'));
            box.appendChild(h('div', { 'class': 'beans-cmp__vs', text: 'VS' }));
            showTypes.forEach(function (t) { var c = row(t, NAME[t]); c.appendChild(h('div', { 'class': 'beans-cmp__d', text: t === 'redstone' ? '有稜角、沒光澤' : t === 'pinto' ? '偏暗、有斑點' : t === 'adz' ? '比較小、細長' : DIFF[t] })); box.appendChild(c); });
            field.appendChild(box);
        }
        /* 這一關的限時 */
        timer = api.timer(timeMs(level), timeUp);
        /* 驗證用：api.solve＝直接把一顆雜物拖出盤子（每次呼叫挑一顆，最多 SOLVE_CAP 顆）；api.wrong＝把一顆紅豆拖出盤子（扣時間）；可以重複呼叫 */
        api.solve = function () { if (phase !== 'play' || SOLVE_CAP <= plate.junk - left) return; var j = junkLeft(plate, removed)[0]; if (j) pickOut(j); };
        api.wrong = function () { if (phase !== 'play') return; var r = plate.items.filter(function (it) { return it.good; })[0]; if (r) penalize(r); };
    }

    var G = {
        id: ID,
        name: '挑豆子',
        rule: '阿嬤的紅豆裡混著別的東西。**用手指把不是紅豆的雜物（小石頭、綠豆、黑豆……）往盤子外面拖出去**，不用拖到哪裡，拖出盤緣就行。**拖到紅豆會扣時間**。紅豆是光滑的暗紅色橢圓；越後面，混進來的東西**越來越像紅豆**——紅色的小石頭、暗紅色有斑點的花豆、比較小又細長的赤小豆。每一關都有時間限制，**時間內把雜物挑光才能過關**，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            totalFor: totalFor, junkFor: junkFor, lookFor: lookFor, sizeFor: sizeFor, timeMs: timeMs, beanRadius: beanRadius, centerRadius: centerRadius, hexSlots: hexSlots,
            placeBeans: placeBeans, makePlate: makePlate, isOut: isOut, junkLeft: junkLeft, minClearance: minClearance, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TOTAL: TOTAL, JUNK: JUNK, LOOK: LOOK, SIZE: SIZE, TIME_S: TIME_S, PENALTY_S: PENALTY_S, PLATE_D: PLATE_D, PLATE_R: PLATE_R, RIM: RIM, GAP: GAP,
            SOLVE_CAP: SOLVE_CAP, EASY: EASY, LOOKS: LOOKS, DIFF: DIFF, NAME: NAME, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
