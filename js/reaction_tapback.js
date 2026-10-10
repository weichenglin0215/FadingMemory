/* ═══════════════════════════════════════════════════════════════════
   reaction_tapback.js — 秒反應・倒著點（企劃 168）
   畫面上有幾個圓點的位置（淡淡的圓圈），圓點會一個一個依序亮起來（位置隨機），
   亮完之後，要「倒著」把它們依序點回去（最後亮的最先點）。是「倒背數字」的位置版。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 難度線性：要記的圓點數 3 個 → 8 個（每 LEN_EVERY 關多 1 個，到第 (8−3)×LEN_EVERY+1 關到頂）；
     圓點到頂之後靠「亮得更快」繼續變難：每個圓點亮起的時間 FLASH_MS 800 → 350 毫秒（SPEED_LEVELS 關走到頂）。
   · 出題（規範 Q1、Q15）：先決定「位置」——每個位置離邊緣至少 MARGIN、任兩個位置圓心至少相距 MIN_GAP（手指點得到、不會點到隔壁），
     再決定順序（隨機排列）；所以玩家一定辦得到。
   · 位置的小圓圈一開始就全部畫出來（淡淡的），玩家要記的是「順序」，不是要憑空記座標。
   · 按對時那個圓圈會變綠；按錯馬上結束，並把正確的倒著順序標上數字（1 最先點）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'tapback';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEN = [3, 8];                           /* 要記幾個圓點：第 1 關 → 最多 */
    var LEN_EVERY = 2;                          /* 每幾關多記 1 個 */
    var SPEED_LEVELS = 30;                      /* 亮得更快的難度幾關之後到頂 */
    var FLASH_MS = [800, 350];                  /* 每個圓點亮起的時間（毫秒）：第 1 關 → 到頂 */
    var GAP_MS = [260, 120];                    /* 兩個圓點之間的空檔（毫秒）：第 1 關 → 到頂 */
    var ANS_BASE = 3000, ANS_PER = 1200;        /* 作答限時（毫秒）＝ (ANS_BASE ＋ ANS_PER × 圓點數) × 倍率 */
    var ANS_MUL = [1.2, 0.85];                  /* 倍率：第 1 關 → 到頂 */
    var MARGIN = 54;                            /* 圓點離遊戲區邊緣至少多遠 */
    var MIN_GAP = 104;                          /* 任兩個圓點圓心至少相距多少 */
    var DOT_R = 38;                             /* 圓圈的半徑（命中範圍也是這個大小） */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function lenFor(level) { return Math.min(LEN[1], LEN[0] + Math.floor((level - 1) / LEN_EVERY)); }
    function flashMs(level) { return Math.round(kit.ramp(level, FLASH_MS[0], FLASH_MS[1], SPEED_LEVELS)); }
    function gapMs(level) { return Math.round(kit.ramp(level, GAP_MS[0], GAP_MS[1], SPEED_LEVELS)); }
    function ansMs(level) { return Math.round((ANS_BASE + ANS_PER * lenFor(level)) * kit.ramp(level, ANS_MUL[0], ANS_MUL[1], SPEED_LEVELS)); }
    /* 出一關：{ pts:[{x,y}]（每個位置）, order（亮起的順序，pts 的索引）, back（要點的順序＝order 倒過來） } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var n = lenFor(level);
        for (var tr = 0; tr < 300; tr++) {
            var pts = [], guard = 0;
            while (pts.length < n && guard++ < 2000) {
                var x = kit.randFloat(MARGIN, W - MARGIN, rand), y = kit.randFloat(MARGIN, H - MARGIN, rand);
                if (pts.every(function (p) { return kit.dist(x, y, p.x, p.y) >= MIN_GAP; })) pts.push({ x: x, y: y });
            }
            if (pts.length < n) continue;
            var idx = []; for (var i = 0; i < n; i++) idx.push(i);
            var order = kit.shuffle(idx, rand);
            return { pts: pts, order: order, back: order.slice().reverse() };
        }
        var fb = []; for (var k = 0; k < n; k++) fb.push({ x: MARGIN + 30 + (k % 3) * 130, y: MARGIN + 30 + Math.floor(k / 3) * 130 });
        var o = fb.map(function (p, j) { return j; });
        return { pts: fb, order: o, back: o.slice().reverse() };
    }
    function rating(n) {
        if (n >= 25) return '倒背如流！';
        if (n >= 15) return '空間記憶力很強！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先記順序，再倒著想一遍，再來一次！';
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
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - 60;
        var q = makeLevel(level, W, H, api.rand);
        api.info = q;
        console.log('[倒著點] 第 ' + level + ' 關：' + q.pts.length + ' 個圓點；亮起順序 ' + q.order.map(function (i) { return i + 1; }).join('→') + '；要點的順序 ' + q.back.map(function (i) { return i + 1; }).join('→') + '；每個亮 ' + flashMs(level) + ' ms，限時 ' + ansMs(level) + ' ms');

        var tip = h('div', { 'class': 'qz-note tbk-tip', text: '請看圓點依序亮起來，記住順序' });
        stage.appendChild(tip);
        var rings = q.pts.map(function (p) {
            var r = h('div', { 'class': 'tbk-ring' });
            r.style.left = (p.x - DOT_R) + 'px'; r.style.top = (p.y + 54 - DOT_R) + 'px';
            r.style.width = r.style.height = (2 * DOT_R) + 'px';
            stage.appendChild(r);
            return r;
        });
        var phase = 'show', next = 0, picks = [];
        var t = 700, fl = flashMs(level), gp = gapMs(level);
        q.order.forEach(function (pi) {
            api.after(t, function () { rings[pi].classList.add('tbk-ring--on'); Sfx.play('tick'); });
            api.after(t + fl, function () { rings[pi].classList.remove('tbk-ring--on'); });
            t += fl + gp;
        });
        api.after(t + 100, function () {
            phase = 'tap';
            tip.textContent = '現在請「倒著」點回去：最後亮的最先點';
            api.timer(ansMs(level), function () { reveal(null); });
            if (level === 1 && kit.once('tapback.hint')) kit.hintOn(stage, rings[q.back[0]], { mode: 'tap', delay: 500, text: '請點擊最後亮起的圓點' });
        });
        rings.forEach(function (r, i) {
            kit.onTap(r, function () {
                if (api.over || phase !== 'tap') return;
                if (picks.indexOf(i) >= 0) return;
                if (i !== q.back[next]) { reveal(i); return; }
                picks.push(i); next++;
                r.classList.add('tbk-ring--ok'); Sfx.play('ok');
                if (next >= q.back.length) { phase = 'done'; reveal('ok'); }
            });
        });
        /* 揭曉：每個圓圈寫上「要點的第幾個」（1 最先點） */
        function reveal(i) {
            if (api.over) return;
            phase = 'done';
            q.back.forEach(function (pi, k) { rings[pi].textContent = String(k + 1); rings[pi].classList.add('tbk-ring--num'); });
            if (i === 'ok') { tip.textContent = '全部點對了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); return; }
            if (typeof i === 'number') rings[i].classList.add('tbk-ring--wrong');
            tip.textContent = '正確的倒著順序已標上數字（1 最先點）';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2500, lines: [
                (i == null ? '時間到！' : '點錯了') + '，要「倒著」點回去：最後亮的最先點',
                '圓圈上的數字就是正確的點擊順序（1 最先點）'
            ] });
        }
        api.solve = function () { if (phase !== 'tap') return; q.back.forEach(function (pi) { rings[pi].classList.add('tbk-ring--ok'); }); phase = 'done'; reveal('ok'); };
        api.wrong = function () { if (phase !== 'tap') return; reveal(q.back[1]); };      /* 第一個該點的是 back[0]，點 back[1] 就是錯的 */
    }

    var G = {
        id: ID,
        name: '倒著點',
        rule: '畫面上有幾個圓圈，圓圈會一個一個依序亮起來。亮完之後，請「倒著」把它們依序點回去：最後亮的最先點。點錯或來不及就結束，看你能過幾關。越後面，圓圈越多、亮得越快！',
        mount: mount,
        score: SCORE,
        test: {
            lenFor: lenFor, flashMs: flashMs, gapMs: gapMs, ansMs: ansMs, makeLevel: makeLevel, rating: rating,
            LEN: LEN, LEN_EVERY: LEN_EVERY, SPEED_LEVELS: SPEED_LEVELS, MARGIN: MARGIN, MIN_GAP: MIN_GAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
