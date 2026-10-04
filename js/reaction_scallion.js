/* ═══════════════════════════════════════════════════════════════════
   reaction_scallion.js — 秒反應・切蔥花
   蔥條從右邊慢慢往前送，刀子在畫面右邊 1/3 的位置，左邊留出一大片空間讓蔥片噴出去。每點一下就切一刀，20 秒內看你能切成最多段。
   只有一次機會，不管切得均不均勻，只比段數。
   ───────────────────────────────────────────────────────────────────
   · 蔥條位置是時間的純函式 posAt(t)：速度每 SEG_S 秒換一個（BASE_V × 0.65～1.35 的隨機倍率），
     所以蔥條「忽快忽慢」，不能只靠固定節奏狂點。
   · 切一刀：刀子需要冷卻 CUT_CD 秒（真的刀子也要抬起再落下）——冷卻內的點擊無效；
     從上一刀到這一刀之間蔥條前進的長度 ≥ MIN_LEN 才算一段（太碎的不算）。
   · 計時從第一次點擊開始，DURATION 秒到就結束；成績＝切成幾段（越多越好）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'scallion';
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var DURATION = 20;           /* 一局幾秒 */
    var BASE_V = 150;            /* 基本速度（px/秒） */
    var V_LO = 0.65, V_HI = 1.35;/* 每一段速度的隨機倍率範圍 */
    var SEG_S = 1.5;             /* 速度每幾秒換一次 */
    var CUT_CD = 0.12;           /* 刀子冷卻（秒） */
    var MIN_LEN = 8;             /* 至少前進幾 px 才算一段 */
    var KNIFE_FRAC = 0.66;       /* 刀子的位置：場地寬度的幾分之幾（右邊 1/3，左邊留給噴出去的蔥片）*/
    var FLY_MS = 760;            /* 蔥片飛出去的時間（毫秒）：慢一點才看得清楚，不會一團亂 */
    var FADE_AFTER = 14;         /* 落地之後，比最新的舊超過幾片的蔥花就變淡 */
    var BAR_H = 44;              /* 蔥條粗細 */
    var PILE_MAX = 42;           /* 畫面上最多留幾片蔥花 */

    /* 最佳紀錄顯示文字 */
    function fmtBest(v) { return v == null ? '' : '最多 ' + v + ' 段'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 蔥條「忽快忽慢」：把整局切成每 1.5 秒一段，每段的速度是基本速度 × 隨機倍率（0.65～1.35） */
    /* 每一段的速度（px/秒），共 ceil(DURATION/SEG_S)+1 段 */
    function makeSpeeds(rand) {
        rand = rand || Math.random;
        /* 共幾段：總秒數 ÷ 每段秒數，無條件進位再多備 2 段保險 */
        var n = Math.ceil(DURATION / SEG_S) + 2, out = [];
        for (var i = 0; i < n; i++) out.push(BASE_V * kit.randFloat(V_LO, V_HI, rand));
        return out;
    }
    /* 蔥條在 tSec 秒時往前送了多遠＝每一段「速度×時間」的總和（分段等速的積分） */
    /* 蔥條往前送了多遠（px）：分段等速的積分 */
    function posAt(speeds, tSec) {
        if (tSec <= 0) return 0;
        /* Math.floor：已經完整走完幾段 */
        var full = Math.floor(tSec / SEG_S), p = 0;
        /* 前面完整的幾段：每段貢獻 速度 × 該段秒數 */
        for (var i = 0; i < full && i < speeds.length; i++) p += speeds[i] * SEG_S;
        /* 最後一段還沒走完的部分 */
        var rest = tSec - full * SEG_S;
        return p + (speeds[Math.min(full, speeds.length - 1)] * rest);
    }
    /* 刀子：tap(時間) 回傳這一刀切下的長度，沒切成（冷卻中或太短）就回傳 null */
    /* 切刀：tap(tSec) 回傳這一刀切下的長度（px），沒切成（冷卻中或太短）回傳 null */
    /* makeCutter：用「閉包」把狀態（上一刀的時間 lastT、位置 lastPos、段數 cuts）藏在函式內部，外面只能透過下面的 tap／cuts／head 使用 */
    function makeCutter(speeds) {
        var lastT = -1e9, lastPos = 0, cuts = 0;
        return {
            /* 冷卻中（距離上一刀不到 CUT_CD 秒）不算 */
            tap: function (tSec) {
                if (tSec - lastT < CUT_CD) return null;
                /* 長度＝這一刀的位置 − 上一刀的位置 */
                var p = posAt(speeds, tSec), len = p - lastPos;
                /* 太短（小於 MIN_LEN）不算一段 */
                if (len < MIN_LEN) return null;
                lastT = tSec; lastPos = p; cuts++;
                return len;
            },
            cuts: function () { return cuts; },
            /* 目前蔥條伸出刀口左邊的長度（畫面上用來移動蔥條） */
            head: function (tSec) { return posAt(speeds, tSec) - lastPos; }     /* 目前伸出刀口左邊多長 */
        };
    }
    /* 依段數給評語 */
    function rating(n) {
        if (n >= 130) return '神速刀工！';
        if (n >= 100) return '快刀手！';
        if (n >= 70) return '手很快！';
        return '再快一點就更厲害了！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局（這款只玩一局，成績是切成幾段） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* speeds 這局每段的速度；cutter 切刀；state 目前狀態（ready 等待開始/run 進行中/done 結束）；t0 開始時間；pile 畫面上的蔥花 */
            var speeds = makeSpeeds(), cutter = makeCutter(speeds), state = 'ready', t0 = 0, pile = [];
            /* 建立畫面元素：標題、計數、時間條、砧板（蔥、刀子、提示） */
            var head = h('div', { 'class': 'sl-head' });
            var count = h('div', { 'class': 'sl-count', text: '0' });
            var unit = h('div', { 'class': 'sl-unit', text: '段' });
            var top = h('div', { 'class': 'sl-top' }, [count, unit]);
            var tb = kit.timebar();
            var board = h('div', { 'class': 'sl-board' });
            var bar = h('div', { 'class': 'sl-bar' });
            var knife = h('div', { 'class': 'sl-knife' }, [h('div', { 'class': 'sl-knife__blade' }), h('div', { 'class': 'sl-knife__grip' })]);
            var hint = h('div', { 'class': 'sl-hint', text: '點一下開始！之後每點一下切一刀' });
            [bar, knife, hint].forEach(function (x) { board.appendChild(x); });
            [head, top, tb.el, board].forEach(function (x) { root.appendChild(x); });
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));
            head.textContent = '20 秒內切越多段越好';

            /* FW／FH 砧板的寬高；barY 蔥的垂直位置；KNIFE_X 刀子的水平位置（寬度的 66%＝右邊 1/3 處） */
            var FW = board.clientWidth, FH = board.clientHeight, barY = Math.round(FH * 0.30), KNIFE_X = Math.round(FW * KNIFE_FRAC);
            bar.style.top = barY + 'px'; bar.style.height = BAR_H + 'px';
            knife.style.left = KNIFE_X + 'px'; knife.style.top = (barY - 36) + 'px';
            /* 移動蔥條：蔥的左緣＝刀子位置 − 伸出長度，寬度加 400 讓右邊一直延伸到畫面外 */
            function placeBar(headLen) {
                bar.style.left = (KNIFE_X - headLen) + 'px';
                bar.style.width = (FW - (KNIFE_X - headLen) + 400) + 'px';
            }
            placeBar(0);

            /* my.loop：每個畫面更新一次——進行中就依時間移動蔥條、更新時間條 */
            my.loop(function (now) {
                if (state === 'done') return false;
                if (state === 'run') {
                    var t = (now - t0) / 1000;
                    placeBar(cutter.head(t));
                    tb.set(1 - t / DURATION);
                }
            });

            /* 蔥片噴出去：從刀子位置往左飛，落點散在整個左半邊，走拋物線（先往上跳再落下） */
            /* 蔥片往左邊噴出去：落點散在整個左半邊（離刀子 40～95% 的距離、高度從蔥條下方到場地底部），
               飛行路線是拋物線（先往上跳一下再落下），每一片的轉動角度不大，所以是「噴出去」而不是亂飛 */
            function spawnSlice(len) {
                var s = h('div', { 'class': 'sl-slice' });
                /* 蔥片寬度＝這一刀切下的長度（限制在 6～200px 之間） */
                var w = Math.max(6, Math.min(len, 200));
                s.style.width = w + 'px'; s.style.height = BAR_H + 'px';
                /* 一開始蔥片就在刀口左邊、蔥條的位置 */
                s.style.left = (KNIFE_X - w) + 'px'; s.style.top = barY + 'px';
                board.appendChild(s);
                /* reach：刀子左邊可以飛多遠；dx 是水平飛行距離（reach 的 40%～95%） */
                var reach = KNIFE_X - 36 - w;
                var dx = -(kit.randFloat(0.4, 0.95) * reach);
                /* landY 落地的高度（蔥條下方到砧板底部之間隨機） */
                var landY = kit.randFloat(barY + BAR_H + 24, FH - BAR_H - 14);
                /* dy 垂直位移；arc 往上跳的高度；rot 轉動角度 */
                var dy = landY - barY, arc = kit.randFloat(50, 130), rot = kit.randFloat(-35, 35);
                /* 動畫關鍵影格 frames：起點 → 42% 時的最高點 → 落地終點 */
                var frames = [
                    { transform: 'translate(0px,0px) rotate(0deg)', opacity: 1 },
                    { transform: 'translate(' + (dx * 0.5).toFixed(0) + 'px,' + (-arc).toFixed(0) + 'px) rotate(' + (rot * 0.5).toFixed(0) + 'deg)', opacity: 1, offset: 0.42 },
                    { transform: 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px) rotate(' + rot.toFixed(0) + 'deg)', opacity: 1 }
                ];
                /* element.animate 是瀏覽器內建的動畫 API；fill:'forwards' 表示動畫結束後停在終點。舊瀏覽器沒有這功能就直接放到終點 */
                if (s.animate) {
                    var an = s.animate(frames, { duration: FLY_MS, easing: 'ease-out', fill: 'forwards' });
                    /* 動畫結束時把終點位置寫進 style，之後元素才不會跳回原位 */
                    an.onfinish = function () { s.style.transform = frames[2].transform; };
                } else s.style.transform = frames[2].transform;
                pile.push(s);
                /* 舊的蔥花慢慢變淡、太多就移除，畫面才不會越切越亂 */
                /* 舊的蔥花慢慢變淡、太多就移除，畫面才不會越切越亂 */
                for (var i = 0; i < pile.length - FADE_AFTER; i++) pile[i].style.opacity = String(Math.max(0.18, 0.6 - (pile.length - FADE_AFTER - i) * 0.03));
                if (pile.length > PILE_MAX) { var old = pile.shift(); if (old.parentNode) old.parentNode.removeChild(old); }
            }

            /* cut：處理一次點擊（tMs 是事件時間） */
            function cut(tMs) {
                if (state === 'done') return;
                /* 第一次點擊＝開始遊戲，開始計時 */
                if (state === 'ready') {
                    state = 'run'; t0 = tMs; hint.hidden = true;
                    my.after(DURATION * 1000, finish);
                    Sfx.play('go');
                    return;
                }
                /* cutter.tap 回傳這一刀切的長度，null 表示沒切成 */
                var len = cutter.tap((tMs - t0) / 1000);
                if (len == null) return;
                /* 刀子往下壓一下的動畫（加 class，70 毫秒後移除） */
                knife.classList.add('sl-knife--down');
                my.after(70, function () { knife.classList.remove('sl-knife--down'); });
                spawnSlice(len);
                Sfx.play('click');
                count.textContent = String(cutter.cuts());
                placeBar(0);
            }

            /* finish：時間到，結算 */
            function finish() {
                if (state !== 'run') return;
                state = 'done';
                tb.set(0);
                var n = cutter.cuts();
                var isNew = Reaction.setBest(ID, n, function (v, b) { return v > b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                Sfx.play('done');
                /* 等 500 毫秒再顯示結算，讓玩家看到最後一刀 */
                my.after(500, function () {
                    kit.result(root, {
                        num: n + ' 段', label: rating(n),
                        lines: ['平均每秒切 ' + (n / DURATION).toFixed(1) + ' 刀'],
                        isNew: isNew, sfx: n >= 100 ? 'win' : (n >= 70 ? 'win' : 'neutral'), onAgain: round
                    });
                });
            }

            /* 點砧板任何位置都是切一刀 */
            board.addEventListener('pointerdown', function (e) { e.preventDefault(); cut(kit.evT(e)); });

            /* G.debug：測試用後門，mash 可以模擬連續點擊 */
            G.debug = {
                state: function () { return { state: state, cuts: cutter.cuts() }; },
                /* 從現在起每隔 gapMs 毫秒模擬點一下，共 n 下（用真正的時間戳）*/
                mash: function (n, gapMs) {
                    if (state === 'ready') cut(performance.now());
                    var base = state === 'run' ? t0 : performance.now();
                    for (var i = 1; i <= n; i++) cut(base + i * gapMs);
                    return cutter.cuts();
                },
                finish: finish
            };
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '切蔥花',
        rule: '蔥條會慢慢往前送，點一下就切一刀。20 秒內看你能切成幾段，段數越多越厲害！只有一次機會，不用在意切得整不整齊。',
        mount: mount,
        /* test 匯出純函式給 Node 自動測試 */
        test: { makeSpeeds: makeSpeeds, posAt: posAt, makeCutter: makeCutter, rating: rating, DURATION: DURATION, CUT_CD: CUT_CD, MIN_LEN: MIN_LEN, SEG_S: SEG_S, BASE_V: BASE_V, V_LO: V_LO, V_HI: V_HI }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
