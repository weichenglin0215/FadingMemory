/* ═══════════════════════════════════════════════════════════════════
   reaction_windblow.js — 秒反應・大風吹（企劃 363）
   小學團康遊戲「大風吹」。一開始會告訴你「**你是誰**」：穿什麼顏色的衣服、有沒有戴眼鏡、有沒有戴帽子（只顯示 3 秒）。
   然後口令一句一句出現：「大風吹，吹戴眼鏡的人！」——**口令說的是你，就點「換位子」；不是在說你，就點「不動」**。
   答錯、或是超過時間沒回答就結束，成績＝一共答對幾題。
   ───────────────────────────────────────────────────────────────────
   · 你的特徵（makeSelf）：衣服顏色（紅／藍／黃／綠）、眼鏡（有／沒有）、帽子（有／沒有），三項隨機。
   · 口令（makeCommand）：由 1～2 個「條件」組成。條件長這樣：
       戴眼鏡／沒戴眼鏡、戴帽子／沒戴帽子（布林特徵；「沒戴」就是否定的說法），穿紅衣服／不穿紅衣服（顏色特徵，可以用「不穿」否定）。
       兩個條件用「又」（兩個都要符合）或「或」（符合一個就行）連起來，而且兩個條件一定是不同的特徵。
     「這句口令是不是在說你」＝ 用你的特徵去算每個條件，再依「又／或」合起來（matches）。
     出題時用「挑出來的口令符不符合你」來控制：符合和不符合各約一半（所以「換位子」和「不動」都會常常用到），
     連續同一個答案最多 MAX_SAME 次。
   · 難度（線性，依「已經答對幾題」，到 RAMP_CMDS 題到頂）：回答時間 4.0 → 1.6 秒、兩個條件的機率 0 → 0.5、
     兩個條件之中「或」的比例 0 → 0.5、否定說法（沒戴／不穿）的比例 0.2 → 0.6；
     答對 10 題之後，你的特徵會**變**（「現在你戴上帽子了」），之後每 8 題再變一次，你要記住新的樣子（新特徵顯示 2.5 秒）。
   · 結束時：把你的特徵和那句口令並排，逐條寫出「這個條件你符不符合」，以及這句口令是不是在說你。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'windblow';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '答對', min: 1, max: 300 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_CMDS = 40;                         /* 答對幾題之後難度到頂 */
    var ANSWER_S = [4.0, 1.6];                  /* 每一句口令的回答時間（秒）：第 0 題 → 到頂 */
    var P_TWO = [0, 0.5];                       /* 口令有兩個條件的機率：第 0 題 → 到頂 */
    var P_OR = [0, 0.5];                        /* 兩個條件裡，用「或」連起來的比例：第 0 題 → 到頂（其他用「又」） */
    var P_NEG = [0.2, 0.6];                     /* 用否定說法（沒戴…／不穿…）的比例：第 0 題 → 到頂 */
    var P_MATCH = 0.5;                          /* 這句口令說的是你（要換位子）的目標比例 */
    var MAX_SAME = 3;                           /* 最多連續幾題同一個答案（都要換、或都不動） */
    var INTRO_MS = 3000;                        /* 一開始顯示「你是誰」多久 */
    var CHANGE_FROM = 10, CHANGE_EVERY = 8;     /* 答對第 10 題後特徵會變，之後每 8 題再變一次 */
    var CHANGE_MS = 2500;                       /* 特徵改變的時候，新的樣子顯示多久 */
    var NEXT_MS = 380;                          /* 答對之後，下一句口令多久出現 */
    var SOLVE_CAP = 8;                          /* 驗證用：api.solve 最多幫忙答對幾題 */
    var MAX_LEVEL = 60;
    var COLORS = ['紅', '藍', '黃', '綠'];       /* 衣服的顏色（編號對應 CSS 的 wbl-shirt0～3） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(n) { return Math.min(1, Math.max(0, n / RAMP_CMDS)); }
    function lerp(pair, n) { return pair[0] + (pair[1] - pair[0]) * prog(n); }
    function answerMsFor(n) { return Math.round(lerp(ANSWER_S, n) * 1000); }
    function pTwoFor(n) { return Math.round(lerp(P_TWO, n) * 1000) / 1000; }
    function pOrFor(n) { return Math.round(lerp(P_OR, n) * 1000) / 1000; }
    function pNegFor(n) { return Math.round(lerp(P_NEG, n) * 1000) / 1000; }
    /* 你的特徵：{ shirt: 0～3（衣服顏色編號）, glasses: true／false, hat: true／false } */
    function makeSelf(rand) { rand = rand || Math.random; return { shirt: kit.randInt(0, 3, rand), glasses: rand() < 0.5, hat: rand() < 0.5 }; }
    /* 特徵的文字描述：「穿紅衣服、戴眼鏡、沒戴帽子」 */
    function describeSelf(f) { return '穿' + COLORS[f.shirt] + '衣服、' + (f.glasses ? '戴眼鏡' : '沒戴眼鏡') + '、' + (f.hat ? '戴帽子' : '沒戴帽子'); }
    /* 條件 { attr: 'shirt'｜'glasses'｜'hat', value, neg } 的文字 */
    function atomText(a) {
        if (a.attr === 'shirt') return (a.neg ? '不穿' : '穿') + COLORS[a.value] + '衣服';
        if (a.attr === 'glasses') return a.value ? '戴眼鏡' : '沒戴眼鏡';
        return a.value ? '戴帽子' : '沒戴帽子';
    }
    /* 你符不符合這個條件 */
    function atomHolds(a, f) { return (f[a.attr] === a.value) !== !!a.neg; }
    /* 整句口令是不是在說你：and＝每個條件都符合；or＝至少符合一個 */
    function matches(c, f) { return c.mode === 'or' ? c.conds.some(function (a) { return atomHolds(a, f); }) : c.conds.every(function (a) { return atomHolds(a, f); }); }
    function commandText(c) { return '大風吹，吹' + c.conds.map(atomText).join(c.mode === 'or' ? '或' : '又') + '的人！'; }
    /* 隨機挑一個條件：neg＝要不要用否定說法（布林特徵＝value 取 false；顏色＝加上「不」） */
    function randomAtom(attr, neg, rand) {
        if (attr === 'shirt') return { attr: 'shirt', value: kit.randInt(0, 3, rand), neg: neg };
        return { attr: attr, value: !neg, neg: false };
    }
    function oneCommand(n, rand) {
        var two = rand() < pTwoFor(n), pn = pNegFor(n), attrs = kit.shuffle(['shirt', 'glasses', 'hat'], rand), conds = [], mode = 'and';
        conds.push(randomAtom(attrs[0], rand() < pn, rand));
        if (two) { conds.push(randomAtom(attrs[1], rand() < pn, rand)); mode = rand() < pOrFor(n) ? 'or' : 'and'; }
        return { conds: conds, mode: mode };
    }
    /* 出一句口令：希望「符合你」的比例是 P_MATCH、不要連續超過 MAX_SAME 次同一個答案。
       作法：先決定這一題「要符合還是不符合」（連續太多次就強制換），再一直抽到抽出那種口令（最多 200 次，抽不到就用最後一個）。 */
    function makeCommand(self, n, history, rand) {
        rand = rand || Math.random;
        var want = rand() < P_MATCH, k = history.length;
        if (k >= MAX_SAME) { var last = history[k - 1], same = true; for (var i = 1; i < MAX_SAME; i++) if (history[k - 1 - i] !== last) same = false; if (same) want = !last; }
        var c = null;
        for (var tr = 0; tr < 200; tr++) { c = oneCommand(n, rand); if (matches(c, self) === want) break; }
        c.text = commandText(c); c.match = matches(c, self);
        return c;
    }
    /* 特徵改變：隨機換掉其中一項（衣服換成別的顏色、眼鏡／帽子反過來）；回傳 { self（新的特徵）, changed（改了哪一項）, text（「現在你戴上帽子了」）} */
    function changeSelf(f, rand) {
        rand = rand || Math.random;
        var attr = kit.pick(['shirt', 'glasses', 'hat'], rand), g = { shirt: f.shirt, glasses: f.glasses, hat: f.hat }, text;
        if (attr === 'shirt') { var others = [0, 1, 2, 3].filter(function (x) { return x !== f.shirt; }); g.shirt = kit.pick(others, rand); text = '現在你換穿' + COLORS[g.shirt] + '衣服了'; }
        else if (attr === 'glasses') { g.glasses = !f.glasses; text = g.glasses ? '現在你戴上眼鏡了' : '現在你拿下眼鏡了'; }
        else { g.hat = !f.hat; text = g.hat ? '現在你戴上帽子了' : '現在你拿下帽子了'; }
        return { self: g, changed: attr, text: text };
    }
    /* 答對第 n 題之後（n＝已經答對幾題）要不要改特徵：n ≥ 10 且 (n − 10) 是 8 的倍數 */
    function shouldChange(n) { return n >= CHANGE_FROM && (n - CHANGE_FROM) % CHANGE_EVERY === 0; }
    function rating(n) {
        if (n >= 40) return '大風吹冠軍！';
        if (n >= 25) return '記憶力超強！';
        if (n >= 12) return '不錯喔！';
        if (n >= 5) return '再接再厲！';
        return '先記住自己的樣子！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 12, stageClass: 'wbl-stage', resume: false,
            head: function () { return '大風吹'; },
            info: function (S) { return '答對 ' + S.score + ' 題'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['一共答對 ' + S.score + ' 題']; },
            setup: setup
        });
    }

    /* 小朋友（SVG，viewBox 100×120）：衣服顏色、頭、頭髮、眼睛、嘴；戴眼鏡／戴帽子依特徵 */
    function kidSvg(f, size, parent) {
        var svg = kit.svg('svg', { 'class': 'wbl-kid', viewBox: '0 0 100 120', width: size, height: Math.round(size * 1.2) }, parent);
        kit.svg('path', { 'class': 'wbl-shirt wbl-shirt' + f.shirt, d: 'M8,120 Q10,84 50,80 Q90,84 92,120 Z' }, svg);
        kit.svg('rect', { 'class': 'wbl-skin', x: 41, y: 68, width: 18, height: 16, rx: 6 }, svg);
        kit.svg('circle', { 'class': 'wbl-skin', cx: 50, cy: 46, r: 28 }, svg);
        kit.svg('path', { 'class': 'wbl-hair', d: 'M20,48 Q18,14 50,14 Q82,14 80,48 Q72,30 50,28 Q28,30 20,48 Z' }, svg);
        kit.svg('circle', { 'class': 'wbl-eye', cx: 38, cy: 48, r: 4 }, svg);
        kit.svg('circle', { 'class': 'wbl-eye', cx: 62, cy: 48, r: 4 }, svg);
        kit.svg('path', { 'class': 'wbl-mouth', d: 'M40,60 Q50,69 60,60' }, svg);
        if (f.glasses) {
            kit.svg('circle', { 'class': 'wbl-glass', cx: 38, cy: 48, r: 11 }, svg);
            kit.svg('circle', { 'class': 'wbl-glass', cx: 62, cy: 48, r: 11 }, svg);
            kit.svg('path', { 'class': 'wbl-glass', d: 'M49,48 L51,48' }, svg);
        }
        if (f.hat) {
            kit.svg('path', { 'class': 'wbl-hat', d: 'M22,30 Q22,2 50,2 Q78,2 78,30 Z' }, svg);
            kit.svg('rect', { 'class': 'wbl-hat', x: 14, y: 27, width: 72, height: 8, rx: 4 }, svg);
        }
        return svg;
    }

    function setup(api) {
        var stage = api.stage, S = api.S;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var self = makeSelf(api.rand), count = 0, cmd = null, history = [], phase = 'intro', over = false, cmdNo = 0;
        api.info = { get count() { return count; }, get cmd() { return cmd; }, get self() { return self; }, get phase() { return phase; } };
        S.score = 0; api.setInfo('答對 0 題');
        console.log('[大風吹] 開始：你是「' + describeSelf(self) + '」；回答時間 ' + answerMsFor(0) + ' → ' + answerMsFor(RAMP_CMDS) + ' 毫秒');

        var field = h('div', { 'class': 'wbl-field' });
        stage.appendChild(field);
        var bubble = h('div', { 'class': 'wbl-bubble', text: '記住你是誰！' }); field.appendChild(bubble);
        /* 一圈椅子和小朋友（裝飾）：答「換位子」的時候大家轉一格、答「不動」的時候大家蹦一下 */
        var ringBox = Math.min(W - 40, 300), ring = h('div', { 'class': 'wbl-ring' });
        ring.style.cssText = 'left:' + Math.round((W - ringBox) / 2) + 'px;top:150px;width:' + ringBox + 'px;height:' + ringBox + 'px;';
        field.appendChild(ring);
        var KIDS = 8, kids = [];
        for (var i = 0; i < KIDS; i++) {
            var a = i / KIDS * Math.PI * 2 - Math.PI / 2, r = ringBox / 2 - 36, kx = ringBox / 2 + r * Math.cos(a), ky = ringBox / 2 + r * Math.sin(a), kd = h('div', { 'class': 'wbl-seat' });
            kd.style.cssText = 'left:' + Math.round(kx - 34) + 'px;top:' + Math.round(ky - 40) + 'px;';
            kd.appendChild(h('div', { 'class': 'wbl-chair' })); kidSvg(makeSelf(api.rand), 56, kd); ring.appendChild(kd); kids.push(kd);
        }
        var rot = 0;
        /* 「你是誰」的卡片（開始時、特徵改變時顯示一下，然後收起來——平常看不到） */
        var card = h('div', { 'class': 'wbl-card' }); field.appendChild(card);
        var info = h('div', { 'class': 'qz-note wbl-info', text: '' }); field.appendChild(info);
        var grid = kit.btnGrid(field, [
            { text: '換位子', kind: 'primary', cls: 'wbl-btn', onTap: function () { answer(true); } },
            { text: '不動', kind: 'sky', cls: 'wbl-btn', onTap: function () { answer(false); } }
        ], { cols: 2, h: 112, gap: 12, bottom: 12 });
        function enableBtns(on) { grid.btns.forEach(function (b) { b.classList.toggle('wbl-btn--off', !on); }); }
        enableBtns(false);

        function showCard(title, f, sub, ms, done) {
            card.innerHTML = ''; card.classList.remove('wbl-card--hide'); card.style.display = 'flex';
            card.appendChild(h('div', { 'class': 'wbl-card__t', text: title }));
            var av = h('div', { 'class': 'wbl-card__av' }); kidSvg(f, 128, av); card.appendChild(av);
            card.appendChild(h('div', { 'class': 'wbl-card__d', text: describeSelf(f) }));
            if (sub) card.appendChild(h('div', { 'class': 'wbl-card__s', text: sub }));
            api.after(ms, function () { card.classList.add('wbl-card--hide'); api.after(250, function () { card.style.display = 'none'; if (done) done(); }); });
        }
        function nextCommand() {
            if (over || api.over) return;
            cmd = makeCommand(self, count, history, api.rand); cmdNo++;
            history.push(cmd.match); if (history.length > 6) history.shift();
            bubble.textContent = cmd.text; bubble.classList.remove('wbl-bubble--pop'); void bubble.offsetWidth; bubble.classList.add('wbl-bubble--pop');
            info.textContent = ''; phase = 'ask'; enableBtns(true);
            api.stopTimer(); api.timer(answerMsFor(count), function () { fail('timeout', null); });
            if (cmdNo === 1 && kit.once('windblow.hint')) kit.hintOn(stage, grid.btns[cmd.match ? 0 : 1], { mode: 'tap', delay: 500, text: cmd.match ? '說的是你 → 換位子' : '不是你 → 不動' });
        }
        /* 開場：先看「你是誰」 */
        api.after(250, function () { showCard('你是這個人，記住！', self, '只看一次喔', INTRO_MS, function () { bubble.textContent = '準備…'; api.after(400, nextCommand); }); });

        function answer(swap) {
            if (phase !== 'ask' || over || api.over) return;
            phase = 'judge'; api.stopTimer(); enableBtns(false);
            if (swap === cmd.match) {
                count++; S.score = count; api.setInfo('答對 ' + count + ' 題'); Sfx.play('ok');
                if (swap) { rot += 1; ring.style.transform = 'rotate(' + (rot * 360 / KIDS) + 'deg)'; kids.forEach(function (k) { k.style.transform = 'rotate(' + (-rot * 360 / KIDS) + 'deg)'; }); }
                else { ring.classList.remove('wbl-ring--hop'); void ring.offsetWidth; ring.classList.add('wbl-ring--hop'); }
                info.textContent = swap ? '換位子！大家跑起來～' : '不動！';
                if (shouldChange(count)) {
                    var ch = changeSelf(self, api.rand); self = ch.self;
                    console.log('[大風吹] 第 ' + count + ' 題之後，你變了：' + ch.text + '（現在是「' + describeSelf(self) + '」）');
                    api.after(NEXT_MS, function () { bubble.textContent = '特徵改變了！'; showCard(ch.text, self, '記住新的樣子', CHANGE_MS, function () { bubble.textContent = '準備…'; api.after(300, nextCommand); }); });
                } else api.after(NEXT_MS, nextCommand);
                return;
            }
            fail('wrong', swap);
        }
        /* 結束：把你的特徵和口令並排，逐條寫出符不符合 */
        function fail(kind, swap) {
            if (over) return;
            over = true; phase = 'end'; api.stopTimer(); enableBtns(false);
            ring.style.display = 'none'; card.style.display = 'none';
            var want = cmd.match ? '換位子' : '不動', why = kind === 'timeout' ? '時間到了！這句口令要按「' + want + '」' : '按錯了！這句口令要按「' + want + '」（你按了「' + (swap ? '換位子' : '不動') + '」）';
            info.textContent = why; info.classList.add('wbl-info--bad');
            var box = h('div', { 'class': 'wbl-cmp' }), left = h('div', { 'class': 'wbl-cmp__col' }), right = h('div', { 'class': 'wbl-cmp__col' });
            left.appendChild(h('div', { 'class': 'wbl-cmp__t', text: '你是' })); var av = h('div', { 'class': 'wbl-cmp__av' }); kidSvg(self, 84, av); left.appendChild(av); left.appendChild(h('div', { 'class': 'wbl-cmp__d', text: describeSelf(self).split('、').join('\n') }));
            right.appendChild(h('div', { 'class': 'wbl-cmp__t', text: '口令' })); right.appendChild(h('div', { 'class': 'wbl-cmp__c', text: cmd.text.replace('大風吹，', '') }));
            cmd.conds.forEach(function (a) { var ok = atomHolds(a, self); right.appendChild(h('div', { 'class': 'wbl-cmp__r wbl-cmp__r--' + (ok ? 'y' : 'n'), text: atomText(a) + '：你' + (ok ? '符合' : '不符合') })); });
            right.appendChild(h('div', { 'class': 'wbl-cmp__v', text: cmd.conds.length > 1 ? (cmd.mode === 'or' ? '（「或」：符合一個就算）' : '（「又」：要全部符合）') + (cmd.match ? '→ 說的是你' : '→ 不是說你') : (cmd.match ? '→ 說的是你' : '→ 不是說你') }));
            box.appendChild(left); box.appendChild(right); field.appendChild(box);
            kit.flash(stage, false, api.my);
            api.fail({ delay: 4200, lines: [why, '你是「' + describeSelf(self) + '」', '口令「' + cmd.text + '」→ ' + (cmd.match ? '說的是你' : '不是說你')] });
        }
        /* 驗證用：答對目前這題（最多 SOLVE_CAP 題）／故意答反；可重複呼叫 */
        api.solve = function () { if (phase !== 'ask' || count >= SOLVE_CAP) return; answer(cmd.match); };
        api.wrong = function () { if (phase !== 'ask') return; answer(!cmd.match); };
    }

    var G = {
        id: ID,
        name: '大風吹',
        rule: '一開始會告訴你你是誰：衣服的顏色、有沒有戴眼鏡、有沒有戴帽子（只看 3 秒）。然後口令一句一句出現，例如「大風吹，吹戴眼鏡的人！」——**口令說的是你，就點「換位子」，不是在說你，就點「不動」**。小心**否定的說法**（沒戴帽子）和**兩個條件**（「又」要全部符合、「或」符合一個就行）。答對 10 題之後，**你的樣子還會變**，要記住新的！錯一題或沒回答就結束，看你能答對幾題。',
        mount: mount,
        score: SCORE,
        test: {
            answerMsFor: answerMsFor, pTwoFor: pTwoFor, pOrFor: pOrFor, pNegFor: pNegFor, makeSelf: makeSelf, describeSelf: describeSelf, atomText: atomText, atomHolds: atomHolds, matches: matches, commandText: commandText, randomAtom: randomAtom, makeCommand: makeCommand, changeSelf: changeSelf, shouldChange: shouldChange, rating: rating,
            RAMP_CMDS: RAMP_CMDS, ANSWER_S: ANSWER_S, P_TWO: P_TWO, P_OR: P_OR, P_NEG: P_NEG, P_MATCH: P_MATCH, MAX_SAME: MAX_SAME, INTRO_MS: INTRO_MS, CHANGE_FROM: CHANGE_FROM, CHANGE_EVERY: CHANGE_EVERY, CHANGE_MS: CHANGE_MS, SOLVE_CAP: SOLVE_CAP, COLORS: COLORS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
