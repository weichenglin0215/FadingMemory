/* ═══════════════════════════════════════════════════════════════════
   reaction_passersby.js — 秒反應・路人走過
   5 個人不等間距地從畫面左邊走進來、從右邊走出去；每個人的帽子、衣服、褲子、鞋子都是七種顏色
   （紅橙黃綠藍紫粉紅）之一。5 個人都走完之後出現題目：「第 X 個人的〔衣服〕是什麼顏色？」，
   從 7 個色塊（附文字名稱）選一個。關卡制，答錯或逾時就結束，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 每個人的四件衣物顏色互不相同；不同人之間可以重複（增加混淆）。
   · 走路速度 SPEED 150→400 px/秒、平均進場間隔 GAP 1.4→0.5 秒（每個間隔再乘 0.6～1.4 的隨機倍率）、
     作答限時 ANS 8→4 秒（線性，RAMP_LEVELS 關走完）。
   · 問的部位：第 1～3 關只問衣服、第 4～6 關衣服或褲子、第 7～9 關加鞋子、第 10 關起四種都問。
   · 兩個人之間至少隔 MIN_SPACE px，不會重疊。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'passersby';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 15;                       /* 幾關之後難度到頂（也是最後一關） */
    var SPEED = [150, 400];                     /* 走路速度（px／秒） */
    var GAP = [1.4, 0.5];                       /* 平均進場間隔（秒） */
    var ANS_S = [8, 4];                         /* 作答限時（秒） */
    var JITTER = [0.6, 1.4];                    /* 間隔的隨機倍率 */
    var PEOPLE = 5, PW = 70, MIN_SPACE = 80;    /* 人數、人的寬度（px）、兩人最小距離 */
    var COLORS = [
        { name: '紅', hex: '#D9423A' }, { name: '橙', hex: '#F0892B' }, { name: '黃', hex: '#EAC12B' }, { name: '綠', hex: '#4C9A5B' },
        { name: '藍', hex: '#3E86C4' }, { name: '紫', hex: '#8A5CC4' }, { name: '粉紅', hex: '#EE86B4' }
    ];
    var PARTS = ['hat', 'shirt', 'pants', 'shoes'];
    var PART_NAME = { hat: '帽子', shirt: '衣服', pants: '褲子', shoes: '鞋子' };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function speedAt(level) { return kit.ramp(level, SPEED[0], SPEED[1], RAMP_LEVELS); }
    function gapAt(level) { return kit.ramp(level, GAP[0], GAP[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }
    function partsFor(level) {
        if (level <= 3) return ['shirt'];
        if (level <= 6) return ['shirt', 'pants'];
        if (level <= 9) return ['shirt', 'pants', 'shoes'];
        return PARTS;
    }
    /* 出題：回傳 { people: [{hat, shirt, pants, shoes（顏色索引）, t（進場時間，秒）}], who（1～5）, part, answer（顏色索引）, duration（全部走完的秒數）} */
    function makeLevel(level, rand, W) {
        rand = rand || Math.random; W = W || 472;
        var sp = speedAt(level), gap = gapAt(level), people = [], t = 0;
        for (var i = 0; i < PEOPLE; i++) {
            var cols = kit.shuffle([0, 1, 2, 3, 4, 5, 6], rand).slice(0, 4);
            if (i > 0) t += Math.max(MIN_SPACE / sp, gap * kit.randFloat(JITTER[0], JITTER[1], rand));
            people.push({ hat: cols[0], shirt: cols[1], pants: cols[2], shoes: cols[3], t: t });
        }
        var who = kit.randInt(1, PEOPLE, rand), part = kit.pick(partsFor(level), rand);
        return { people: people, who: who, part: part, answer: people[who - 1][part], duration: people[PEOPLE - 1].t + (W + PW) / sp, speed: sp };
    }
    /* 第 i 個人在時刻 sec（秒）的 x 座標（左緣） */
    function xAt(q, i, sec) { return -PW + q.speed * (sec - q.people[i].t); }
    function question(q) { return '第 ' + q.who + ' 個人的' + PART_NAME[q.part] + '是什麼顏色？'; }
    function rating(n) {
        if (n >= 15) return '過目不忘！全部通關！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看仔細一點，再來一次！';
    }
    /* 一個小人的 SVG（70×160）：帽子、頭、衣服、褲子、鞋子各一種顏色 */
    function personSvg(p, hi) {
        var c = function (k) { return COLORS[p[k]].hex; };
        var ring = function (k) { return hi === k ? ' stroke="#4A3B1E" stroke-width="5" stroke-dasharray="6 4"' : ' stroke="#4A3B1E" stroke-width="2.5"'; };
        return '<svg viewBox="0 0 70 160" width="70" height="160" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="16" y="6" width="38" height="16" rx="6" fill="' + c('hat') + '"' + ring('hat') + '/><rect x="10" y="20" width="50" height="6" rx="3" fill="' + c('hat') + '"' + ring('hat') + '/>' +
            '<circle cx="35" cy="38" r="13" fill="#F2D3B0" stroke="#4A3B1E" stroke-width="2.5"/>' +
            '<rect x="14" y="54" width="42" height="46" rx="10" fill="' + c('shirt') + '"' + ring('shirt') + '/>' +
            '<rect x="16" y="98" width="17" height="42" rx="5" fill="' + c('pants') + '"' + ring('pants') + '/><rect x="37" y="98" width="17" height="42" rx="5" fill="' + c('pants') + '"' + ring('pants') + '/>' +
            '<ellipse cx="24" cy="146" rx="12" ry="7" fill="' + c('shoes') + '"' + ring('shoes') + '/><ellipse cx="46" cy="146" rx="12" ry="7" fill="' + c('shoes') + '"' + ring('shoes') + '/></svg>';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, W = stage.clientWidth || 472;
        var q = makeLevel(level, api.rand, W), phase = 'walk', t0 = performance.now();
        api.info = q;
        console.log('[路人走過] 第 ' + level + ' 關：' + question(q) + ' 答案 ' + COLORS[q.answer].name + '；速度 ' + q.speed.toFixed(1) + ' px/秒；走完 ' + q.duration.toFixed(2) + ' 秒；5 人：' + q.people.map(function (p) { return PARTS.map(function (k) { return COLORS[p[k]].name; }).join('/'); }).join(' | '));

        var tip = h('div', { 'class': 'pb-tip', text: '看清楚每個人的穿著（帽子、衣服、褲子、鞋子）' });
        stage.appendChild(tip);
        var els = q.people.map(function (p) {
            var el = h('div', { 'class': 'pb-person', html: personSvg(p) });
            el.style.transform = 'translateX(' + (-PW - 10) + 'px)';
            stage.appendChild(el);
            return el;
        });
        var loop = api.my.loop(function () {
            if (phase !== 'walk' || api.over) return false;
            var sec = (performance.now() - t0) / 1000;
            els.forEach(function (el, i) { el.style.transform = 'translateX(' + xAt(q, i, sec).toFixed(1) + 'px)'; });
        });
        api.after(Math.round(q.duration * 1000) + 120, ask);

        var btns = [];
        function ask() {
            if (phase !== 'walk') return;
            phase = 'ask'; loop.stop();
            els.forEach(function (el) { el.style.display = 'none'; });
            tip.textContent = question(q); tip.classList.add('pb-tip--ask');
            btns = COLORS.map(function (c, i) {
                var b = h('button', { 'class': 'btn btn--line pb-opt' }, [h('span', { 'class': 'pb-sw' }), h('span', { text: c.name })]);
                b.firstChild.style.background = c.hex;
                kit.onTap(b, function () { judge(i); });
                return b;
            });
            var row1 = h('div', { 'class': 'pb-row' }, btns.slice(0, 4)), row2 = h('div', { 'class': 'pb-row' }, btns.slice(4));
            stage.appendChild(h('div', { 'class': 'pb-opts' }, [row1, row2]));
            api.timer(ansMs(level), function () { judge(-1); });
            Sfx.play('go');
        }
        function judge(i) {
            if (api.over || phase !== 'ask') return;
            phase = 'done';
            btns.forEach(function (b, k) { if (k === q.answer) b.classList.add('pb-opt--ok'); else if (k === i) b.classList.add('pb-opt--bad'); });
            /* 揭曉：5 個人站成一排，被問的那一件用虛線框起來 */
            var lineup = h('div', { 'class': 'pb-lineup' });
            q.people.forEach(function (p, k) {
                var cell = h('div', { 'class': 'pb-cell' + (k === q.who - 1 ? ' pb-cell--ask' : ''), html: personSvg(p, k === q.who - 1 ? q.part : null) });
                cell.appendChild(h('div', { 'class': 'pb-no', text: String(k + 1) }));
                lineup.appendChild(cell);
            });
            stage.appendChild(lineup);
            tip.textContent = '第 ' + q.who + ' 個人的' + PART_NAME[q.part] + '是' + COLORS[q.answer].name + '色';
            if (i === q.answer) api.pass({ delay: 1300 });
            else api.fail({ delay: 2300, lines: [
                (i < 0 ? '時間到！' : '答錯了：你選「' + COLORS[i].name + '」，') + '第 ' + q.who + ' 個人的' + PART_NAME[q.part] + '是「' + COLORS[q.answer].name + '」',
                '五個人（由左到右）的' + PART_NAME[q.part] + '：' + q.people.map(function (p) { return COLORS[p[q.part]].name; }).join('、')
            ] });
        }
        api.solve = function () { if (phase === 'walk') ask(); judge(q.answer); };
        api.wrong = function () { if (phase === 'walk') ask(); judge((q.answer + 1) % COLORS.length); };
    }

    var G = {
        id: ID,
        name: '路人走過',
        rule: '五個人會從畫面左邊走進來、右邊走出去，每個人的帽子、衣服、褲子、鞋子顏色都不一樣。他們走完之後，會問你「第幾個人的哪一件是什麼顏色」。答錯或來不及就結束，看你能過幾關。越後面走得越快、問的部位越多！',
        mount: mount,
        score: SCORE,
        test: { speedAt: speedAt, gapAt: gapAt, ansMs: ansMs, partsFor: partsFor, makeLevel: makeLevel, xAt: xAt, question: question, personSvg: personSvg, rating: rating, COLORS: COLORS, PARTS: PARTS, PEOPLE: PEOPLE, PW: PW, MIN_SPACE: MIN_SPACE, RAMP_LEVELS: RAMP_LEVELS, SPEED: SPEED, GAP: GAP, ANS_S: ANS_S, JITTER: JITTER }
    };
    Reaction.register(G);
})();
