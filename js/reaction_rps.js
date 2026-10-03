/* ═══════════════════════════════════════════════════════════════════
   reaction_rps.js — 秒反應・猜拳必贏
   上面倒數 3、2、1，倒數完 2 秒內按下剪刀／石頭／布；電腦完全隨機出拳，贏了才能進下一關，
   看你的運氣能連贏幾關。
   ───────────────────────────────────────────────────────────────────
   · 電腦的拳在倒數開始之前就用亂數決定好（優先用 crypto.getRandomValues，沒有才用
     Math.random），之後不會因為玩家出什麼而改變，所以完全公平，沒有任何規律可以抓。
   · 流程：倒數 3、2、1（每個 COUNT_MS）→ 「出拳！」開始 2 秒時限 → 玩家按鈕（用 pointerdown）
     → 畫面上方分成上下兩半：上面是電腦、下面是你 → 公布輸贏。
   · 平手不算數，同一關重來（所以每關過關機率是 1/2，連贏 n 關的機率是 (1/2)^n，結算會告訴你）。
   · 輸了或 2 秒內沒出拳就結束。成績＝連贏幾關。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'rps';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var COUNT_MS = 750;            /* 倒數每個數字停留多久 */
    var WINDOW_MS = 2000;          /* 倒數完要在幾毫秒內出拳 */
    var REVEAL_MS = 1700;          /* 公布結果後多久進下一回合 */
    var KINDS = ['scissors', 'rock', 'paper'];
    var NAMES = { scissors: '剪刀', rock: '石頭', paper: '布' };

    function fmtBest(v) { return v == null ? '' : '最佳連贏 ' + v; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 0＝平手、1＝a 贏、-1＝b 贏 */
    function judge(a, b) {
        if (a === b) return 0;
        if ((a === 'scissors' && b === 'paper') || (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock')) return 1;
        return -1;
    }
    function randomKind() {
        var r;
        try {
            var arr = new Uint32Array(1);
            window.crypto.getRandomValues(arr);
            r = arr[0] % 3;
        } catch (e) { r = Math.floor(Math.random() * 3); }
        return KINDS[r];
    }
    function chanceText(n) {
        if (n <= 0) return '';
        var p = Math.pow(0.5, n) * 100;
        return '連贏 ' + n + ' 關的機率只有 ' + (p >= 1 ? p.toFixed(1) : p.toFixed(2)) + '%';
    }

    /* 手勢圖示（簡單向量圖，不用 emoji）：100×100 */
    function handIcon(kind, color) {
        var svg = kit.svg('svg', { 'class': 'rp-icon', viewBox: '0 0 100 100' });
        var st = { fill: color, stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
        function el(tag, attrs, parent) { var a = {}; for (var k in st) a[k] = st[k]; for (var k2 in attrs) a[k2] = attrs[k2]; return kit.svg(tag, a, parent || svg); }
        if (kind === 'rock') {
            el('rect', { x: 20, y: 28, width: 60, height: 52, rx: 20 });
            [37, 50, 63].forEach(function (x) { kit.svg('line', { x1: x, y1: 30, x2: x, y2: 46, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg); });
            el('ellipse', { cx: 36, cy: 70, rx: 18, ry: 10, transform: 'rotate(-15 36 70)' });
        } else if (kind === 'paper') {
            [[24, 22], [37, 12], [50, 8], [63, 14]].forEach(function (p) { el('rect', { x: p[0], y: p[1], width: 12, height: 46, rx: 6 }); });
            el('rect', { x: 22, y: 44, width: 56, height: 40, rx: 16 });
            el('rect', { x: 6, y: 50, width: 12, height: 32, rx: 6, transform: 'rotate(-35 12 66)' });
        } else {
            el('rect', { x: 28, y: 10, width: 13, height: 52, rx: 6.5, transform: 'rotate(-14 34 60)' });
            el('rect', { x: 58, y: 10, width: 13, height: 52, rx: 6.5, transform: 'rotate(14 65 60)' });
            el('rect', { x: 22, y: 50, width: 56, height: 36, rx: 16 });
            kit.svg('line', { x1: 40, y1: 64, x2: 40, y2: 74, stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
            kit.svg('line', { x1: 56, y1: 64, x2: 56, y2: 74, stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
        }
        return svg;
    }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            var wins = 0, newRec = false, rounds = 0, ties = 0, state = 'idle', comp = null;

            var top = h('div', { 'class': 'rp-top' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var btns = h('div', { 'class': 'rp-btns' });
            root.appendChild(top);
            root.appendChild(bar);
            root.appendChild(btns);
            var btnEls = {};
            KINDS.forEach(function (k) {
                var b = h('button', { 'class': 'rp-btn rp-btn--' + k }, [h('span', { 'class': 'rp-btn__ico' }), h('span', { 'class': 'rp-btn__txt', text: NAMES[k] })]);
                b.firstChild.appendChild(handIcon(k, '#FFE9B0'));
                b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(k, kit.evT(e)); });
                btns.appendChild(b);
                btnEls[k] = b;
            });

            function meta() { ctx.setMeta(kit.meta(['連贏 ' + wins, fmtBest(Reaction.getBest(ID))])); }
            function showTop(big, sub) {
                top.innerHTML = '';
                top.appendChild(h('div', { 'class': 'rp-big', text: big }));
                if (sub) top.appendChild(h('div', { 'class': 'rp-sub', text: sub }));
            }

            /* ─── 一回合：倒數 → 出拳時限 ─── */
            function play() {
                if (my.dead) return;
                comp = randomKind();             /* 先決定好，不受玩家影響 */
                state = 'count';
                rounds++;
                meta();
                fill.style.width = '100%';
                [].forEach.call(btns.children, function (b) { b.classList.remove('rp-btn--pick'); });
                try { console.info('[猜拳必贏] 第 ' + (wins + 1) + ' 關（第 ' + rounds + ' 回合）電腦已決定出：' + NAMES[comp] + '（完全隨機，與你無關）'); } catch (e) { }
                showTop('3', '第 ' + (wins + 1) + ' 關　倒數完 2 秒內出拳');
                Sfx.play('tick');
                my.after(COUNT_MS, function () { showTop('2', '第 ' + (wins + 1) + ' 關　倒數完 2 秒內出拳'); Sfx.play('tick'); });
                my.after(COUNT_MS * 2, function () { showTop('1', '第 ' + (wins + 1) + ' 關　倒數完 2 秒內出拳'); Sfx.play('tick'); });
                my.after(COUNT_MS * 3, openWindow);
            }
            function openWindow() {
                state = 'open';
                showTop('出拳！', '快按下面的按鈕');
                Sfx.play('go');
                var t0 = performance.now();
                var lp = my.loop(function (now) {
                    if (state !== 'open') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - t0) / WINDOW_MS)).toFixed(1) + '%';
                });
                R.winTimer = my.after(WINDOW_MS, function () { if (state === 'open') { lp.stop(); press(null, performance.now()); } });
                R.winLoop = lp;
            }

            function press(kind, t) {
                if (state === 'count') {
                    /* 倒數中太早按：提醒一下，不算 */
                    if (kind) { top.firstChild.classList.add('rp-big--shake'); my.after(300, function () { if (top.firstChild) top.firstChild.classList.remove('rp-big--shake'); }); }
                    return;
                }
                if (state !== 'open') return;
                state = 'reveal';
                my.cancel(R.winTimer); if (R.winLoop) R.winLoop.stop();
                fill.style.width = '0%';
                if (kind) btnEls[kind].classList.add('rp-btn--pick');
                reveal(kind);
            }

            function reveal(kind) {
                var res = kind ? judge(kind, comp) : -1;       /* 沒出拳＝輸 */
                top.innerHTML = '';
                var halfC = h('div', { 'class': 'rp-half rp-half--comp' }, [h('div', { 'class': 'rp-who', text: '電腦' }), handIcon(comp, '#F6A39B'), h('div', { 'class': 'rp-name', text: NAMES[comp] })]);
                var halfP = h('div', { 'class': 'rp-half rp-half--me' }, [h('div', { 'class': 'rp-who', text: '你' }), kind ? handIcon(kind, '#9CC3F0') : h('div', { 'class': 'rp-none', text: '沒出拳' }), h('div', { 'class': 'rp-name', text: kind ? NAMES[kind] : '來不及' })]);
                var banner = h('div', { 'class': 'rp-banner rp-banner--' + (res > 0 ? 'win' : (res < 0 ? 'lose' : 'tie')), text: res > 0 ? '你贏了！' : (res < 0 ? (kind ? '你輸了…' : '來不及出拳…') : '平手，重來') });
                top.appendChild(halfC); top.appendChild(halfP); top.appendChild(banner);
                if (res > 0) {
                    wins++;
                    if (Reaction.setBest(ID, wins, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    Sfx.play('win');
                    my.after(G.dev.reveal || REVEAL_MS, play);
                } else if (res === 0) {
                    ties++;
                    Sfx.play('click');
                    my.after(REVEAL_MS - 400, play);
                } else {
                    Sfx.play('bad');
                    state = 'over';
                    my.after(REVEAL_MS + 300, function () {
                        kit.result(root, {
                            num: wins + ' 關', label: wins >= 4 ? '運氣真好！' : '運氣差了一點',
                            lines: [chanceText(wins) || '第一關就輸了', '共出拳 ' + rounds + ' 回合（平手 ' + ties + ' 次）'],
                            note: '電腦完全隨機出拳，沒有任何規律',
                            isNew: newRec, sfx: wins >= 4 ? 'win' : 'fail', onAgain: round
                        });
                    });
                }
            }

            G.debug = {
                state: function () { return { wins: wins, state: state, comp: comp, ties: ties, rounds: rounds }; },
                press: function (k) { press(k, performance.now()); },
                /* 測試用：指定電腦這回合出什麼 */
                setComp: function (k) { comp = k; },
                beat: function () { return KINDS.find(function (k) { return judge(k, comp) > 0; }); },
                lose: function () { return KINDS.find(function (k) { return judge(k, comp) < 0; }); }
            };
            my.after(500, play);
        }

        round();
    }

    var G = {
        id: ID,
        name: '猜拳必贏',
        rule: '上面倒數 3、2、1，倒數完 2 秒內按下「剪刀／石頭／布」。電腦完全隨機出拳，贏了才能進下一關，平手重來。這是純靠運氣的遊戲，看看你能連贏幾關！',
        mount: mount,
        dev: { reveal: null },          /* 開發驗證用：延長公布結果的停留時間 */
        test: { judge: judge, randomKind: randomKind, chanceText: chanceText, KINDS: KINDS }
    };
    Reaction.register(G);
})();
