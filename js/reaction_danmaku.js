/* ═══════════════════════════════════════════════════════════════════
   reaction_danmaku.js — 秒反應・彈幕找字（企劃 346）
   很多字從右往左飄過畫面（像影片上的彈幕），速度不一樣、有大有小。上方寫目標字「末」。**看到「末」就點它**，
   點錯（點到「未、木、本」）就結束；讓「末」飄出畫面也結束。成績＝點到幾個（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · 這是「持續進行」的遊戲：沒有關卡，一直玩到失敗為止（用 kit.run 的 scoreOf 把 S.score＝點到的個數當成績；每點對一個 S.score ＋ 1）。
     難度隨「已經點到幾個（hits）」增加（所有難度函式的輸入都是 hits）。
   · 每飄出一個字，有 TARGET_P（25%）的機率是目標字；而且**連續不會超過 MAX_GAP 個都不是目標**（不會太久都沒有目標）。其餘是目標字的形近字（SimilarChars 同一群）。
   · 形近字的字群隨 hits 更換：每點到 SEGMENT 個就換一個目標字（筆劃範圍越來越多：3～8 → 14～24），換的時候清掉畫面、停一下告訴你新的目標字。
   · 難度（隨 hits 線性，到 RAMP_HITS 個為止）：每秒出現的字 2 → 6 個（RATE）、飄過的速度 140 → 330 px／秒（SPEED）、目標字的大小 76 → 44 px（TARGET_PX）。
     干擾字的大小在 40～88 px 隨機，有的會重疊。
   · 點擊判定：點在離某個字中心最近、而且在它大小範圍內的那個字（重疊時取最近的）；點到的不是目標字就結束；點到空白處不算。
   · 結束時畫面暫停，畫面上所有目標字圈綠色，點錯的字圈紅色。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'danmaku';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 個', label: '點到幾個', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_HITS = 40;                         /* 點到幾個之後難度到頂 */
    var RATE = [2, 6];                          /* 每秒出現幾個字：0 個 → 到頂 */
    var SPEED = [140, 330];                     /* 字飄過畫面的速度（px／秒）：0 個 → 到頂（每個字再乘 0.75～1.25 的隨機倍率） */
    var TARGET_PX = [76, 44];                   /* 目標字的大小（px）：0 個 → 到頂 */
    var DECOY_PX = [40, 88];                    /* 干擾字的大小範圍（px） */
    var TARGET_P = 0.25, MAX_GAP = 5;           /* 每個字是目標字的機率；連續最多幾個不是目標字 */
    var SEGMENT = 8;                            /* 每點到幾個換一個目標字 */
    var STROKES_LO = [3, 14], STROKES_HI = [8, 24];     /* 目標字的字群平均筆劃範圍：0 個 → 到頂 */
    var INTERMISSION_MS = 1100;                 /* 換目標字時停多久 */
    var MIN_GROUP = 4;
    var SOLVE_CAP = 12;                         /* 驗證用：api.solve 最多幫你點到幾個（再多就讓目標字飄走，遊戲才會結束） */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(hits) { return Math.min(1, Math.max(0, hits / RAMP_HITS)); }
    function lerp(pair, p) { return pair[0] + (pair[1] - pair[0]) * p; }
    function rateFor(hits) { return lerp(RATE, prog(hits)); }
    function speedFor(hits) { return lerp(SPEED, prog(hits)); }
    function targetPx(hits) { return lerp(TARGET_PX, prog(hits)); }
    function strokeRange(hits) { var p = prog(hits); return [lerp(STROKES_LO, p), lerp(STROKES_HI, p)]; }
    function segmentOf(hits) { return Math.floor(hits / SEGMENT); }
    /* 下一個字是不是目標字：機率 TARGET_P；已經連續 MAX_GAP 個不是目標了，這個一定是 */
    function nextIsTarget(sinceTarget, rand) { return sinceTarget >= MAX_GAP || (rand || Math.random)() < TARGET_P; }
    /* 這一段（每 SEGMENT 個換一次）的目標字與干擾字：{ target, mates, group, strokes } */
    function pickTarget(hits, rand, avoid) {
        rand = rand || Math.random;
        var rg = strokeRange(hits), pool = SimilarChars.groups({ minSize: MIN_GROUP, minStrokes: rg[0], maxStrokes: rg[1] });
        if (!pool.length) pool = SimilarChars.groups({ minSize: MIN_GROUP });
        var g = kit.pick(pool, rand), target = kit.pick(g.chars, rand);
        if (avoid && g.chars.indexOf(avoid) >= 0 && pool.length > 1) { g = kit.pick(pool.filter(function (x) { return x.chars.indexOf(avoid) < 0; }), rand) || g; target = kit.pick(g.chars, rand); }
        return { target: target, mates: g.chars.filter(function (c) { return c !== target; }), group: g.chars, strokes: rg };
    }
    /* 生一個字的資料：{ ch, isTarget, size（px）, speed（px／秒）, lane（0～1，畫面高度的位置）} */
    function makeItem(hits, seg, sinceTarget, rand) {
        rand = rand || Math.random;
        var isT = nextIsTarget(sinceTarget, rand);
        return { ch: isT ? seg.target : kit.pick(seg.mates, rand), isTarget: isT, size: isT ? Math.round(targetPx(hits)) : Math.round(kit.randFloat(DECOY_PX[0], DECOY_PX[1], rand)), speed: speedFor(hits) * kit.randFloat(0.75, 1.25, rand), lane: rand() };
    }
    /* 點在 (x, y)：哪個字被點到（items 是 [{ x, y, size }]（中心位置）；回傳離中心最近、而且在「size 的 0.75 倍 + extra」範圍內的那個的編號，沒有回傳 −1） */
    function hitItem(items, x, y, extra) {
        var best = -1, bd = 1e9;
        items.forEach(function (it, i) { var d = Math.hypot(it.x - x, it.y - y); if (d <= it.size * 0.75 + (extra == null ? 12 : extra) && d < bd) { bd = d; best = i; } });
        return best;
    }
    function rating(n) {
        if (n >= 60) return '彈幕之王！';
        if (n >= 35) return '眼睛像雷達！';
        if (n >= 18) return '不錯喔！';
        if (n >= 8) return '再接再厲！';
        return '先看清楚目標字長什麼樣子！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'dmk-stage', resume: false,
            head: function () { return '彈幕找字'; },
            info: function (S) { return '點到 ' + S.score + ' 個'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 個'; },
            rating: rating,
            lines: function (S) { return ['一共點到 ' + S.score + ' 個目標字']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, hits = 0, seg = pickTarget(0, api.rand), since = 0, items = [], over = false, paused = false;
        api.info = { get hits() { return hits; }, get target() { return seg.target; } };
        S.score = 0; api.setInfo('點到 0 個');
        console.log('[彈幕找字] 目標「' + seg.target + '」，干擾 ' + seg.mates.join(''));

        var field = h('div', { 'class': 'dmk-field' });
        stage.appendChild(field);
        var goal = h('div', { 'class': 'dmk-goal' }, [h('span', { 'class': 'dmk-goal__t', text: '目標：' }), h('span', { 'class': 'dmk-goal__ch', text: seg.target })]);
        field.appendChild(goal);
        var info = h('div', { 'class': 'qz-note dmk-info', text: '' }); field.appendChild(info);
        var arena = h('div', { 'class': 'dmk-arena' }); field.appendChild(arena);
        var carry = 0, last = null;
        if (kit.once('danmaku.hint')) kit.hintOn(stage, null, { mode: 'tap', x: W * 0.5, y: H * 0.5, delay: 1200, text: '看到目標字就點它' });
        api.my.loop(function (now, dt) {
            if (!arena.isConnected) return false;
            if (over || paused) return;
            var d = Math.min(dt, 50) / 1000;
            carry += rateFor(hits) * d;
            while (carry >= 1) { carry -= 1; spawn(); }
            for (var i = items.length - 1; i >= 0; i--) {
                var it = items[i]; it.x -= it.data.speed * d;
                it.el.style.transform = 'translate(' + (it.x - it.data.size / 2).toFixed(1) + 'px,' + (it.y - it.data.size / 2).toFixed(1) + 'px)';
                if (it.x < -it.data.size) {                                                  /* 飄出畫面 */
                    items.splice(i, 1); it.el.remove();
                    if (it.data.isTarget) { miss(it); return; }
                }
            }
        });
        function spawn() {
            var data = makeItem(hits, seg, since, api.rand);
            since = data.isTarget ? 0 : since + 1;
            var el = h('div', { 'class': 'dmk-ch', text: data.ch }); el.style.cssText = 'width:' + data.size + 'px;height:' + data.size + 'px;font-size:' + Math.round(data.size * 0.86) + 'px;line-height:' + data.size + 'px;';
            arena.appendChild(el);
            var y = 60 + data.lane * (H - 120 - data.size / 2) + data.size / 2;
            items.push({ el: el, data: data, x: W + data.size, y: y });
        }
        kit.onTap(arena, function (e) {
            if (over || paused || api.over) return;
            var p = kit.localPt(e, arena), i = hitItem(items.map(function (it) { return { x: it.x, y: it.y, size: it.data.size }; }), p.x, p.y);
            if (i < 0) return;
            take(i);
        });
        function take(i) {
            var it = items[i];
            if (!it.data.isTarget) { wrong(it); return; }
            items.splice(i, 1); it.el.classList.add('dmk-ch--pop'); api.after(260, function () { it.el.remove(); });
            hits++; S.score = hits; api.setInfo('點到 ' + hits + ' 個'); Sfx.play('pop');
            if (hits % SEGMENT === 0) newTarget();
        }
        /* 每 SEGMENT 個換目標字：清掉畫面、停一下、告訴你新的目標字（筆劃越來越多） */
        function newTarget() {
            paused = true; items.forEach(function (it) { it.el.remove(); }); items = [];
            seg = pickTarget(hits, api.rand, seg.target); since = 0; carry = 0;
            info.textContent = '換目標字！新的是「' + seg.target + '」'; goal.querySelector('.dmk-goal__ch').textContent = seg.target; goal.classList.add('dmk-goal--new');
            api.after(INTERMISSION_MS, function () { paused = false; info.textContent = ''; goal.classList.remove('dmk-goal--new'); });
        }
        /* 結束：暫停，畫面上所有目標字圈綠色；點錯的字圈紅色 */
        function finish(msg, bad) {
            over = true;
            items.forEach(function (it) { it.el.classList.add(it.data.isTarget ? 'dmk-ch--target' : 'dmk-ch--dim'); });
            if (bad) bad.el.classList.add('dmk-ch--bad');
            info.textContent = msg;
            kit.flash(stage, false, api.my);
            api.fail({ delay: 3000, lines: [msg, '目標字是「' + seg.target + '」，形近字：' + seg.group.join('、')] });
        }
        function wrong(it) { finish('「' + it.data.ch + '」不是目標字「' + seg.target + '」！', it); }
        function miss() { finish('讓「' + seg.target + '」飄走了！', null); }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝點掉畫面上的目標字（最多到 SOLVE_CAP 個，之後讓目標字飄走遊戲才會結束）、wrong＝點一個干擾字 */
        api.solve = function () {
            if (over || paused) return;
            var idx;
            while (hits < SOLVE_CAP && !over && !paused && (idx = items.findIndex(function (it) { return it.data.isTarget && it.x < W - 10; })) >= 0) take(idx);         /* take 可能換目標字（把 items 清空），所以每次重新找 */
        };
        api.wrong = function () {
            if (over || paused) return;
            for (var i = items.length - 1; i >= 0; i--) if (!items[i].data.isTarget && items[i].x < W - 10) { take(i); return; }
        };
    }

    var G = {
        id: ID,
        name: '彈幕找字',
        rule: '很多字從右往左飄過畫面（像影片的彈幕），速度不一樣、有大有小，有的還會重疊。上方寫著目標字，**看到目標字就點它**。點錯（點到長得像的形近字）就結束，**讓目標字飄出畫面**也結束。成績是**一共點到幾個**，越多越好。每點到幾個會換一個目標字，字越來越複雜。越後面，字出現得越快、飄得越快、目標字越小！',
        mount: mount,
        score: SCORE,
        test: {
            rateFor: rateFor, speedFor: speedFor, targetPx: targetPx, strokeRange: strokeRange, segmentOf: segmentOf, nextIsTarget: nextIsTarget, pickTarget: pickTarget, makeItem: makeItem, hitItem: hitItem, rating: rating,
            RAMP_HITS: RAMP_HITS, RATE: RATE, SPEED: SPEED, TARGET_PX: TARGET_PX, DECOY_PX: DECOY_PX, TARGET_P: TARGET_P, MAX_GAP: MAX_GAP, SEGMENT: SEGMENT, STROKES_LO: STROKES_LO, STROKES_HI: STROKES_HI, MIN_GROUP: MIN_GROUP, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
