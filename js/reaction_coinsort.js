/* ═══════════════════════════════════════════════════════════════════
   reaction_coinsort.js — 秒反應・零錢入筒（企劃 359，依使用者的修改）
   硬幣一枚一枚從上面掉下來，**用手指把它滑進對的收集筒**：
       銅色的大硬幣＝50 元 → 往【左】滑，掉進左下方的筒；
       銅色的小硬幣＝5 元  → 往【下】滑，掉進正下方的筒；
       銀色的大硬幣＝10 元 → 往【右】滑，掉進右下方的筒。
   滑錯方向、或是來不及滑（硬幣掉到筒子口）就結束，成績＝一共分對幾枚（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · ★ 關於 5 元的方向：使用者的字是「銅色的 5 圓（要往左邊揮，掉落正下方的收集筒）」。兩種銅色硬幣如果都往左滑，
     就不可能分別掉進「左下」和「正下方」兩個不同的筒，所以我把 5 元解讀成「往下滑」（筒子就在正下方）。
     如果使用者其實要的是別的方向，只要改 DIR_OF 這一個表（以及筒子的位置 TUBE_X）就好。
   · 難度（線性，依「已經分對幾枚」，到 RAMP_COINS 枚到頂）：
       ① 掉落時間 FALL_S：3.4 秒 → 1.0 秒（硬幣從上面掉到筒子口的時間，越短越要快）；
       ② 背面朝上的機率 BACK_P：0 → 0.7（背面看不到數字，只能靠「顏色」和「大小」判斷）；
       ③ 5 元和 50 元的大小比 RATIO5：0.62 → 0.8（越來越接近，小硬幣只比大硬幣小 20%）。
   · 滑的判定（classifySwipe）：手指在畫面任何地方按下、拉開 SWIPE_MIN 以上就算一次滑；
     水平分量夠大（≥ 垂直的 0.75 倍）算左／右，否則往下算「下」，往上滑不算（繼續等）。
   · 結束時：那一枚硬幣放大、翻到正面（顯示它是幾元），並寫出它該往哪滑。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'coinsort';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 枚', label: '分對', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_COINS = 40;                        /* 分對幾枚之後難度到頂 */
    var FALL_S = [3.4, 1.0];                    /* 硬幣從出現到掉到筒子口的時間（秒）：第 0 枚 → 到頂 */
    var BACK_P = [0, 0.7];                      /* 背面朝上（看不到數字）的機率：第 0 枚 → 到頂 */
    var RATIO5 = [0.62, 0.8];                   /* 5 元硬幣的直徑 ÷ 50 元（也是 10 元）的直徑：第 0 枚 → 到頂 */
    var SWIPE_MIN = 40;                         /* 手指要拉開幾 px 才算一次滑 */
    var HORIZ_K = 0.75;                         /* 水平分量 ≥ 垂直分量 × 這個數，就算左右滑（不然往下算「下」） */
    var COIN_D = 0.2;                           /* 大硬幣的直徑占畫面寬度的比例 */
    var MAX_SAME = 3;                           /* 最多連續幾枚同一種硬幣 */
    var LEAD_MS = 700;                          /* 進場後第一枚硬幣多久出現 */
    var NEXT_MS = 140;                          /* 分對之後，下一枚多久出現 */
    var FLY_MS = 240;                           /* 硬幣滑進筒子的動畫時間 */
    var SOLVE_CAP = 8;                          /* 驗證用：api.solve 最多幫忙分對幾枚（不然會一直玩不完） */
    var MAX_LEVEL = 90;
    /* 每種硬幣：幾元、金屬、該往哪滑、說明（結束時顯示） */
    var TYPES = ['c50', 'c5', 'c10'];
    var COIN = {
        c50: { value: '50', metal: 'copper', big: true, dir: 'left', name: '50 元', look: '銅色、大' },
        c5: { value: '5', metal: 'copper', big: false, dir: 'down', name: '5 元', look: '銅色、小' },
        c10: { value: '10', metal: 'silver', big: true, dir: 'right', name: '10 元', look: '銀色、大' }
    };
    var DIR_OF = { c50: 'left', c5: 'down', c10: 'right' };              /* 哪種硬幣該往哪滑（要改方向只改這裡） */
    var TUBE_X = { left: 0.17, down: 0.5, right: 0.83 };                 /* 三個筒子的中心 x（占畫面寬度的比例）：左、下、右 */
    var DIR_NAME = { left: '左', down: '下', right: '右' };
    var DIR_ARROW = { left: '←', down: '↓', right: '→' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_COINS)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function fallMsFor(n) { return Math.round(lerp(FALL_S, n) * 1000); }
    function backPFor(n) { return Math.round(lerp(BACK_P, n) * 1000) / 1000; }
    function ratio5For(n) { return Math.round(lerp(RATIO5, n) * 1000) / 1000; }
    /* 硬幣直徑（px）：W＝畫面寬 */
    function diameterOf(type, n, W) { var big = Math.round(W * COIN_D); return COIN[type].big ? big : Math.round(big * ratio5For(n)); }
    /* 手指位移 (dx, dy)（y 向下）→ 'left'｜'right'｜'down'｜'up'；位移太短回傳 null。往上滑回傳 'up'（不算數） */
    function classifySwipe(dx, dy, minDist) {
        if (Math.hypot(dx, dy) < (minDist == null ? SWIPE_MIN : minDist)) return null;
        if (Math.abs(dx) >= Math.abs(dy) * HORIZ_K && Math.abs(dx) > 0) return dx < 0 ? 'left' : 'right';
        return dy > 0 ? 'down' : 'up';
    }
    /* 下一枚硬幣：{ type, back }。三種各 1/3，但最多連續 MAX_SAME 枚同一種；back 依 backPFor(n) */
    function nextCoin(history, n, rand) {
        rand = rand || Math.random;
        var pool = TYPES.slice(), k = history.length;
        if (k >= MAX_SAME) { var last = history[k - 1], same = true; for (var i = 1; i < MAX_SAME; i++) if (history[k - 1 - i] !== last) same = false; if (same) pool = pool.filter(function (t) { return t !== last; }); }
        return { type: kit.pick(pool, rand), back: rand() < backPFor(n) };
    }
    /* 這次滑對不對 */
    function isRight(type, dir) { return DIR_OF[type] === dir; }
    /* 結束時的說明：kind＝'wrong'（滑錯）或 'miss'（來不及） */
    function whyText(type, kind, dir) {
        var c = COIN[type], want = DIR_NAME[DIR_OF[type]];
        if (kind === 'miss') return '來不及了！這枚是 ' + c.name + '（' + c.look + '），要往' + want + '滑';
        return '滑錯了！這枚是 ' + c.name + '（' + c.look + '），要往' + want + '滑，你滑了' + DIR_NAME[dir];
    }
    function rating(n) {
        if (n >= 80) return '零錢達人！';
        if (n >= 40) return '眼明手快！';
        if (n >= 20) return '不錯喔！';
        if (n >= 8) return '再接再厲！';
        return '先看顏色、再看大小！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 20, stageClass: 'cns-stage', resume: false,
            head: function () { return '零錢入筒'; },
            info: function (S) { return '已收 ' + S.score + ' 枚'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 枚'; },
            rating: rating,
            lines: function (S) { return ['一共分對 ' + S.score + ' 枚']; },
            setup: setup
        });
    }

    /* 畫一枚硬幣（SVG，viewBox −50～50）：正面顯示幾元，背面畫一個花紋（不仿真實硬幣圖案） */
    function coinSvg(type, back, D) {
        var c = COIN[type], svg = kit.svg('svg', { 'class': 'cns-coin cns-coin--' + c.metal, viewBox: '-50 -50 100 100', width: D, height: D });
        kit.svg('circle', { 'class': 'cns-rim', cx: 0, cy: 0, r: 48 }, svg);
        kit.svg('circle', { 'class': 'cns-reed', cx: 0, cy: 0, r: 46 }, svg);
        kit.svg('circle', { 'class': 'cns-face', cx: 0, cy: 0, r: 40 }, svg);
        kit.svg('circle', { 'class': 'cns-ring', cx: 0, cy: 0, r: 40 }, svg);
        if (back) {
            kit.svg('circle', { 'class': 'cns-pat', cx: 0, cy: 0, r: 9 }, svg);
            for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; kit.svg('circle', { 'class': 'cns-pat', cx: (25 * Math.cos(a)).toFixed(2), cy: (25 * Math.sin(a)).toFixed(2), r: 5 }, svg); }
        } else {
            var t = kit.svg('text', { 'class': 'cns-digit cns-digit--' + c.value.length, x: 0, y: 3 }, svg); t.textContent = c.value;
        }
        return svg;
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var count = 0, over = false, coin = null, history = [], gen = 0, loop = null;
        var counts = { c50: 0, c5: 0, c10: 0 };
        api.info = { get count() { return count; }, get coin() { return coin; }, get over() { return over; } };
        S.score = 0; api.setInfo('已收 0 枚');
        console.log('[零錢入筒] 開始：掉落時間 ' + fallMsFor(0) + ' → ' + fallMsFor(RAMP_COINS) + ' 毫秒');

        var field = h('div', { 'class': 'cns-field' });
        stage.appendChild(field);
        /* 三個收集筒：左下 50 元、正下 5 元、右下 10 元；筒口的位置就是硬幣要掉到的線 */
        var TUBE_H = 150, tubeTop = H - TUBE_H - 8, lineY = tubeTop - 6, tubeW = Math.round(W * 0.28), tubes = {}, big = Math.round(W * COIN_D);
        ['left', 'down', 'right'].forEach(function (dir) {
            var type = TYPES.filter(function (t) { return DIR_OF[t] === dir; })[0], c = COIN[type];
            var el = h('div', { 'class': 'cns-tube' });
            el.style.cssText = 'left:' + Math.round(W * TUBE_X[dir] - tubeW / 2) + 'px;top:' + tubeTop + 'px;width:' + tubeW + 'px;height:' + TUBE_H + 'px;';
            var ico = h('div', { 'class': 'cns-tube__ico' }); ico.appendChild(coinSvg(type, false, Math.round(big * 0.5)));
            var lab = h('div', { 'class': 'cns-tube__lab', text: DIR_ARROW[dir] + ' ' + c.name });
            var num = h('div', { 'class': 'cns-tube__num', text: '0 枚' });
            el.appendChild(ico); el.appendChild(lab); el.appendChild(num); field.appendChild(el);
            tubes[type] = { el: el, num: num, dir: dir, x: Math.round(W * TUBE_X[dir]), ico: ico };
        });
        var info = h('div', { 'class': 'qz-note cns-info', text: '' }); field.appendChild(info);
        function tubeCount(type) { counts[type]++; tubes[type].num.textContent = counts[type] + ' 枚'; tubes[type].el.classList.remove('cns-tube--hit'); void tubes[type].el.offsetWidth; tubes[type].el.classList.add('cns-tube--hit'); }

        /* ── 出一枚硬幣 ── */
        function spawn() {
            if (over || api.over) return;
            var nc = nextCoin(history, count, api.rand), D = diameterOf(nc.type, count, W), fall = fallMsFor(count);
            history.push(nc.type); if (history.length > 8) history.shift();
            var x = Math.round(kit.randFloat(W * 0.3, W * 0.7, api.rand)), el = h('div', { 'class': 'cns-coinbox' });
            el.style.cssText = 'width:' + D + 'px;height:' + D + 'px;';
            el.appendChild(coinSvg(nc.type, nc.back, D)); field.appendChild(el);
            coin = { type: nc.type, back: nc.back, D: D, x: x, y: -D, el: el, t0: performance.now(), fall: fall, done: false, no: ++gen };
            place(coin, x, -D);
            if (count === 0 && kit.once('coinsort.hint')) {
                var mine = coin;
                api.after(900, function () {
                    if (coin !== mine || mine.done || over) return;
                    var tt = tubes[mine.type], p = Math.min(1, (performance.now() - mine.t0) / mine.fall), cy = -mine.D + lineY * p + mine.D / 2;          /* 硬幣現在的中心 y */
                    kit.hintOn(stage, null, { mode: 'drag', x: mine.x, y: cy, dx: tt.x - mine.x, dy: tubeTop + 30 - cy, text: '照筒子上的箭頭滑' });
                });
            }
        }
        function place(c, x, y) { c.el.style.transform = 'translate3d(' + (x - c.D / 2).toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; }
        /* 每一格影格：硬幣往下掉；掉到筒子口還沒滑 → 結束 */
        loop = api.my.loop(function (now) {
            if (over || !stage.isConnected) return false;
            if (!coin || coin.done) return;
            var p = (now - coin.t0) / coin.fall;
            if (p >= 1) { place(coin, coin.x, lineY - coin.D); miss(); return; }
            coin.y = -coin.D + lineY * p; place(coin, coin.x, coin.y);                 /* 頂端的 y：從 −D（剛好在畫面上方）走到 lineY − D（硬幣底部碰到筒子口） */
        });
        /* 保底：rAF 被暫停（背景分頁）時，用計時器檢查是不是掉到底了 */
        (function guard() { api.after(250, function () { if (over || api.over) return; if (coin && !coin.done && performance.now() - coin.t0 >= coin.fall + 150) miss(); guard(); }); })();
        api.after(LEAD_MS, spawn);

        /* ── 滑 ── */
        var down = null;
        field.addEventListener('pointerdown', function (e) {
            if (over || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }
            var p = kit.localPt(e, field); down = { id: e.pointerId, x: p.x, y: p.y, fired: false };
        });
        function track(e) {
            if (!down || e.pointerId !== down.id || down.fired) return;
            var p = kit.localPt(e, field), d = classifySwipe(p.x - down.x, p.y - down.y);
            if (d == null || d === 'up') return;
            down.fired = true; swipe(d);
        }
        field.addEventListener('pointermove', track);
        field.addEventListener('pointerup', function (e) { track(e); if (down && e.pointerId === down.id) down = null; });
        field.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) down = null; });

        function swipe(dir) {
            if (over || api.over || !coin || coin.done) return;
            var c = coin; c.done = true;
            var ok = isRight(c.type, dir), tube = tubes[ok ? c.type : TYPES.filter(function (t) { return DIR_OF[t] === dir; })[0]];
            /* 硬幣飛進筒子口 */
            var fx = c.x, fy = c.y, tx = tube.x, ty = tubeTop + 22;
            api.my.tween(FLY_MS, function (p) { place(c, fx + (tx - fx) * p, fy + (ty - c.D / 2 - fy) * p); c.el.style.opacity = String(1 - 0.6 * p); }, kit.easeInQuad).then(function () {
                if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
                if (ok && !over) { tubeCount(c.type); }
            });
            if (ok) {
                count++; S.score = count; api.setInfo('已收 ' + count + ' 枚'); Sfx.play('ok');
                coin = null; api.after(NEXT_MS, spawn);
            } else finish('wrong', c, dir);
        }
        function miss() { if (over || api.over || !coin || coin.done) return; coin.done = true; finish('miss', coin, null); }
        function finish(kind, c, dir) {
            if (over) return;
            over = true;
            var why = whyText(c.type, kind, dir);
            info.textContent = why;
            tubes[c.type].el.classList.add('cns-tube--right');
            if (dir) { var wt = TYPES.filter(function (t) { return DIR_OF[t] === dir; })[0]; if (wt !== c.type) tubes[wt].el.classList.add('cns-tube--wrong'); }
            /* 那一枚硬幣放大、翻到正面 */
            if (kind === 'miss' && c.el.parentNode) c.el.parentNode.removeChild(c.el);
            var BD = Math.round(W * 0.42), bigEl = h('div', { 'class': 'cns-bigcoin' });
            bigEl.style.cssText = 'width:' + BD + 'px;height:' + BD + 'px;left:' + Math.round((W - BD) / 2) + 'px;top:' + Math.round(Math.max(70, (lineY - BD - 90) / 2 + 40)) + 'px;';
            bigEl.appendChild(coinSvg(c.type, false, BD)); field.appendChild(bigEl);
            api.after(40, function () { bigEl.classList.add('cns-bigcoin--show'); });
            info.style.top = Math.round(Math.max(70, (lineY - BD - 90) / 2 + 40) + BD + 14) + 'px';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3800, lines: [why, '銅色大＝50 元（往左）、銅色小＝5 元（往下）、銀色大＝10 元（往右）'] });
        }

        /* 驗證用：幫忙滑對／滑錯目前這枚（可以重複呼叫；solve 最多幫 SOLVE_CAP 枚） */
        api.solve = function () { if (over || !coin || coin.done || count >= SOLVE_CAP) return; swipe(DIR_OF[coin.type]); };
        api.wrong = function () { if (over || !coin || coin.done) return; swipe(DIR_OF[coin.type] === 'left' ? 'right' : 'left'); };
    }

    var G = {
        id: ID,
        name: '零錢入筒',
        rule: '硬幣一枚一枚掉下來，要在它掉到筒子口之前**用手指滑進對的筒**：**銅色的大硬幣（50 元）往左滑、銅色的小硬幣（5 元）往下滑、銀色的大硬幣（10 元）往右滑**，筒子上有箭頭提醒。滑錯方向、或來不及滑就結束，看你能分對幾枚。越後面，硬幣掉得越快、越常**背面朝上**（看不到數字，只能看顏色和大小），小硬幣也越來越接近大硬幣的大小！',
        mount: mount,
        score: SCORE,
        test: {
            prog: prog, fallMsFor: fallMsFor, backPFor: backPFor, ratio5For: ratio5For, diameterOf: diameterOf, classifySwipe: classifySwipe, nextCoin: nextCoin, isRight: isRight, whyText: whyText, rating: rating,
            RAMP_COINS: RAMP_COINS, FALL_S: FALL_S, BACK_P: BACK_P, RATIO5: RATIO5, SWIPE_MIN: SWIPE_MIN, HORIZ_K: HORIZ_K, COIN_D: COIN_D, MAX_SAME: MAX_SAME, SOLVE_CAP: SOLVE_CAP, TYPES: TYPES, COIN: COIN, DIR_OF: DIR_OF, TUBE_X: TUBE_X
        }
    };
    Reaction.register(G);
})();
