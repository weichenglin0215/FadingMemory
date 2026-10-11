/* ═══════════════════════════════════════════════════════════════════
   reaction_invoice.js — 秒反應・對發票
   上面是一張 8 碼發票，下面是這一期的開獎號碼，點出它中了哪一個獎（或沒中獎）。100 張發票，
   看你能兌對幾張。
   ───────────────────────────────────────────────────────────────────
   【開獎號碼】每一局先抽三組 8 碼號碼：
        F  = 第一獎號碼        S1 = 一號特別獎        S2 = 二號特別獎
     三組的關係（makeAnnounce 保證）：
        · 末 2 碼三組「故意完全一樣」→ 只看最後一兩個數字，什麼都排除不了；
        · 倒數第 3 碼三組各不相同；
        · 前 5 碼三組彼此差很多（任兩組至少 4 碼不同）；
        · F 的末 3 碼三個數字都不一樣（才有「重排」「對調」的干擾可以做）。
   下面 9 個按鈕由上而下：
        ① 六獎＝F 的末 3 碼　② 五獎＝末 4 碼　③ 四獎＝末 5 碼　④ 三獎＝末 6 碼
        ⑤ 二獎＝末 7 碼　　⑥ 一獎＝末 8 碼（F 全部）　⑦ 一號特別獎(8 碼)　⑧ 二號特別獎(8 碼)
        ⑨ 沒中獎
   【判定】發票的「末幾碼」跟 F 的末幾碼相同，取最多碼的那一級；整張等於 S1／S2 才算特別獎；
   末 3 碼都對不上又不是特別獎，就是沒中獎。

   【100 張發票的組成（先產生再洗牌，所以每一局都一樣公平）】
        有獎 33 張：特別獎 S1×1、S2×1、一獎×1、二獎×2、三獎×4、四獎×6、五獎×8、六獎×10。
          有獎的發票幾乎都是「F 只換一個長得像的數字」：換在哪一位，就決定中幾獎（換在倒數第 4 碼只中六獎、
          換在最後 3 碼就沒獎），所以看起來全都像大獎，只有仔細對才知道是哪一級。
        沒中獎 67 張（每一張的末 3 碼都至少有 2 個數字跟 F 的末 3 碼一樣，所以只看尾巴排除不了）：
          · near    18 張：F 的末 3 碼有一碼換成長得像的數字（再有一半機率前面也換一碼）
          · num      5 張：F 的末 3 碼有一碼換成「差 1」的數字（例如 5→6，不是形狀像）
          · trans    5 張：F 的末幾碼相鄰兩碼對調
          · shift    4 張：整串 F 向左或向右平移一格
          · rev      4 張：F 的末 3～4 碼反過來
          · collage  5 張：前面幾碼是 F、後面幾碼是 S1／S2（拼貼）
          · sNear    6 張：特別獎有一碼換成長得像的數字
          （num／trans／shift／rev／collage 另外有 70% 機率在前 4 碼再換一個長得像的數字，每局的樣子都不一樣）
          · rand    20 張：8 碼完全隨機（讓整體看起來自然；不會中獎）
   【長得像的數字】0↔8↔6↔9、1↔7、2↔7、3↔8↔5、4↔9、5↔6。

   難度：每張發票的限時從 TIME_START 線性縮短到 TIME_END；發票順序依難易度＋雜訊排序，
   前面比較容易、後面「差一個字」越來越多。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'invoice';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 invoice 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 張', label: '答對張數', min: 1, max: 100 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 共 100 張發票 */
    var TOTAL = 100;
    /* 每張限時從 10 秒線性縮短到 4 秒 */
    var TIME_START = 10, TIME_END = 4;        /* 每張限時（秒），從第 1 張線性縮到第 100 張 */
    var NEXT_OK_MS = 450, NEXT_BAD_MS = 1100; /* 答完多久換下一張（答錯停久一點讓人看正解） */
    /* 各獎項的發票張數（鍵是獎項，6＝六獎…） */
    var WIN_COUNTS = { 6: 10, 5: 8, 4: 6, 3: 4, 2: 2, 1: 1 };        /* 各獎項發票張數 */
    /* 沒中獎的干擾發票各類張數 */
    var DECOY_COUNTS = { near: 18, num: 5, trans: 5, shift: 4, rev: 4, collage: 5, sNear: 6, rand: 20 };
    var WIN_COPY_FRONT = 0.9;                 /* 有獎發票前面的數字跟 F 一樣的機率（看起來像更大的獎）*/
    var ANNOUNCE_MIN_DIFF = 4;                /* 三組開獎號碼的前 5 碼，任兩組至少幾碼不同 */
    /* 長得像的數字對照表：例如 0 容易看成 8、6、9 */
    /* 長得像的數字 */
    var SIM = { 0: [8, 6, 9], 1: [7, 4], 2: [7, 3], 3: [8, 5, 9], 4: [9, 1], 5: [6, 3, 8], 6: [8, 5, 0], 7: [1, 2], 8: [0, 6, 3, 9], 9: [4, 8, 0] };
    /* 九個按鈕：prize 對應獎項、k 是要比對末幾碼 */
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

    /* 最佳紀錄文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 張'; }

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 隨機產生 n 位數字字串 */
    function randDigits(n, rand) {
        var s = '';
        for (var i = 0; i < n; i++) s += kit.randInt(0, 9, rand);
        return s;
    }
    /* 把一個數字換成「長得像的」數字 */
    function simDigit(ch, rand) { return String(kit.pick(SIM[+ch], rand)); }
    /* 把一個數字換成「不同的」數字（do...while：一直重抽到不同為止） */
    function otherDigit(ch, rand) {
        var d;
        do { d = String(kit.randInt(0, 9, rand)); } while (d === ch);
        return d;
    }
    /* 把字串 s 的第 i 個字元換成 c */
    function setCh(s, i, c) { return s.substring(0, i) + c + s.substring(i + 1); }
    /* 發票末幾碼跟 F（第一獎號碼）相同：從最後一碼往前數，連續幾碼一樣 */
    /* 發票末幾碼跟 F 的末幾碼相同（連續從最後一碼往前數） */
    function suffixMatch(num, F) {
        var m = 0;
        while (m < 8 && num[7 - m] === F[7 - m]) m++;
        return m;
    }
    /* 這張發票該點哪個按鈕（BTNS 的索引）：特別獎（整張相同）優先，其次依末幾碼 */
    /* 這張發票該點哪個按鈕（BTNS 的索引）：特別獎（整張相同）優先，其次依末幾碼 */
    function classify(num, A) {
        if (num === A.S1) return 6;
        if (num === A.S2) return 7;
        var m = suffixMatch(num, A.F);
        if (m >= 3) return m - 3;       /* 3→0(六獎) … 8→5(一獎) */
        return 8;
    }
    /* 漢明距離：兩個字串有幾個位置不同 */
    function hamming(a, b) { var d = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
    /* 兩個號碼的末 3 碼有幾個數字相同（不看位置） */
    /* 兩個號碼的末 3 碼，有幾個數字相同（把末 3 碼當成可重複的集合比對，不看位置）*/
    function tailOverlap(num, F) {
        var pool = F.slice(5).split(''), n = 0;
        num.slice(5).split('').forEach(function (c) { var k = pool.indexOf(c); if (k >= 0) { pool.splice(k, 1); n++; } });
        return n;
    }
    /* 抽開獎號碼：末 2 碼三組一樣、倒數第 3 碼三組各不同、前 5 碼彼此差很多——這樣只看尾巴排除不了，一定要細看 */
    /* 抽開獎號碼：末 2 碼三組一樣、倒數第 3 碼三組各不同、前 5 碼彼此差很多、F 的末 3 碼三個數字都不同 */
    function makeAnnounce(rand) {
        for (var t = 0; t < 2000; t++) {
            var tail2 = randDigits(2, rand);
            var thirds = kit.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rand).slice(0, 3);
            var f5 = randDigits(5, rand), a5 = randDigits(5, rand), b5 = randDigits(5, rand);
            if (hamming(f5, a5) < ANNOUNCE_MIN_DIFF || hamming(f5, b5) < ANNOUNCE_MIN_DIFF || hamming(a5, b5) < ANNOUNCE_MIN_DIFF) continue;
            /* F＝第一獎、S1＝一號特別獎、S2＝二號特別獎 */
            var F = f5 + thirds[0] + tail2, S1 = a5 + thirds[1] + tail2, S2 = b5 + thirds[2] + tail2;
            if (new Set(F.slice(5).split('')).size < 3) continue;
            return { F: F, S1: S1, S2: S2 };
        }
        return { F: '71524863', S1: '09375163', S2: '48260963' };
    }

    /* 有獎發票：末 k 碼跟 F 相同，第 k+1 碼（從後面數）故意不同（多半是長得像的數字），所以看起來像更大的獎 */
    /* 有獎發票：末 k 碼跟 F 相同，第 k+1 碼（從後面數）故意不同（多半是長得像的數字）*/
    function mkWin(A, k, rand) {
        var F = A.F, out = F;
        var copyFront = rand() < WIN_COPY_FRONT;       /* 前面的字跟 F 一樣 → 看起來更像大獎 */
        for (var i = 0; i < 8 - k; i++) out = setCh(out, i, copyFront ? F[i] : String(kit.randInt(0, 9, rand)));
        if (k < 8) {
            var idx = 7 - k;                 /* 第 k+1 碼（從後面數）的位置 */
            out = setCh(out, idx, rand() < 0.8 ? simDigit(F[idx], rand) : otherDigit(F[idx], rand));
        }
        return out;
    }
    /* 「差 1」的數字（例如 5→6，不是形狀像） */
    function neighborDigit(ch, rand) { var d = +ch + (rand() < 0.5 ? -1 : 1); if (d < 0) d = 1; if (d > 9) d = 8; return String(d); }
    /* 對調字串中的兩個字元 */
    function swapCh(s, i, j) { var a = s[i], b = s[j]; return setCh(setCh(s, i, b), j, a); }
    /* 前 4 碼有機率換成一個長得像的數字（不動末 3 碼），讓每一類干擾有更多變化 */
    /* 前 4 碼裡有 p 的機率換成一個長得像的數字（不動末 3 碼），讓每一類干擾有足夠多種變化 */
    function frontTweak(out, p, rand) {
        if (rand() >= p) return out;
        var q = kit.randInt(0, 3, rand);
        return setCh(out, q, simDigit(out[q], rand));
    }
    /* 沒中獎的干擾：依類型（near 換一碼、num 差一、trans 對調、shift 平移、rev 反轉、collage 拼貼、sNear 特別獎換一碼、rand 隨機） */
    /* 沒中獎的干擾 */
    function mkDecoy(A, kind, rand) {
        var F = A.F, out, i;
        if (kind === 'near') {
            out = F;
            var p = kit.randInt(5, 7, rand);                          /* 末 3 碼裡剛好換一碼 */
            out = setCh(out, p, simDigit(F[p], rand));
            if (rand() < 0.5) { var q = kit.randInt(0, 4, rand); out = setCh(out, q, simDigit(F[q], rand)); }     /* 前面也可能多換一個 */
        } else if (kind === 'num') {
            var p3 = kit.randInt(5, 7, rand);
            out = frontTweak(setCh(F, p3, neighborDigit(F[p3], rand)), 0.5, rand);
        } else if (kind === 'trans') {
            var at = kit.pick([[6, 7], [5, 6], [4, 5]], rand);
            out = frontTweak(swapCh(F, at[0], at[1]), 0.7, rand);
        } else if (kind === 'shift') {
            out = frontTweak(rand() < 0.5 ? F.slice(1) + F[0] : F[7] + F.slice(0, 7), 0.7, rand);
        } else if (kind === 'rev') {
            var L = rand() < 0.5 ? 3 : 4;
            out = frontTweak(F.slice(0, 8 - L) + F.slice(8 - L).split('').reverse().join(''), 0.7, rand);
        } else if (kind === 'collage') {
            var S = rand() < 0.5 ? A.S1 : A.S2, cut = kit.pick([4, 5], rand);
            out = frontTweak(F.slice(0, cut) + S.slice(cut), 0.7, rand);
        } else if (kind === 'sNear') {
            var S2 = rand() < 0.5 ? A.S1 : A.S2;
            var p2 = kit.randInt(0, 7, rand);
            out = setCh(S2, p2, simDigit(S2[p2], rand));
        } else {
            out = randDigits(8, rand);
        }
        return out;
    }
    /* 各類干擾的難度分數（0～1），用來決定出現的順序 */
    /* 這一類發票的難度分數（0~1），用來決定出現順序 */
    var DIFF = { near: 0.95, num: 0.7, trans: 0.8, shift: 0.6, rev: 0.6, collage: 0.75, sNear: 0.85, rand: 0.1 };

    /* 產生整局的 100 張發票：先依各類張數產生，再依「難度 + 雜訊」排序，前面比較容易 */
    /* 產生整局的 100 張發票。回傳 { A, deck:[{num, btn, kind, prize}] } */
    function makeDeck(rand) {
        rand = rand || Math.random;
        var A = makeAnnounce(rand);
        var items = [], used = {};
        /* add：加入一張發票（不能重複） */
        function add(num, kind, diff) {
            if (used[num]) return false;
            used[num] = 1;
            items.push({ num: num, btn: classify(num, A), kind: kind, diff: diff });
            return true;
        }
        /* 特別獎、一獎本身 */
        /* 特別獎與一獎各一張 */
        add(A.S1, 'S1', 0.55); add(A.S2, 'S2', 0.55); add(A.F, 'win1', 0.45);
        /* 二獎~六獎 */
        /* 二獎～六獎 */
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
        /* 沒中獎的干擾 */
        Object.keys(DECOY_COUNTS).forEach(function (kind) {
            var need = DECOY_COUNTS[kind];
            for (var n = 0, guard = 0; n < need && guard < 5000; guard++) {
                var num = mkDecoy(A, kind, rand);
                if (classify(num, A) !== 8) continue;
                if (kind !== 'rand' && tailOverlap(num, A.F) < 2) continue;        /* 干擾的末 3 碼至少 2 個數字跟 F 一樣 */
                if (add(num, kind, DIFF[kind])) n++;
            }
        });
        /* 順序：難度＋雜訊，前面比較容易 */
        /* 順序：難度＋雜訊，前面比較容易 */
        items.forEach(function (it) { it.key = it.diff + (rand() - 0.5) * 0.9; });
        items.sort(function (a, b) { return a.key - b.key; });
        return { A: A, deck: items };
    }
    /* 第 i 張的限時 */
    function timeFor(i) { return kit.ramp(i, TIME_START, TIME_END, TOTAL); }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局（100 張發票） */
        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* D 整副發票；A 開獎號碼 */
            var D = makeDeck();
            var A = D.A, deck = D.deck;
            /* idx 目前第幾張；right 答對數；state 目前階段；cur 目前這張 */
            var idx = 0, right = 0, state = 'idle', cur = null;
            var rts = [];
            /* byBtn 統計每種按鈕的答題數與答對數，結算用 */
            var byBtn = BTNS.map(function () { return { n: 0, ok: 0 }; });
            /* 主控台印出開獎號碼與各獎項張數，方便驗證 */
            try {
                console.info('[對發票] 開獎號碼 第一獎 ' + A.F + '／一號特別獎 ' + A.S1 + '／二號特別獎 ' + A.S2 +
                    '；100 張：有獎 ' + deck.filter(function (d) { return d.btn !== 8; }).length + ' 張、沒中獎 ' + deck.filter(function (d) { return d.btn === 8; }).length + ' 張');
                var cnt = {};
                deck.forEach(function (d) { cnt[BTNS[d.btn].name] = (cnt[BTNS[d.btn].name] || 0) + 1; });
                console.info('[對發票] 各獎項張數', cnt);
            } catch (e) { }

            /* 建立畫面元素：資訊、發票卡片、時間條、九顆按鈕 */
            var info = h('div', { 'class': 'iv-info' });
            var card = h('div', { 'class': 'iv-card' });
            var bar = h('div', { 'class': 'ld-time' }, [h('div', { 'class': 'ld-time__fill' })]);
            var fill = bar.firstChild;
            var btns = h('div', { 'class': 'iv-btns' });
            root.appendChild(info);
            root.appendChild(card);
            root.appendChild(bar);
            root.appendChild(btns);

            /* 建立九顆按鈕：每顆顯示獎項名稱與對應的號碼 */
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

            /* 出下一張 */
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

            /* 作答：標示對錯，把相同的末碼標綠，讓玩家看到「到底對上幾碼」 */
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

            /* 全部答完：結算（分有獎與沒中獎的答對率、平均反應） */
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
                /* 平均反應（秒）：4 位小數、第 3／4 位不為 0，結算時產生一次 */
                if (rts.length) lines.push('答對的平均反應 ' + Leaderboard.fake4(avg / 1000).toFixed(4) + ' 秒');
                kit.result(root, {
                    score: right,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                    num: right + ' / ' + TOTAL, label: right >= 90 ? '眼力超強的對獎達人！' : (right >= 70 ? '很會對發票！' : '再仔細看看數字喔'),
                    lines: lines, isNew: isNew, sfx: right >= 90 ? 'perfect' : (right >= 60 ? 'win' : 'fail'), onAgain: round
                });
            }

            /* G.debug：測試用後門 */
            G.debug = {
                deck: deck, A: A,
                state: function () { return { idx: idx, right: right, state: state, btn: cur && cur.it.btn }; },
                answer: function (i) { answer(i, performance.now()); },
                answerRight: function () { if (state === 'ask') answer(cur.it.btn, performance.now()); return state; },
                skipTo: function (n) { idx = n; },
                finish: finish
            };
            /* 開場等 500 毫秒再出第一張 */
            my.after(500, next);
        }

        round();
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '對發票',
        rule: '上面是一張 8 碼發票，下面是這一期的開獎號碼。**發票的「末幾碼」跟第一獎相同，就中對應的獎**（末 3 碼六獎，末 8 碼一獎）；特別獎要整張 8 碼完全相同；**都沒中就按「沒中獎」**。三組開獎號碼的最後兩碼故意一樣，共 100 張，小心長得很像的數字、對調過的數字、拼貼的號碼！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { makeDeck: makeDeck, classify: classify, suffixMatch: suffixMatch, makeAnnounce: makeAnnounce, tailOverlap: tailOverlap, hamming: hamming, timeFor: timeFor, BTNS: BTNS, TOTAL: TOTAL, SIM: SIM, DECOY_COUNTS: DECOY_COUNTS, ANNOUNCE_MIN_DIFF: ANNOUNCE_MIN_DIFF }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
