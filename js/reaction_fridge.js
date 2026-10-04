/* ═══════════════════════════════════════════════════════════════════
   reaction_fridge.js — 秒反應・冰箱歸位
   買菜回來，一樣一樣東西出現在畫面最上方的大格子裡，下面三顆答案按鈕：左上「冷藏室」、左下「冷凍庫」、
   右邊「櫥櫃（不用冰）」。有些東西很容易放錯（雞蛋要冷藏、洋蔥不用冰…）。
   ───────────────────────────────────────────────────────────────────
   · 物品資料表 FOODS 手工審校，**只放「未開封」且沒有爭議的物品**（開封後的醬油、蘋果、麵包這類不放）。
     每項 { name, zone, hue, icon, tricky, tip }：zone 是 'freeze'／'cool'／'pantry'；tricky＝反直覺。
   · 抽牌：不連續同一樣東西、同一區不連續超過 ZONE_RUN_MAX 張；反直覺的物品比例隨張數線性升高
     （TRICKY_START → TRICKY_END，第 1 → RAMP_N 張）。
   · 判定：點下面三顆按鈕（pointerdown），沒有滑動手勢。
   · 每張限時 3.0 → 1.2 秒（線性），有 LIVES 次機會，答錯或超時扣一次。成績＝連續放對的張數。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'fridge';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_N = 30;
    var TIME_START = 3.0, TIME_END = 1.2;
    var TRICKY_START = 0.10, TRICKY_END = 0.50;
    var ZONE_RUN_MAX = 3;
    var LIVES = 3;
    var NEXT_MS = 650;

    var ZONES = { freeze: '冷凍庫', cool: '冷藏室', pantry: '櫥櫃（不用冰）' };
    /* hue：圖示顏色；icon：圖示形狀；tricky：反直覺 */
    var FOODS = [
        /* 冷凍 */
        { name: '冰淇淋', zone: 'freeze', hue: 330, icon: 'cone' }, { name: '水餃', zone: 'freeze', hue: 40, icon: 'dumpling' },
        { name: '冷凍蝦仁', zone: 'freeze', hue: 15, icon: 'bag' }, { name: '冷凍薯條', zone: 'freeze', hue: 45, icon: 'bag' },
        { name: '湯圓', zone: 'freeze', hue: 340, icon: 'round', tricky: true, tip: '湯圓要冷凍保存' }, { name: '冷凍雞塊', zone: 'freeze', hue: 30, icon: 'bag' },
        { name: '冷凍玉米粒', zone: 'freeze', hue: 52, icon: 'bag' }, { name: '冷凍披薩', zone: 'freeze', hue: 20, icon: 'round' },
        { name: '魚丸', zone: 'freeze', hue: 200, icon: 'round' }, { name: '冰棒', zone: 'freeze', hue: 190, icon: 'stick' },
        /* 冷藏 */
        { name: '牛奶', zone: 'cool', hue: 210, icon: 'bottle' }, { name: '優格', zone: 'cool', hue: 280, icon: 'cup' },
        { name: '豆腐', zone: 'cool', hue: 50, icon: 'block' }, { name: '雞蛋', zone: 'cool', hue: 35, icon: 'egg', tricky: true, tip: '雞蛋放冷藏，保鮮比較久' },
        { name: '火腿', zone: 'cool', hue: 355, icon: 'stick' }, { name: '豆漿', zone: 'cool', hue: 48, icon: 'bottle' },
        { name: '鮮奶油', zone: 'cool', hue: 55, icon: 'cup' }, { name: '起司', zone: 'cool', hue: 48, icon: 'block' },
        { name: '納豆', zone: 'cool', hue: 28, icon: 'cup', tricky: true, tip: '納豆要冷藏' }, { name: '布丁', zone: 'cool', hue: 38, icon: 'cup' },
        { name: '奶油', zone: 'cool', hue: 55, icon: 'block' }, { name: '泡菜', zone: 'cool', hue: 5, icon: 'jar', tricky: true, tip: '泡菜是發酵食品，要冷藏' },
        { name: '養樂多', zone: 'cool', hue: 345, icon: 'bottle' }, { name: '鮮奶油蛋糕', zone: 'cool', hue: 330, icon: 'cake' },
        /* 櫥櫃 */
        { name: '白米', zone: 'pantry', hue: 45, icon: 'bag' }, { name: '乾麵條', zone: 'pantry', hue: 42, icon: 'bag' },
        { name: '罐頭', zone: 'pantry', hue: 0, icon: 'can' }, { name: '洋蔥', zone: 'pantry', hue: 30, icon: 'round', tricky: true, tip: '洋蔥怕潮濕，放通風陰涼處' },
        { name: '馬鈴薯', zone: 'pantry', hue: 36, icon: 'round', tricky: true, tip: '馬鈴薯放冰箱會變甜變色，放陰涼處' }, { name: '泡麵', zone: 'pantry', hue: 12, icon: 'bowl' },
        { name: '麵粉', zone: 'pantry', hue: 50, icon: 'bag' }, { name: '餅乾', zone: 'pantry', hue: 32, icon: 'box' },
        { name: '食用油', zone: 'pantry', hue: 50, icon: 'bottle' }, { name: '醬油', zone: 'pantry', hue: 20, icon: 'bottle', tricky: true, tip: '未開封的醬油放櫥櫃就好' },
        { name: '砂糖', zone: 'pantry', hue: 210, icon: 'bag' }, { name: '食鹽', zone: 'pantry', hue: 200, icon: 'jar' },
        { name: '地瓜', zone: 'pantry', hue: 18, icon: 'round', tricky: true, tip: '地瓜怕冷，放陰涼處' }, { name: '洋芋片', zone: 'pantry', hue: 48, icon: 'bag' }
    ];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 張'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function timeFor(n) { return kit.ramp(n, TIME_START, TIME_END, RAMP_N); }
    function trickyP(n) { return kit.ramp(n, TRICKY_START, TRICKY_END, RAMP_N); }
    /* 第 n 張（從 1 起算）要出哪一樣；history＝之前出過的物品陣列 */
    function nextFood(n, history, rand) {
        rand = rand || Math.random;
        var last = history.length ? history[history.length - 1] : null;
        var run = 0;
        for (var i = history.length - 1; i >= 0 && last && history[i].zone === last.zone; i--) run++;
        var wantTricky = rand() < trickyP(n);
        for (var tries = 0; tries < 100; tries++) {
            var pool = FOODS.filter(function (f) { return !!f.tricky === wantTricky; });
            var f = kit.pick(pool, rand);
            if (last && f.name === last.name) continue;
            if (last && run >= ZONE_RUN_MAX && f.zone === last.zone) continue;
            return f;
        }
        return FOODS[0];
    }
    /* 滑動向量 → 區域：上＝冷凍、左＝冷藏、右＝櫥櫃，往下＝null */
    function zoneFromDelta(dx, dy) {
        if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'pantry' : 'cool';
        return dy < 0 ? 'freeze' : null;
    }

    /* 圖示（viewBox 0 0 100 100）*/
    function drawIcon(icon, hue, parent) {
        var fill = 'hsl(' + hue + ',68%,60%)', dark = 'hsl(' + hue + ',55%,32%)', light = 'hsl(' + hue + ',75%,82%)';
        var S = function (tag, a) { a = a || {}; if (a.fill === undefined && !a.stroke) a.fill = fill; if (a.stroke === undefined && a.fill !== 'none') { a.stroke = dark; a['stroke-width'] = 3; a['stroke-linejoin'] = 'round'; } return kit.svg(tag, a, parent); };
        if (icon === 'bottle') { S('rect', { x: 34, y: 34, width: 32, height: 58, rx: 8 }); S('rect', { x: 42, y: 14, width: 16, height: 22, rx: 3, fill: light }); S('rect', { x: 40, y: 8, width: 20, height: 9, rx: 3, fill: dark }); }
        else if (icon === 'box') { S('rect', { x: 18, y: 22, width: 64, height: 66, rx: 6 }); S('line', { x1: 18, y1: 40, x2: 82, y2: 40, stroke: dark, 'stroke-width': 3 }); S('circle', { cx: 50, cy: 64, r: 12, fill: light }); }
        else if (icon === 'can') { S('rect', { x: 24, y: 24, width: 52, height: 60, rx: 6 }); S('ellipse', { cx: 50, cy: 24, rx: 26, ry: 8, fill: light }); S('rect', { x: 24, y: 44, width: 52, height: 22, fill: light, stroke: 'none' }); }
        else if (icon === 'bag') { S('path', { d: 'M24 26 L76 26 L82 90 L18 90 Z' }); S('path', { d: 'M24 26 L30 14 L38 24 L46 14 L54 24 L62 14 L70 24 L76 26', fill: light }); S('circle', { cx: 50, cy: 58, r: 14, fill: light }); }
        else if (icon === 'egg') { S('ellipse', { cx: 50, cy: 56, rx: 26, ry: 34, fill: 'hsl(36,60%,90%)' }); S('ellipse', { cx: 42, cy: 42, rx: 6, ry: 10, fill: 'rgba(255,255,255,0.7)', stroke: 'none' }); }
        else if (icon === 'round') { S('circle', { cx: 50, cy: 54, r: 34 }); S('ellipse', { cx: 38, cy: 40, rx: 9, ry: 6, fill: 'rgba(255,255,255,0.55)', stroke: 'none' }); }
        else if (icon === 'block') { S('rect', { x: 16, y: 34, width: 68, height: 42, rx: 8 }); S('rect', { x: 16, y: 34, width: 68, height: 12, rx: 8, fill: light }); }
        else if (icon === 'cup') { S('path', { d: 'M24 30 L76 30 L68 88 L32 88 Z' }); S('rect', { x: 20, y: 22, width: 60, height: 10, rx: 4, fill: light }); }
        else if (icon === 'jar') { S('rect', { x: 26, y: 30, width: 48, height: 58, rx: 12 }); S('rect', { x: 30, y: 16, width: 40, height: 16, rx: 4, fill: dark }); S('rect', { x: 36, y: 46, width: 28, height: 26, rx: 6, fill: light }); }
        else if (icon === 'bowl') { S('path', { d: 'M14 46 L86 46 C 86 78, 66 90, 50 90 C 34 90, 14 78, 14 46 Z' }); S('path', { d: 'M34 36 C 28 28, 40 22, 34 12 M52 36 C 46 28, 58 22, 52 12 M70 36 C 64 28, 76 22, 70 12', fill: 'none', stroke: dark, 'stroke-width': 3, 'stroke-linecap': 'round' }); }
        else if (icon === 'stick') { S('rect', { x: 38, y: 12, width: 24, height: 60, rx: 12 }); S('rect', { x: 45, y: 68, width: 10, height: 24, rx: 3, fill: 'hsl(36,50%,70%)' }); }
        else if (icon === 'cone') { S('circle', { cx: 50, cy: 36, r: 22 }); S('polygon', { points: '30,52 70,52 50,92', fill: 'hsl(36,70%,66%)' }); }
        else if (icon === 'dumpling') { S('path', { d: 'M12 62 C 12 28, 88 28, 88 62 C 88 76, 70 84, 50 84 C 30 84, 12 76, 12 62 Z', fill: 'hsl(40,60%,92%)' }); S('path', { d: 'M24 46 L30 56 M38 40 L44 52 M52 38 L56 50 M66 40 L68 52', stroke: dark, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }); }
        else { /* cake */ S('rect', { x: 16, y: 52, width: 68, height: 34, rx: 6 }); S('rect', { x: 16, y: 52, width: 68, height: 12, rx: 6, fill: light }); S('circle', { cx: 50, cy: 42, r: 9, fill: 'hsl(0,75%,52%)' }); }
    }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var n = (startAt || 1) - 1, right = n, lives = LIVES, newRec = false, state = 'idle', history = [], cur = null, cardId = 0;

            var head = h('div', { 'class': 'fg-head' });
            var zCool = h('button', { 'class': 'fg-zone fg-zone--cool' }, [h('span', { 'class': 'fg-zone__v', text: ZONES.cool })]);
            var zFreeze = h('button', { 'class': 'fg-zone fg-zone--freeze' }, [h('span', { 'class': 'fg-zone__v', text: ZONES.freeze })]);
            var zPantry = h('button', { 'class': 'fg-zone fg-zone--pantry' }, [h('span', { 'class': 'fg-zone__v', text: '櫥櫃' }), h('span', { 'class': 'fg-zone__v fg-zone__v--sm', text: '不用冰' })]);
            var arena = h('div', { 'class': 'fg-arena' });
            var card = h('div', { 'class': 'fg-card' });
            var tb = kit.timebar();
            var tip = h('div', { 'class': 'fg-tip' });
            arena.appendChild(card);
            var answers = h('div', { 'class': 'fg-answers' }, [h('div', { 'class': 'fg-col' }, [zCool, zFreeze]), zPantry]);
            [head, arena, tb.el, tip, answers].forEach(function (x) { root.appendChild(x); });
            var zEl = { freeze: zFreeze, cool: zCool, pantry: zPantry };

            function meta() { ctx.setMeta(kit.meta(['連對 ' + right, '機會 ' + lives])); }

            function nextCard() {
                if (my.dead) return;
                n++;
                var id = ++cardId;
                cur = nextFood(n, history);
                history.push(cur);
                try { console.info('[冰箱歸位] 第 ' + n + ' 張：' + cur.name + ' → ' + ZONES[cur.zone] + (cur.tricky ? '（反直覺）' : '') + '；限時 ' + timeFor(n).toFixed(2) + ' 秒；反直覺機率 ' + trickyP(n).toFixed(2)); } catch (e) { }
                head.textContent = '第 ' + n + ' 張';
                tip.textContent = '';
                card.innerHTML = '';
                card.className = 'fg-card';
                var svg = kit.svg('svg', { 'class': 'fg-icon', viewBox: '0 0 100 100' }, card);
                drawIcon(cur.icon, cur.hue, svg);
                card.appendChild(h('div', { 'class': 'fg-name', text: cur.name }));
                state = 'ask';
                meta();
                var t0 = performance.now(), lim = timeFor(n) * 1000;
                my.loop(function (now) { if (id !== cardId || state !== 'ask') return false; tb.set(1 - (now - t0) / lim); });
                my.after(lim, function () { if (id === cardId && state === 'ask') judge(null); });
            }

            function judge(zone) {
                if (state !== 'ask') return;
                state = 'reveal';
                tb.set(0);
                var ok = zone === cur.zone;
                Object.keys(zEl).forEach(function (k) { zEl[k].classList.remove('fg-zone--ok', 'fg-zone--bad'); });
                zEl[cur.zone].classList.add('fg-zone--ok');
                if (ok) {
                    right++;
                    card.classList.add('fg-card--ok');
                    Sfx.play('ok');
                    if (Reaction.setBest(ID, right, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    my.after(NEXT_MS, function () { Object.keys(zEl).forEach(function (k) { zEl[k].classList.remove('fg-zone--ok', 'fg-zone--bad'); }); nextCard(); });
                    return;
                }
                lives--;
                if (zone) zEl[zone].classList.add('fg-zone--bad');
                card.classList.add('fg-card--bad');
                Sfx.play('bad');
                tip.textContent = (zone == null ? '時間到！' : '放錯了…') + cur.name + '要放' + ZONES[cur.zone] + (cur.tip ? '（' + cur.tip + '）' : '');
                meta();
                if (lives <= 0) {
                    my.after(1800, function () {
                        var back = kit.resumeFrom(n);
                        kit.result(root, {
                            num: right + ' 張', label: right >= 20 ? '收納高手！' : (right >= 10 ? '很會整理！' : '再試一次，會更快！'),
                            lines: [cur.name + '要放' + ZONES[cur.zone] + (cur.tip ? '：' + cur.tip : '')],
                            isNew: newRec, sfx: right >= 10 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else {
                    my.after(1700, function () { Object.keys(zEl).forEach(function (k) { zEl[k].classList.remove('fg-zone--ok', 'fg-zone--bad'); }); nextCard(); });
                }
            }

            Object.keys(zEl).forEach(function (k) { zEl[k].addEventListener('pointerdown', function (e) { e.preventDefault(); judge(k); }); });

            G.debug = {
                state: function () { return { n: n, state: state, right: right, lives: lives, cur: cur }; },
                answerRight: function () { judge(cur.zone); return state; },
                answerWrong: function () { judge(cur.zone === 'cool' ? 'pantry' : 'cool'); return state; }
            };
            my.after(400, nextCard);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '冰箱歸位',
        rule: '買菜回來，東西一樣一樣出現在上面的大格子裡。下面有三顆按鈕：左上「冷藏室」、左下「冷凍庫」、右邊「櫥櫃（不用冰）」，點一下把東西放進去。有些東西很容易放錯，要在時間內放對喔！',
        mount: mount,
        test: { FOODS: FOODS, ZONES: ZONES, timeFor: timeFor, trickyP: trickyP, nextFood: nextFood, zoneFromDelta: zoneFromDelta, ZONE_RUN_MAX: ZONE_RUN_MAX, RAMP_N: RAMP_N }
    };
    Reaction.register(G);
})();
