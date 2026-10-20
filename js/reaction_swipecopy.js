/* ═══════════════════════════════════════════════════════════════════
   reaction_swipecopy.js — 秒反應・反著滑（企劃 312「照著滑」，依使用者的修改改成「反著滑」）
   畫面上一個一個出現箭頭（上、下、左、右），每個箭頭出現在畫面不同的位置。看完一串之後，**照順序往「箭頭的反方向」滑**
   （箭頭朝上就要往下滑；在畫面任何地方滑都可以）。每關多一個箭頭。滑錯就結束。
   ───────────────────────────────────────────────────────────────────
   · 規則：第 i 個箭頭指向 dir_i，要滑的方向是它的反方向 opposite(dir_i)（8 個方向編號 0～7，從正上方順時針每 45° 一個，反方向就是 +4）。
   · 位置與方向故意衝突：箭頭出現在「它所指的那一邊」（朝上的在畫面上方、朝左的在畫面左邊…），但要滑的是反方向——
     直覺會被位置帶著走（Simon 效應）。positionFor 把箭頭放在所指方向的那一側，加一點隨機的距離與偏移。
   · 判定：手指按下、放開，位移超過 MIN_SWIPE 就算一次滑動；依位移的角度分成 4 個（上下左右，每個 90° 的扇形）或 8 個（每個 45° 的扇形）方向。
     第 DIAG_FROM 關起箭頭會有斜的（8 個方向），要滑的也是斜的反方向。
   · 難度（線性）：箭頭數 ＝ 關卡數 + 1（第 1 關 2 個）、每個箭頭停留 700 → 280 毫秒（SHOW_MS）、箭頭之間的空檔 250 → 100 毫秒（GAP_MS）；不會連續出現三個同方向的箭頭。
   · 滑錯：把整串箭頭排成一列、下面寫出「該滑的方向」，錯的那一個標紅（寫出你滑的方向），並且快速重播一遍。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'swipecopy';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後速度到頂 */
    var SHOW_MS = [700, 280];                   /* 每個箭頭停留多久（毫秒）：第 1 關 → 到頂 */
    var GAP_MS = [250, 100];                    /* 箭頭之間的空檔（毫秒）：第 1 關 → 到頂 */
    var DIAG_FROM = 15;                         /* 第幾關起有斜的箭頭（8 個方向） */
    var LEN_MAX = 24;                           /* 一串最多幾個箭頭 */
    var MIN_SWIPE = 36;                         /* 手指位移至少幾 px 才算滑動 */
    var REPLAY_MS = 170;                        /* 失敗後快速重播，每個箭頭亮多久（毫秒） */
    var MAX_LEVEL = 60;
    var NAMES = ['上', '右上', '右', '右下', '下', '左下', '左', '左上'];      /* 方向編號 0～7 的名字（從正上方順時針） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function lenFor(level) { return Math.min(LEN_MAX, level + 1); }
    function showMsFor(level) { return Math.round(ramp(level, SHOW_MS)); }
    function gapMsFor(level) { return Math.round(ramp(level, GAP_MS)); }
    function dirCountFor(level) { return level >= DIAG_FROM ? 8 : 4; }
    function opposite(d) { return (d + 4) % 8; }
    /* 方向編號 → 單位向量（x 向右、y 向下；0＝上） */
    function vec(d) { var a = d * Math.PI / 4; return { x: Math.sin(a), y: -Math.cos(a) }; }
    /* 手指位移 (dx, dy) → 方向編號：n＝4（上右下左，編號 0、2、4、6）或 8；位移太短回傳 −1 */
    function swipeDir(dx, dy, n, minDist) {
        if (Math.hypot(dx, dy) < (minDist == null ? MIN_SWIPE : minDist)) return -1;
        var a = Math.atan2(dx, -dy) * 180 / Math.PI;                    /* 從正上方順時針 */
        if (a < 0) a += 360;
        if (n === 4) return (Math.round(a / 90) % 4) * 2;
        return Math.round(a / 45) % 8;
    }
    /* 箭頭 d 出現的位置：放在「它所指的那一側」（要滑的卻是反方向），在 (W×H) 的範圍內，離邊界至少 margin */
    function positionFor(d, W, H, margin, rand) {
        rand = rand || Math.random;
        var u = vec(d), cx = W / 2, cy = H / 2, rx = W / 2 - margin, ry = H / 2 - margin;
        var k = kit.randFloat(0.55, 0.95, rand);
        var x = cx + u.x * rx * k + (u.x === 0 ? kit.randFloat(-0.7, 0.7, rand) * rx : kit.randFloat(-0.25, 0.25, rand) * rx * Math.abs(u.y));
        var y = cy + u.y * ry * k + (u.y === 0 ? kit.randFloat(-0.7, 0.7, rand) * ry : kit.randFloat(-0.25, 0.25, rand) * ry * Math.abs(u.x));
        return { x: kit.clamp(x, margin, W - margin), y: kit.clamp(y, margin, H - margin) };
    }
    /* 出一關：{ dirs（每個箭頭指的方向）, req（要滑的方向＝反方向）, len, showMs, gapMs, nDir, level }；不會連續出現三個同方向 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var len = lenFor(level), n = dirCountFor(level), pool = n === 4 ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7], dirs = [];
        for (var tr = 0; tr < 200; tr++) {
            dirs = [];
            for (var i = 0; i < len; i++) dirs.push(kit.pick(pool, rand));
            var ok = true;
            for (var j = 2; j < len; j++) if (dirs[j] === dirs[j - 1] && dirs[j] === dirs[j - 2]) ok = false;
            if (len >= 3 && dirs.every(function (d) { return d === dirs[0]; })) ok = false;
            if (ok) break;
        }
        return { dirs: dirs, req: dirs.map(opposite), len: len, showMs: showMsFor(level), gapMs: gapMsFor(level), nDir: n, level: level };
    }
    function rating(n) {
        if (n >= 15) return '反應與記憶都超強！';
        if (n >= 10) return '反著滑也難不倒你！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '箭頭指哪邊，就往相反的方向滑！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'swc-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 交通號誌的箭頭：藍色圓牌上一個白色粗箭頭，朝向 d（0＝上）；回傳元素，size 是圓牌直徑 */
    function sign(parent, d, size, cls) {
        var s = kit.svg('svg', { 'class': 'swc-sign ' + (cls || ''), viewBox: '-50 -50 100 100', width: size, height: size }, parent);
        kit.svg('circle', { 'class': 'swc-sign__disc', cx: 0, cy: 0, r: 48 }, s);
        var g = kit.svg('g', { transform: 'rotate(' + d * 45 + ')' }, s);
        kit.svg('path', { 'class': 'swc-sign__arrow', d: 'M0,-32 L24,-4 L9,-4 L9,30 L-9,30 L-9,-4 L-24,-4 Z' }, g);
        return s;
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), len = q.len;
        api.info = q;
        console.log('[反著滑] 第 ' + level + ' 關：' + len + ' 個箭頭 ' + q.dirs.map(function (d) { return NAMES[d]; }).join('、') + '；要滑 ' + q.req.map(function (d) { return NAMES[d]; }).join('、') + '；每個停 ' + q.showMs + ' 毫秒、空檔 ' + q.gapMs + ' 毫秒；' + q.nDir + ' 個方向');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'swc-field' });
        stage.appendChild(field);
        var tip = h('div', { 'class': 'qz-note swc-tip', text: '看箭頭，等一下往「反方向」滑' });
        field.appendChild(tip);
        var SZ = 112, areaT = 64, areaH = H - 230, zone = h('div', { 'class': 'swc-zone' });
        zone.style.cssText = 'left:12px;right:12px;top:' + areaT + 'px;height:' + areaH + 'px;';
        field.appendChild(zone);
        var dots = h('div', { 'class': 'swc-dots' });
        dots.style.top = (areaT + areaH + 14) + 'px';
        for (var i = 0; i < len; i++) dots.appendChild(h('span', { 'class': 'swc-dot' }));
        field.appendChild(dots);
        var info = h('div', { 'class': 'qz-note swc-info', text: '' });
        info.style.top = (areaT + areaH + 66) + 'px';
        field.appendChild(info);
        var strip = h('div', { 'class': 'swc-strip' });
        field.appendChild(strip);

        var phase = 'show', k = 0, done = false, down = null;
        /* 看：一個一個出現（叮），每個停 showMs、空檔 gapMs */
        function showNext() {
            if (api.over) return;
            if (k >= len) { phase = 'play'; k = 0; tip.textContent = '輪到你：每個箭頭往「反方向」滑'; info.textContent = '在畫面任何地方滑'; return; }
            var d = q.dirs[k], p = positionFor(d, zone.clientWidth || (W - 24), zone.clientHeight || areaH, SZ / 2 + 6, api.rand);
            var el = h('div', { 'class': 'swc-pop' });
            el.style.cssText = 'left:' + (p.x - SZ / 2) + 'px;top:' + (p.y - SZ / 2) + 'px;width:' + SZ + 'px;height:' + SZ + 'px;';
            sign(el, d, SZ); zone.appendChild(el); Sfx.play('ok');
            api.after(q.showMs, function () { if (el.parentNode) el.parentNode.removeChild(el); api.after(q.gapMs, function () { k++; showNext(); }); });
        }
        api.after(600, showNext);
        if (level === 1 && kit.once('swipecopy.hint')) api.after(600 + 2 * (q.showMs + q.gapMs) + 400, function () { kit.hintOn(stage, null, { mode: 'drag', x: W / 2, y: areaT + areaH / 2 - 40, dx: 0, dy: 90, text: '箭頭朝上就往下滑' }); });

        /* 滑：按下、放開，位移的方向和「要滑的方向」比對 */
        zone.addEventListener('pointerdown', function (e) { if (phase !== 'play' || done || api.over || down) return; e.preventDefault(); try { zone.setPointerCapture(e.pointerId); } catch (err) { } var p = kit.localPt(e, zone); down = { id: e.pointerId, x: p.x, y: p.y }; });
        function up(e) {
            if (!down || e.pointerId !== down.id) return;
            var p = kit.localPt(e, zone), dx = p.x - down.x, dy = p.y - down.y; down = null;
            var d = swipeDir(dx, dy, q.nDir);
            if (d < 0) { info.textContent = '滑長一點（要往一個方向滑過去）'; return; }
            judge(d);
        }
        zone.addEventListener('pointerup', up);
        zone.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) down = null; });
        function judge(d) {
            if (done || api.over || phase !== 'play') return;
            var want = q.req[k];
            /* 每次滑完在畫面中央閃一下你滑的方向 */
            var fl = h('div', { 'class': 'swc-flash' }); fl.style.cssText = 'left:' + ((zone.clientWidth || W) / 2 - 36) + 'px;top:' + ((zone.clientHeight || areaH) / 2 - 36) + 'px;'; sign(fl, d, 72, 'swc-sign--mine'); zone.appendChild(fl); api.after(260, function () { if (fl.parentNode) fl.parentNode.removeChild(fl); });
            if (d !== want) { fail(k, d); return; }
            dots.children[k].classList.add('swc-dot--ok'); Sfx.play('click'); k++;
            if (k >= len) { done = true; phase = 'end'; info.textContent = '全對！'; kit.flash(stage, true, api.my); api.pass({ delay: 1200 }); }
        }
        /* 滑錯：把整串箭頭排成一列、下面寫出該滑的方向，錯的標紅，並快速重播 */
        function fail(at, mine) {
            done = true; phase = 'end';
            zone.style.display = 'none'; dots.style.display = 'none';
            tip.textContent = '第 ' + (at + 1) + ' 個滑錯了';
            info.textContent = '箭頭指 ' + NAMES[q.dirs[at]] + '，要往 ' + NAMES[q.req[at]] + ' 滑；你滑了 ' + NAMES[mine];
            var per = Math.min(len, 8), size = Math.min(60, Math.floor((W - 24 - (per - 1) * 6) / per) - 16), rows = Math.ceil(len / per), cells = [];
            strip.style.top = '70px';
            for (var r = 0; r < rows; r++) {
                var row = h('div', { 'class': 'swc-strip__row' });
                for (var c = 0; c < per && r * per + c < len; c++) {
                    var idx = r * per + c, cell = h('div', { 'class': 'swc-cell' + (idx === at ? ' swc-cell--bad' : '') });
                    cell.appendChild(h('div', { 'class': 'swc-cell__no', text: String(idx + 1) }));
                    sign(cell, q.dirs[idx], size);
                    cell.appendChild(h('div', { 'class': 'swc-cell__to', text: '滑' }));
                    sign(cell, q.req[idx], Math.round(size * 0.7), idx === at ? 'swc-sign--bad' : 'swc-sign--req');
                    row.appendChild(cell); cells.push(cell);
                }
                strip.appendChild(row);
            }
            cells.forEach(function (cell, idx) { api.after(300 + idx * REPLAY_MS, function () { cell.classList.add('swc-cell--lit'); Sfx.play('tick'); }); });
            kit.flash(stage, false, api.my);
            api.fail({ delay: 300 + len * REPLAY_MS + 2200, lines: ['第 ' + (at + 1) + ' 個滑錯了：箭頭指 ' + NAMES[q.dirs[at]] + '，要往 ' + NAMES[q.req[at]] + ' 滑，你滑了 ' + NAMES[mine], '撐過 ' + at + ' 個箭頭'] });
        }
        api.solve = function () { if (phase !== 'play' || done) return; judge(q.req[k]); };
        api.wrong = function () { if (phase !== 'play' || done) return; judge(q.dirs[k]); };            /* 順著箭頭滑（忘了要反著滑）就是最典型的錯 */
    }

    var G = {
        id: ID,
        name: '反著滑',
        rule: '畫面上會一個一個出現箭頭（上、下、左、右），每個箭頭出現在不同的位置。看完一串之後，**照順序往「箭頭的反方向」滑**——**箭頭朝上就要往下滑**，朝左就往右滑（在畫面任何地方滑都可以）。每過一關多一個箭頭。小心：箭頭出現的位置常常在「它所指的那一邊」，**會帶著你滑錯**。滑錯就結束，看你能撐到幾個箭頭。越後面，箭頭出現得越快，第 15 關起還會有**斜的箭頭**（8 個方向）！',
        mount: mount,
        score: SCORE,
        test: {
            lenFor: lenFor, showMsFor: showMsFor, gapMsFor: gapMsFor, dirCountFor: dirCountFor, opposite: opposite, vec: vec, swipeDir: swipeDir, positionFor: positionFor, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SHOW_MS: SHOW_MS, GAP_MS: GAP_MS, DIAG_FROM: DIAG_FROM, LEN_MAX: LEN_MAX, MIN_SWIPE: MIN_SWIPE, REPLAY_MS: REPLAY_MS, NAMES: NAMES, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
