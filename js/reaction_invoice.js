/* ═══════════════════════════════════════════════════════════════════
   reaction_invoice.js — 秒反應・對發票
   上面是一張 8 碼發票，下面是這一期的開獎號碼，點出它中了哪一個獎（或沒中獎）。100 張發票，
   看你能兌對幾張。
   ───────────────────────────────────────────────────────────────────
   【開獎號碼】每一局先抽三組 8 碼號碼（互不相同）：
        F  = 第一獎號碼        S1 = 一號特別獎        S2 = 二號特別獎
   下面 9 個按鈕由上而下：
        ① 六獎＝F 的末 3 碼　② 五獎＝末 4 碼　③ 四獎＝末 5 碼　④ 三獎＝末 6 碼
        ⑤ 二獎＝末 7 碼　　⑥ 一獎＝末 8 碼（F 全部）　⑦ 一號特別獎(8 碼)　⑧ 二號特別獎(8 碼)
        ⑨ 沒中獎（使用者企劃只有 8 個按鈕，但有 67 張不會中獎的發票，所以多了這一個）
   【判定】發票的「末幾碼」跟 F 的末幾碼相同，取最多碼的那一級；整張等於 S1／S2 才算特別獎；
   末 3 碼都對不上又不是特別獎，就是沒中獎。

   【100 張發票的組成（先產生再洗牌，所以每一局都一樣公平）】
        特別獎 S1×1、S2×1、一獎×1、二獎×2、三獎×4、四獎×6、五獎×8、六獎×10 ＝ 33 張有獎
        不會中獎的干擾 67 張：
          · 25 張「差一個字」：跟 F 一模一樣，只有末 3 碼裡的 1~2 個數字換成「長得像」的數字
          · 14 張「特別獎差一碼」：S1／S2 其中一碼換成長得像的數字（各 7 張）
          · 12 張「前面一樣」：前 5 碼跟 F 相同，後 3 碼不同（從前面對的人會被騙）
          ·  8 張「順序亂掉」：末 3 碼是 F 末 3 碼打散重排
          ·  8 張完全隨機
   【長得像的數字】0↔8↔6↔9、1↔7、2↔7、3↔8↔5、4↔9、5↔6，有獎的發票「剛好差一級」的那一碼
   也優先用長得像的數字（例如五獎：第 5 碼跟 F 差一個長得像的字，所以看起來像四獎）。

   難度：每張發票的限時從 TIME_START 線性縮短到 TIME_END；發票順序依難易度＋雜訊排序，
   前面比較容易、後面「差一個字」越來越多。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'invoice';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var TOTAL = 100;
    var TIME_START = 10, TIME_END = 4;        /* 每張限時（秒），從第 1 張線性縮到第 100 張 */
    var NEXT_OK_MS = 450, NEXT_BAD_MS = 1100; /* 答完多久換下一張（答錯停久一點讓人看正解） */
    var WIN_COUNTS = { 6: 10, 5: 8, 4: 6, 3: 4, 2: 2, 1: 1 };        /* 各獎項發票張數 */
    var DECOY_COUNTS = { near: 25, sNear: 14, front: 12, perm: 8, rand: 8 };
    /* 長得像的數字 */
    var SIM = { 0: [8, 6, 9], 1: [7, 4], 2: [7, 3], 3: [8, 5, 9], 4: [9, 1], 5: [6, 3, 8], 6: [8, 5, 0], 7: [1, 2], 8: [0, 6, 3, 9], 9: [4, 8, 0] };
    /* 九個按鈕：prize 1~6＝一獎~六獎（k＝末幾碼）、'S1'／'S2'、0＝沒中獎 */
    var BTNS = [
        { prize: 6, name: '六獎', sub: '末 3 碼', k: 3 },
        { prize: 5, name: '五獎', sub: '末 4 碼', k: 4 },
        { prize: 4, name: '四獎', sub: '末 5 碼', k: 5 },
        { prize: 3, name: '三獎', sub: '末 6 碼', k: 6 },
        { prize: 2, name: '二獎', sub: '末 7 碼', k: 7 },
        { prize: 1, name: '一獎', sub: '末 8 碼', k: 8 },
        { prize: 'S1', name: '一號特別獎', sub: '', k: 8 },
        { prize: 'S2', name: '二號特別獎', sub: '', k: 8 },
        { prize: 0, name: '沒中獎', sub: '', k: 0 }
    ];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 張'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function randDigits(n, rand) {
        var s = '';
        for (var i = 0; i < n; i++) s += kit.randInt(0, 9, rand);
        return s;
    }
    function simDigit(ch, rand) { return String(kit.pick(SIM[+ch], rand)); }
    function otherDigit(ch, rand) {
        var d;
        do { d = String(kit.randInt(0, 9, rand)); } while (d === ch);
        return d;
    }
    function setCh(s, i, c) { return s.substring(0, i) + c + s.substring(i + 1); }
    /* 發票末幾碼跟 F 的末幾碼相同（連續從最後一碼往前數） */
    function suffixMatch(num, F) {
        var m = 0;
        while (m < 8 && num[7 - m] === F[7 - m]) m++;
        return m;
    }
    /* 這張發票該點哪個按鈕（BTNS 的索引）：特別獎（整張相同）優先，其次依末幾碼 */
    function classify(num, A) {
        if (num === A.S1) return 6;
        if (num === A.S2) return 7;
        var m = suffixMatch(num, A.F);
        if (m >= 3) return m - 3;       /* 3→0(六獎) … 8→5(一獎) */
        return 8;
    }
    /* 抽開獎號碼：三組互不相同，且特別獎的末 3 碼不能跟 F 的末 3 碼一樣（避免一張同時中兩種） */
    function makeAnnounce(rand) {
        for (var t = 0; t < 200; t++) {
            var F = randDigits(8, rand), S1 = randDigits(8, rand), S2 = randDigits(8, rand);
            if (F === S1 || F === S2 || S1 === S2) continue;
            if (new Set(F.slice(5).split('')).size < 3) continue;       /* F 的末 3 碼要三個都不同，才有足夠的「重排」干擾 */
            if (S1.slice(5) === F.slice(5) || S2.slice(5) === F.slice(5)) continue;
            if (suffixMatch(S1, F) >= 3 || suffixMatch(S2, F) >= 3) continue;
            return { F: F, S1: S1, S2: S2 };
        }
        return { F: '71524863', S1: '09375126', S2: '48260917' };
    }

    /* 有獎發票：末 k 碼跟 F 相同，第 k+1 碼（從後面數）故意不同 */
    function mkWin(A, k, rand) {
        var F = A.F, out = F;
        var copyFront = rand() < 0.55;       /* 前面的字跟 F 一樣 → 看起來更像大獎 */
        for (var i = 0; i < 8 - k; i++) out = setCh(out, i, copyFront ? F[i] : String(kit.randInt(0, 9, rand)));
        if (k < 8) {
            var idx = 7 - k;                 /* 第 k+1 碼（從後面數）的位置 */
            out = setCh(out, idx, rand() < 0.75 ? simDigit(F[idx], rand) : otherDigit(F[idx], rand));
        }
        return out;
    }
    /* 沒中獎的干擾 */
    function mkDecoy(A, kind, rand) {
        var F = A.F, out, i;
        if (kind === 'near') {
            out = F;
            var nSwap = rand() < 0.35 ? 2 : 1;
            var pos = kit.shuffle([5, 6, 7], rand).slice(0, nSwap);
            pos.forEach(function (p) { out = setCh(out, p, simDigit(F[p], rand)); });
            if (rand() < 0.4) { var q = kit.randInt(0, 4, rand); out = setCh(out, q, simDigit(F[q], rand)); }     /* 前面也可能多換一個 */
        } else if (kind === 'sNear') {
            var S = rand() < 0.5 ? A.S1 : A.S2;
            var p2 = kit.randInt(0, 7, rand);
            out = setCh(S, p2, simDigit(S[p2], rand));
        } else if (kind === 'front') {
            out = F.slice(0, 5) + randDigits(3, rand);
        } else if (kind === 'perm') {
            var tail = F.slice(5).split('');
            var perm = tail;
            for (var t = 0; t < 20 && perm.join('') === F.slice(5); t++) perm = kit.shuffle(tail.slice(), rand);
            out = (rand() < 0.5 ? F.slice(0, 5) : randDigits(5, rand)) + perm.join('');
        } else {
            out = randDigits(8, rand);
        }
        return out;
    }
    /* 這一類發票的難度分數（0~1），用來決定出現順序 */
    var DIFF = { near: 0.95, sNear: 0.85, front: 0.45, perm: 0.65, rand: 0.1 };

    /* 產生整局的 100 張發票。回傳 { A, deck:[{num, btn, kind, prize}] } */
    function makeDeck(rand) {
        rand = rand || Math.random;
        var A = makeAnnounce(rand);
        var items = [], used = {};
        function add(num, kind, diff) {
            if (used[num]) return false;
            used[num] = 1;
            items.push({ num: num, btn: classify(num, A), kind: kind, diff: diff });
            return true;
        }
        /* 特別獎、一獎本身 */
        add(A.S1, 'S1', 0.55); add(A.S2, 'S2', 0.55); add(A.F, 'win1', 0.45);
        /* 二獎~六獎 */
        [2, 3, 4, 5, 6].forEach(function (pz) {
            var k = 9 - pz;                   /* 二獎末 7、三獎末 6、四獎末 5、五獎末 4、六獎末 3 */
            var need = WIN_COUNTS[pz];
            for (var n = 0, guard = 0; n < need && guard < 3000; guard++) {
                var num = mkWin(A, k, rand);
                if (classify(num, A) !== k - 3) continue;
                if (add(num, 'win' + pz, 0.3 + 0.05 * (6 - pz))) n++;
            }
        });
        /* 沒中獎的干擾 */
        Object.keys(DECOY_COUNTS).forEach(function (kind) {
            var need = DECOY_COUNTS[kind];
            for (var n = 0, guard = 0; n < need && guard < 5000; guard++) {
                var num = mkDecoy(A, kind, rand);
                if (classify(num, A) !== 8) continue;
                if (add(num, kind, DIFF[kind])) n++;
            }
        });
        /* 順序：難度＋雜訊，前面比較容易 */
        items.forEach(function (it) { it.key = it.diff + (rand() - 0.5) * 0.9; });
        items.sort(function (a, b) { return a.key - b.key; });
        return { A: A, deck: items };
    }
    function timeFor(i) { return kit.ramp(i, TIME_START, TIME_END, TOTAL); }

    function mount(root, ctx) {
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var D = makeDeck();
            var A = D.A, deck = D.deck;
            var idx = 0, right = 0, state = 'idle', cur = null;
            var rts = [];
            var byBtn = BTNS.map(function () { return { n: 0, ok: 0 }; });
            try {
                console.info('[對發票] 開獎號碼 第一獎 ' + A.F + '／一號特別獎 ' + A.S1 + '／二號特別獎 ' + A.S2 +
                    '；100 張：有獎 ' + deck.filter(function (d) { return d.btn !== 8; }).length + ' 張、沒中獎 ' + deck.filter(function (d) { return d.btn === 8; }).length + ' 張');
                var cnt = {};
                deck.forEach(function (d) { cnt[BTNS[d.btn].name] = (cnt[BTNS[d.btn].name] || 0) + 1; });
                console.info('[對發票] 各獎項張數', cnt);
            } catch (e) { }

            var info = h('div', { 'class': 'iv-info' });
            var card = h('div', { 'class': 'iv-card' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var btns = h('div', { 'class': 'iv-btns' });
            root.appendChild(info);
            root.appendChild(card);
            root.appendChild(bar);
            root.appendChild(btns);

            var els = BTNS.map(function (b, i) {
                var num = i < 6 ? A.F.slice(8 - b.k) : (i === 6 ? A.S1 : (i === 7 ? A.S2 : ''));
                var el = h('button', { 'class': 'iv-btn' + (i === 8 ? ' iv-btn--none' : '') }, [
                    h('span', { 'class': 'iv-btn__name' }, [h('b', { text: b.name }), b.sub ? h('i', { text: b.sub }) : null]),
                    h('span', { 'class': 'iv-btn__num', text: num })
                ]);
                el.addEventListener('pointerdown', function (e) { e.preventDefault(); answer(i, kit.evT(e)); });
                btns.appendChild(el);
                return el;
            });

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, fmtBest(Reaction.getBest(ID))])); }

            function next() {
                if (my.dead) return;
                if (idx >= TOTAL) { finish(); return; }
                var it = deck[idx];
                cur = { it: it, t0: performance.now(), limit: timeFor(idx + 1) * 1000 };
                state = 'ask';
                els.forEach(function (el) { el.className = el.className.replace(/ iv-btn--(ok|bad|miss)/g, ''); });
                info.textContent = '第 ' + (idx + 1) + ' / ' + TOTAL + ' 張';
                card.innerHTML = '';
                card.appendChild(h('div', { 'class': 'iv-card__head', text: '統一發票' }));
                var row = h('div', { 'class': 'iv-digits' });
                it.num.split('').forEach(function (ch) { row.appendChild(h('span', { 'class': 'iv-d', text: ch })); });
                card.appendChild(row);
                meta();
                fill.style.width = '100%';
                cur.loop = my.loop(function (now) {
                    if (state !== 'ask') return false;
                    fill.style.width = (100 * Math.max(0, 1 - (now - cur.t0) / cur.limit)).toFixed(1) + '%';
                });
                cur.timer = my.after(cur.limit, function () { if (state === 'ask') answer(-1, performance.now()); });
            }

            function answer(i, t) {
                if (state !== 'ask') return;
                state = 'fb';
                my.cancel(cur.timer); cur.loop.stop();
                var it = cur.it, ok = i === it.btn;
                byBtn[it.btn].n++;
                if (ok) { right++; byBtn[it.btn].ok++; rts.push(t - cur.t0); }
                els[it.btn].classList.add(ok ? 'iv-btn--ok' : 'iv-btn--miss');
                if (!ok && i >= 0) els[i].classList.add('iv-btn--bad');
                /* 把相同的末碼標綠，讓玩家看到「到底對上幾碼」 */
                var digits = card.querySelectorAll('.iv-d');
                var m = it.btn >= 6 ? (it.btn === 8 ? 0 : 8) : suffixMatch(it.num, A.F);        /* 沒中獎就不標色 */
                for (var k = 0; k < m; k++) digits[7 - k].classList.add(it.btn >= 6 ? 'iv-d--sp' : 'iv-d--m');
                if (ok) Sfx.play('ok'); else Sfx.play('bad');
                idx++;
                meta();
                fill.style.width = '0%';
                my.after(ok ? NEXT_OK_MS : NEXT_BAD_MS, next);
            }

            function finish() {
                state = 'done';
                var isNew = Reaction.setBest(ID, right, function (v, b) { return v > b; });
                ctx.setMeta(kit.meta(['答對 ' + right, fmtBest(Reaction.getBest(ID))]));
                var avg = rts.length ? rts.reduce(function (a, b) { return a + b; }, 0) / rts.length : 0;
                var lines = [];
                var sp = byBtn[6].ok + byBtn[7].ok, spN = byBtn[6].n + byBtn[7].n;
                var win = 0, winN = 0;
                for (var b = 0; b < 6; b++) { win += byBtn[b].ok; winN += byBtn[b].n; }
                lines.push('有獎的發票：' + (win + sp) + ' / ' + (winN + spN) + ' 張兌對');
                lines.push('沒中獎的發票：' + byBtn[8].ok + ' / ' + byBtn[8].n + ' 張看穿');
                if (rts.length) lines.push('答對的平均反應 ' + kit.sec(avg) + ' 秒');
                kit.result(root, {
                    num: right + ' / ' + TOTAL, label: right >= 90 ? '眼力超強的對獎達人！' : (right >= 70 ? '很會對發票！' : '再仔細看看數字喔'),
                    lines: lines, isNew: isNew, sfx: right >= 90 ? 'perfect' : (right >= 60 ? 'win' : 'fail'), onAgain: round
                });
            }

            G.debug = {
                deck: deck, A: A,
                state: function () { return { idx: idx, right: right, state: state, btn: cur && cur.it.btn }; },
                answer: function (i) { answer(i, performance.now()); },
                answerRight: function () { if (state === 'ask') answer(cur.it.btn, performance.now()); return state; },
                skipTo: function (n) { idx = n; },
                finish: finish
            };
            my.after(500, next);
        }

        round();
    }

    var G = {
        id: ID,
        name: '對發票',
        rule: '上面是一張 8 碼發票，下面是這一期的開獎號碼。發票的「末幾碼」跟第一獎相同，就中對應的獎（末 3 碼六獎，末 8 碼一獎）；特別獎要整張 8 碼完全相同；都沒中就按「沒中獎」。共 100 張，小心長得很像的數字！',
        mount: mount,
        test: { makeDeck: makeDeck, classify: classify, suffixMatch: suffixMatch, makeAnnounce: makeAnnounce, timeFor: timeFor, BTNS: BTNS, TOTAL: TOTAL, SIM: SIM }
    };
    Reaction.register(G);
})();
