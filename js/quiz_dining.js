/* ═══════════════════════════════════════════════════════════════════
   quiz_dining.js — 測試模式・主軸四：聚餐
   · 一局抽 2 家候選餐廳（S.r），整局重複使用：這次訂的、後來改訂的另一家，
     製造跨關的 A-B/A-C 干擾（第 7 關的「一通電話」會把餐廳從 r[0] 改成 r[1]）。
   · 內容：聚餐日期、餐廳、參加人員（含臨時加入）、座位安排（主位、左右鄰座）、
     菜色與烹飪方式、忌口、飲料、結帳（總金額、每人分攤多少錢）、
     散場時誰要搭誰的順風車回家。
   · 第 1～4 關：聚餐前的準備差事，緊貼「聚餐」主題。
   · 第 5～8 關：座位、菜色、飲料、更正、一通電話、結帳與回家的路。
   ───────────────────────────────────────────────────────────────────
   跟其他主軸檔案（quiz_travel.js／quiz_health.js／quiz_happyBirthday.js）完全
   同一套寫法：抽亂數、組題目的底層工具都來自 js/quiz_gen.js（檔案最上面
   `var lib = Q.lib;` 引用進來的那些方法），這裡的 D1~D8 只負責「聚餐主軸的
   8 關各自要問什麼」。寫法細節（setup/S 參數、T()/G.q() 怎麼用、finish() 的
   作用）看 js/quiz_travel.js 開頭的完整說明，不重複寫一次。
   PICKUP_PAIRS／PICKUP_UNITS 這兩個模組最上層的常數是這個主軸專屬的共用
   資料（第 7、8 關「誰臨時要帶什麼小東西」的子劇情用），因為同一組「人／
   東西／量詞」要在兩關之間保持一致（第 7 關說要帶，第 8 關要問帶了幾個），
   所以抽出來放在檔案最上層，不是寫在某一關的函式裡面。 */

/* 【新手導讀】寫法與 js/quiz_travel.js 完全相同（共用 js/quiz_gen.js 的出題引擎）：Q 是引擎，lib 是工具箱，P 是素材，T 是範本代入，L 是誘答選項。T1 的逐行說明在 quiz_travel.js 的第 1 關；這裡的 D1～D8 是聚餐主軸的 8 關。 */
(function () {
    'use strict';

    var Q = window.QuizGen;
    var lib = Q.lib;
    var P = lib.P;
    var T = lib.T;
    var L = lib.L;
    var cnNum = lib.cnNum;
    var cnCount = lib.cnCount;
    var twoDiff = lib.twoDiff;
    var threeDiff = lib.threeDiff;
    var rev2 = lib.rev2;
    var perms = lib.perms;
    var finish = lib.finish;
    var addDays = lib.addDays;
    var people = lib.people;
    var flowerSet = lib.flowerSet;
    var flowerQs = lib.flowerQs;
    var turnQ = lib.turnQ;
    var timeline = lib.timeline;

    /* 把數字格式化成「500 元」 */
    function yuan(n) { return n + ' 元'; }

    /* 第 7、8 關共用：去取某樣聚餐要用的東西（place 跟 item 配對，拿去當誘答池時用 item 名稱） */
    var PICKUP_PAIRS = [
        { place: '租借行', item: '兒童椅' },
        { place: '禮品店', item: '伴手禮' },
        { place: '花店', item: '花束' },
        { place: '蛋糕店', item: '蛋糕盒' }
    ];
    var PICKUP_UNITS = { '兒童椅': '張', '伴手禮': '份', '花束': '束', '蛋糕盒': '個' };

    /* ═══ 第 1 關：新手暖身（一件事，幾乎沒有干擾） ═══ */
    /* 第 1 關：最簡單的一關（一件差事，幾乎沒有干擾），可以對照 quiz_travel.js 的 T1 看 */
    function D1(G, S) {
        var D = S.tl[S.i];
        /* G.pick：隨機挑一個 */
        var p = G.pick(P.kin.concat(P.friends));
        var e = G.pick(P.diningErrands1);
        /* G.num：抽一個數字，twoDiff 規則避免兩位數有重複數字 */
        var bus = G.num(12, 98, null, twoDiff);
        var stop = G.pick(P.stops);
        var floor = G.num(2, 5, null, null, 'floor');
        var n = G.num(2, 4, [floor], null, 'n');
        /* S.r[0]：整局共用的兩家候選餐廳之一 */
        var r = S.r[0];
        var v = { p: p, bus: bus, stop: stop, place: e.place, floor: floor, act: e.act, n: n, u: e.u, thing: e.thing, r: r, today: D.today.sw, ev: D.ev.sw };
        /* v：範本代入用的資料包 */
        var note = [
            /* note：紙條，每個元素是一段文字 */
            T('{ev}要去{r}聚餐，{p}找了大家一起吃飯。你下午五點下班，要先幫忙辦一件事：', v),
            T('搭 {bus} 號公車，在{stop}下車，', v),
            T('去{place} {floor} 樓，{act} {n} {u}{thing}。', v)
        ];
        var fl = function (x) { return x + ' 樓'; };
        /* fl、cu：把答案格式化成「3 樓」「2 袋」之類的小函式 */
        var cu = function (x) { return x + ' ' + e.u; };
        var qs = [
            /* qs：候選題目；G.dateQ 是日期題，G.q(題目, 題型, 正解, [誘答])，L(文字, 混淆類型, 說明) 做誘答 */
            G.dateQ('聚餐是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天，聚餐是' + D.ev.s + '。')], { must: true }),
            G.q('是誰找大家一起吃飯？', '人物', p, G.others(P.kin.concat(P.friends), p, '差一點點')),
            G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 10, hi: 99 })),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('{place}在幾樓？', v), '數字', fl(floor),
                [L(fl(n), '張冠李戴', n + ' 是' + e.thing + '的數量，不是樓層。')].concat(G.near(floor, fl, { lo: 1, hi: 9, swap: false }))),
            G.q(T('要{act}幾{u}{thing}？', v), '數字', cu(n),
                [L(cu(floor), '張冠李戴', floor + ' 是樓層，不是' + e.thing + '的數量。')].concat(G.near(n, cu, { lo: 1, hi: 9, swap: false })))
        ];
        /* finish：從候選題目挑出這一關要用的 4 題 */
        return { note: note, qs: finish(G, qs, 4) };
    }

    /* ═══ 第 2 關：兩件差事（打電話來的人交代聚餐前要跑的兩個地方） ═══ */
    function D2(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home.concat(P.friends));
        var r = S.r[0];
        var cs = G.pick(P.diningShops, 2);
        var c1 = cs[0];
        var c2 = cs[1];
        var i1 = G.pick(c1.items);
        var i2 = G.pick(c2.items);
        var rest2 = G.shuffle(c2.items.filter(function (x) { return x !== i2; }));
        var lure = rest2[0];
        var sib2 = rest2[1];
        var sib1 = G.any(c1.items.filter(function (x) { return x !== i1; }));
        var bus = G.num(12, 98, null, twoDiff);
        var house = rev2(bus);
        var stop = G.pick(P.stops);
        var n1 = G.num(1, 4, null, null, 'n1');
        var n2 = G.num(1, 4, [n1], null, 'n2');
        var v = {
            who: who, r: r, bus: bus, stop: stop, s1: c1.shop, s2: c2.shop, n1: cnCount(n1), n2: cnCount(n2),
            u1: c1.u, u2: c2.u, i1: i1, i2: i2, lure: lure, house: house, today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('{today}，{who}打電話來說：「{ev}約了大家去{r}聚餐。」', v),
            T('「下班後幫我跑兩個地方好不好？先搭 {bus} 號公車到{stop}，去{s1}訂{n1}{u1}{i1}。」', v),
            T('「然後走到{s2}，買{n2}{u2}{i2}。上次你買成{lure}，這次別再買錯囉！」掛電話前，{who}還說自己家的門牌換新了，是 {house} 號。', v)
        ];
        var f1 = function (x) { return cnCount(x) + c1.u; };
        var f2 = function (x) { return cnCount(x) + c2.u; };
        var lureWhy = '「' + lure + '」是上次買錯的。';
        var qs = [
            G.dateQ('聚餐是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是打電話來的那天。')], { must: true }),
            G.weekQ('聚餐是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是打電話來的那天。')]),
            G.q('要去哪一家餐廳聚餐？', '地點', r, G.others(P.diningRestaurants, r, '差一點點')),
            G.q('要搭幾號公車？', '數字', bus,
                [L(house, '似曾相識', house + ' 是' + who + '家的門牌號碼。')].concat(G.near(bus, String, { lo: 10, hi: 99 }))),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('在{s1}要訂什麼？', v), '物品', i1,
                [L(i2, '張冠李戴', i2 + '是在' + c2.shop + '買的。'), L(lure, '似曾相識', lureWhy), L(sib1, '差一點點')]),
            G.q(T('在{s1}要訂幾{u1}？', v), '數字', f1(n1),
                [L(f1(n2), '張冠李戴', '「' + cnCount(n2) + '」是在' + c2.shop + '買的數量。')].concat(G.near(n1, f1, { lo: 1, hi: 6, swap: false }))),
            G.q(T('在{s2}要買什麼？', v), '物品', i2,
                [L(lure, '似曾相識', lureWhy), L(i1, '張冠李戴', i1 + '是在' + c1.shop + '訂的。'), L(sib2, '差一點點')]),
            G.q(T('在{s2}要買幾{u2}？', v), '數字', f2(n2), [L(f2(n1), '張冠李戴', '「' + cnCount(n1) + '」是在' + c1.shop + '訂的數量。')].concat(G.near(n2, f2, { lo: 1, hi: 6, swap: false })))
        ];
        return { note: note, qs: finish(G, qs, 6) };
    }

    /* ═══ 第 3 關：先後順序（聚餐前的三件差事，講的順序≠做的順序） ═══ */
    function D3(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home.concat(P.friends));
        var nb = people(G, null, [who]);
        var joiners = G.pick(P.kin.concat(P.friends), 2, [who]);
        var j1 = joiners[0];
        var j2 = joiners[1];
        var r = S.r[0];
        var es = G.pick(P.diningErrands3, 3);
        var A = es[0];
        var B = es[1];
        var C = es[2];
        var nA = G.num(1, 5, null, null, 'nA');
        var nB = G.num(1, 5, [nA], null, 'nB');
        var ns = [nA, nB, G.num(1, 5, [nA, nB], null, 'nC')];
        var noise = G.pick(P.noiseShops);
        var nn = G.num(1, 5, ns, null, 'nn');
        var BE = es[G.int(0, 2)];
        var bus = G.num(12, 98, null, twoDiff);
        var act = function (e, i) { return T(e.act, { n: cnCount(ns[i]) }); };
        var v = {
            who: who, nb: nb, j1: j1, j2: j2, r: r, bus: bus, Ap: A.place, Aa: act(A, 0), Ae: A.early, Bp: B.place, Ba: act(B, 1),
            Cp: C.place, Ca: act(C, 2), Cl: C.late, Xp: BE.place, ns: noise.shop, nn: cnCount(nn), nu: noise.u, nt: noise.thing,
            today: D.today.sw, ev: D.ev.s
        };
        var form = G.int(0, 2);
        var narr;
        var body;
        if (form === 0) {
            narr = [B, A, C];
            body = [
                T('{who}傳來一段語音：「今天下班，幫我去{Bp}{Ba}。不過去{Bp}之前，要先到{Ap}{Aa}，因為{Ae}。」', v),
                T('「還有，{Cp}那邊要{Ca}，這件放在最後，因為{Cl}。」', v)
            ];
        } else if (form === 1) {
            narr = [C, A, B];
            body = [
                T('{who}傳來一段語音：「今天回家前，最後記得去{Cp}{Ca}，因為{Cl}。」', v),
                T('「但一出門，第一件事是去{Ap}{Aa}，因為{Ae}。做完這件，再去{Bp}{Ba}。」', v)
            ];
        } else {
            narr = [B, C, A];
            body = [
                T('{who}傳來一段語音：「今天下班，幫我去{Bp}{Ba}，然後去{Cp}{Ca}。」', v),
                T('「喔不對，這兩件之前，要先去{Ap}{Aa}，因為{Ae}。{Cp}那件放最後，因為{Cl}。」', v)
            ];
        }
        var note = [T('今天是{today}。{ev}要去{r}聚餐。', v)].concat(body, [
            T('{who}還說，目前{j1}、{j2}都說會來。', v),
            T('{who}還提醒你，去{Xp}要搭 {bus} 號公車，比較快。', v),
            T('聽完語音，你想起{nb}說過，{Cp}旁邊新開了一家{ns}，開幕送{nn}{nu}{nt}，不過今天沒空去。', v)
        ]);

        var exec = [A, B, C];
        var ord = ['第一件', '第二件', '最後一件'];
        var noiseLabel = '逛' + noise.shop;
        var noiseWhy = noise.shop + '只是順口提到的新店。';
        var qs = [];
        exec.forEach(function (e, i) {
            var lures = [];
            if (narr[i] !== e) lures.push(L(narr[i].k, '順序顛倒', '紙條上先講到「' + narr[i].k + '」，但它是' + ord[exec.indexOf(narr[i])] + '。'));
            exec.forEach(function (o, j) { if (j !== i) lures.push(L(o.k, '順序顛倒', '「' + o.k + '」是' + ord[j] + '。')); });
            lures.push(L(noiseLabel, '似曾相識', noiseWhy));
            qs.push(G.q(ord[i] + '要做什麼？', '順序', e.k, lures));
        });
        qs.push(G.q('哪一件事要搭公車？', '配對', BE.k,
            exec.filter(function (e) { return e !== BE; }).map(function (e) { return L(e.k, '張冠李戴', '搭公車是為了去' + BE.place + '。'); })
                .concat([L(noiseLabel, '似曾相識', noiseWhy)])));
        qs.push(G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 10, hi: 99 })));
        exec.forEach(function (e, i) {
            var f = function (x) { return cnCount(x) + e.u; };
            var lures = [];
            exec.forEach(function (o, j) { if (j !== i) lures.push(L(f(ns[j]), '張冠李戴', '「' + cnCount(ns[j]) + '」是' + o.k + '的數量。')); });
            lures.push(L(f(nn), '似曾相識', '「' + cnCount(nn) + '」是新店開幕送的數量。'));
            qs.push(G.q(e.q, '數字', f(ns[i]), lures.concat(G.near(ns[i], f, { lo: 1, hi: 7, swap: false }))));
        });
        qs.push(G.dateQ('聚餐是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }));
        qs.push(G.daysQ('今天離聚餐還有幾天？', D.today, D.ev));
        qs.push(G.attrQ('目前誰說會來？', [
            { val: j1, alts: G.others(P.kin.concat(P.friends), [who, j1, j2], '差一點點', 2) },
            { val: j2, alts: G.others(P.kin.concat(P.friends), [who, j1, j2], '差一點點', 2) }
        ], function (vals) { return vals.filter(Boolean).join('、'); }, 2));
        return { note: note, qs: finish(G, qs, 8) };
    }

    /* ═══ 第 4 關：顏色形狀（要帶去聚餐的東西＋兩道反常理顏色的菜） ═══ */
    function D4(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home);
        var nb = people(G, null, [who]);
        var g = G.pick(P.kin, null, [who]);
        var r = S.r[0];
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var street = pair[a];
        var alt = pair[1 - a];
        var shop = G.pick(P.partyShops);
        var cols = G.pick(P.colors, 3);
        var shs = G.pick(P.shapes, 3);
        var things = G.pick(P.diningThings4, 4);
        var si = G.shuffle([0, 1, 2]);
        var x;
        var y;
        do { x = G.int(0, 2); y = G.int(0, 2); } while (si[x] === y);
        var objs = G.shuffle([0, 1, 2].map(function (i) { return { n: things[i], c: cols[i], s: shs[si[i]] }; })
            .concat([{ n: things[3], c: cols[x], s: shs[y] }]));
        var sn = G.pick(P.diningOddDishes, 2);
        var fc = [G.any(sn[0].odd)];
        var odd2 = sn[1].odd.filter(function (c) { return c !== fc[0]; });
        fc.push(G.any(odd2.length ? odd2 : sn[1].odd));
        var fn0 = G.num(1, 4, null, null, 'fn1');
        var fn = [fn0, G.num(1, 4, [fn0], null, 'fn2')];
        var lc = G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && fc.indexOf(c) < 0; }));
        var v = {
            who: who, nb: nb, g: g, r: r, street: street, shop: shop, lc: lc,
            sk1: sn[0].n, sk2: sn[1].n, fc1: fc[0], fc2: fc[1], fn1: cnCount(fn[0]), fn2: cnCount(fn[1]), su1: sn[0].u, su2: sn[1].u,
            today: D.today.sw, ev: D.ev.sw
        };
        objs.forEach(function (o, i) { v['c' + i] = o.c; v['s' + i] = o.s; v['n' + i] = o.n; });
        var note = [
            T('今天是{today}。{ev}要去{r}聚餐，{who}拜託你下班去{street}的{shop}，買幾樣要帶去的東西。', v),
            T('「要一個{c0}的{s0}{n0}，還有一個{c1}的{s1}{n1}。」', v),
            T('{who}想了想又說：「再買一個{c2}的{s2}{n2}，和一個{c3}的{s3}{n3}。」', v),
            T('{nb}在旁邊聽到，說：「上次我在別家買的{n0}是{lc}的，用沒多久就壞了。」', v),
            T('{who}還說，先幫忙跟餐廳點兩道菜：{fc1}的{sk1}{fn1}{su1}、{fc2}的{sk2}{fn2}{su2}，{g}指定要吃這兩道。', v)
        ];

        var ownerOfColor = function (c) { return objs.filter(function (o) { return o.c === c; })[0].n; };
        var ownerOfShape = function (s) { return objs.filter(function (o) { return o.s === s; })[0].n; };
        var spareColor = function (not) { return G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && not.indexOf(c) < 0; })); };
        var order = G.shuffle(objs);

        function colorQ(o) {
            var lures = [];
            if (o === objs[0]) lures.push(L(lc, '似曾相識', '「' + lc + '」是' + nb + '上次在別家買的。'));
            cols.forEach(function (c) { if (c !== o.c) lures.push(L(c, '張冠李戴', '「' + c + '」是' + ownerOfColor(c) + '的顏色。')); });
            lures.push(L(fc[0], '張冠李戴', '「' + fc[0] + '」是' + sn[0].n + '的顏色。'));
            lures.push(L(spareColor([lc]), '差一點點'));
            return G.q(o.n + '是什麼顏色？', '顏色', o.c, lures);
        }
        function shapeQ(o) {
            var lures = [];
            shs.forEach(function (s) { if (s !== o.s) lures.push(L(s, '張冠李戴', '「' + s + '」是' + ownerOfShape(s) + '的形狀。')); });
            return G.q(o.n + '是什麼形狀？', '形狀', o.s, lures.concat(G.others(P.shapes, shs)));
        }
        function revQ(o) {
            var lures = objs.filter(function (p) { return p !== o; }).map(function (p) {
                return L(p.n, '張冠李戴', '「' + p.n + '」是' + p.c + '的' + p.s + '。');
            });
            return G.q('「' + o.c + '的' + o.s + '」是哪一樣？', '組合', o.n, lures);
        }
        function conjQ(o) {
            var others2 = objs.filter(function (p) { return p !== o; });
            var lures = [];
            others2.forEach(function (p) {
                if (p.c !== o.c) lures.push(L(p.c + '的' + o.s + o.n, '張冠李戴', o.n + '是' + o.c + '的；' + p.c + '是' + p.n + '的顏色。'));
                if (p.s !== o.s) lures.push(L(o.c + '的' + p.s + o.n, '張冠李戴', o.n + '是' + o.s + '的；' + p.s + '是' + p.n + '的形狀。'));
                if (p.c !== o.c && p.s !== o.s) lures.push(L(p.c + '的' + p.s + o.n, '拼湊組合', '這是把' + p.n + '的顏色和形狀，拼到' + o.n + '上了。'));
            });
            return G.q('哪一個是' + o.n + '正確的樣子？', '組合', o.c + '的' + o.s + o.n, G.shuffle(lures), { must: true });
        }
        function dishColorQ(k) {
            var s = sn[k];
            var lures = [L(s.typ, '常理陷阱', s.n + '一般是' + s.typ + '，但這次要' + fc[k] + '的。')];
            lures.push(L(fc[1 - k], '張冠李戴', '「' + fc[1 - k] + '」是' + sn[1 - k].n + '的顏色。'));
            lures.push(L(cols[0], '張冠李戴', '「' + cols[0] + '」是' + ownerOfColor(cols[0]) + '的顏色。'));
            lures.push(L(spareColor([s.typ].concat(fc)), '差一點點'));
            return G.q(s.n + '要點什麼顏色的？', '顏色', fc[k], lures, { must: true });
        }
        function dishCountQ(k) {
            var s = sn[k];
            var fmt = function (n) { return cnCount(n) + s.u; };
            return G.q(s.n + '要點幾' + s.u + '？', '數字', fmt(fn[k]),
                [L(fmt(fn[1 - k]), '張冠李戴', '「' + cnCount(fn[1 - k]) + '」是' + sn[1 - k].n + '的數量。')].concat(G.near(fn[k], fmt, { lo: 1, hi: 6, swap: false })));
        }

        var qs = [
            colorQ(order[0]), shapeQ(order[1]), revQ(order[2]), conjQ(order[3]),
            dishColorQ(0), dishColorQ(1), dishCountQ(0), dishCountQ(1),
            G.q(shop + '在哪一條路？', '地點', street, [L(alt, '差一點點', '「' + alt + '」和「' + street + '」很像，紙條上是「' + street + '」。')]
                .concat(G.others(P.streetPairs.map(function (pr) { return pr[0]; }), [street, alt], '差一點點', 2))),
            G.q('誰指定要吃那兩道菜？', '人物', g, [L(who, '張冠李戴', who + '是拜託你買東西的人。'), L(nb, '似曾相識', nb + '只是在旁邊聽到。')]
                .concat(G.others(P.kin, [g, who], '差一點點', 2))),
            G.q('是誰拜託你買這些東西？', '人物', who, [L(nb, '似曾相識', nb + '只是在旁邊聽到。'), L(g, '張冠李戴', g + '是指定菜色的人。')]
                .concat(G.others(P.friends.concat(P.home), [who, nb], '差一點點', 2))),
            G.dateQ('聚餐是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.weekQ('聚餐是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')])
        ];
        return { note: note, qs: finish(G, qs, 12) };
    }

    /* 把整個聚餐主軸登記進引擎：id、顯示名稱、8 關的關卡名稱、setup（整局共用資料：時間軸與兩家餐廳）、levels（8 個關卡函式） */
    Q.addTheme({
        id: 'dining', name: '聚餐',
        names: ['新手暖身', '兩件差事', '先後順序', '顏色形狀', '座位與飲料', '臨時改口', '一通電話', '結帳回家'],
        setup: function (G) { return { tl: timeline(G, [4, 10], [2, 9]), r: G.pick(P.diningRestaurants, 2) }; },
        levels: [D1, D2, D3, D4, D5, D6, D7, D8]
    });

    /* 第 5～8 關定義在下面（檔案較長，拆開寫方便檢視）；levels 陣列裡的名稱在上面已經對應好。 */
    function D5(G, S) {
        var D = S.tl[S.i];
        var r = S.r[0];
        var ps = G.pick(P.kin.concat(P.friends), 2);
        var p1 = ps[0];
        var p2 = ps[1];
        var nb = people(G, null, ps);
        var bus1 = G.num(123, 987, null, threeDiff);
        var bus2 = G.any(perms(bus1));
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var stop1 = pair[a];
        var stop2 = pair[1 - a];
        var pk = G.pick([
            { place: '蛋糕店', thing: '訂好的蛋糕', k: '拿蛋糕' }, { place: '飲料店', thing: '訂好的飲料', k: '拿飲料' },
            { place: '租借行', thing: '租好的兒童椅', k: '拿椅子' }, { place: '花店', thing: '訂好的花束', k: '拿花束' },
            { place: '禮品店', thing: '包好的禮物', k: '拿禮物' }, { place: '文具店', thing: '印好的菜單', k: '拿菜單' }
        ]);
        var pkOthers = ['拿蛋糕', '拿飲料', '拿椅子', '拿花束', '拿禮物', '拿菜單'].filter(function (k) { return k !== pk.k; });
        var closeT = G.pick(P.times.slice(2));
        var cat = G.pick(P.diningShops);
        var i2 = G.pick(cat.items);
        var rest = G.shuffle(cat.items.filter(function (x) { return x !== i2; }));
        var lureItem = rest[0];
        var n2 = G.num(1, 4, null, null, 'n2');
        var flower = G.pick(P.flowers);
        var fs = flowerSet(G);
        var seat3 = G.pick(P.kin.concat(P.friends), 3, ps);
        var head = seat3[0];
        var left = seat3[1];
        var right = seat3[2];
        var drinkers = G.pick(P.kin.concat(P.friends), 2, ps.concat(seat3));
        var d1 = drinkers[0];
        var d2 = drinkers[1];
        var dk = G.pick(P.diningDrinks, 2);
        var v = {
            p1: p1, p2: p2, nb: nb, r: r, bus1: bus1, bus2: bus2, stop1: stop1, stop2: stop2, place1: pk.place, thing1: pk.thing, closeT: closeT,
            shop2: cat.shop, n2: cnCount(n2), u2: cat.u, i2: i2, lure: lureItem, fl: flower, f1: fs.ok[0], f2: fs.ok[1], f3: fs.ok[2],
            fx: fs.no, fxr: fs.noWhy, head: head, left: left, right: right, d1: d1, dk1: dk[0], d2: d2, dk2: dk[1],
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}。{ev}要去{r}聚餐。', v),
            T('{p1}和{p2}各拜託你一件事。{p1}要你搭 {bus1} 號公車，在{stop1}下車，去{place1}幫忙拿{thing1}，{place1}{closeT}就關門了。', v),
            T('{p2}則要你回程搭 {bus2} 號公車，在{stop2}下車，到{shop2}買{n2}{u2}{i2}。{p2}說上次買成{lure}，這次不要再買錯。', v),
            T('{p1}還想要一束{fl}，{f1}、{f2}或{f3}都可以，就是不要{fx}的，因為{fxr}。', v),
            T('{p1}還交代座位：主位給{head}坐，{head}左邊坐{left}，右邊坐{right}。', v),
            T('飲料也先點好：{d1}要{dk1}，{d2}要{dk2}。', v),
            T('在公車上，{nb}跟你聊起孫子考上了大學，說下個月要請大家吃蛋糕，聊了好久。', v),
            T('{p1}還在電話裡抱怨，上次去{place1}等了快一個小時，這次希望快一點。', v)
        ];

        var streets = P.streetPairs.map(function (p) { return p[0]; }).concat(P.streetPairs.map(function (p) { return p[1]; }));
        var f2 = function (x) { return cnCount(x) + cat.u; };
        var ti = P.times.indexOf(closeT);

        var seatHeadQ = G.q('聚餐時誰坐主位？', '人物', head,
            [L(left, '差一點點'), L(right, '差一點點')].concat(G.others(P.kin.concat(P.friends), [head, left, right].concat(ps), '差一點點', 1)));
        var seatLeftQ = G.q(head + '左邊坐誰？', '人物', left,
            [L(right, '順序顛倒', '左右弄反了，坐左邊的是' + left + '。')].concat(G.others(P.kin.concat(P.friends), [head, left, right].concat(ps), '差一點點', 2)));
        var seatRightQ = G.q(head + '右邊坐誰？', '人物', right,
            [L(left, '順序顛倒', '左右弄反了，坐右邊的是' + right + '。')].concat(G.others(P.kin.concat(P.friends), [head, left, right].concat(ps), '差一點點', 2)));

        var qs = [
            G.q('去程要搭幾號公車？', '數字', bus1, [L(bus2, '張冠李戴', bus2 + ' 是回程的公車。')].concat(G.near(bus1, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('回程要搭幾號公車？', '數字', bus2, [L(bus1, '張冠李戴', bus1 + ' 是去程的公車。')].concat(G.near(bus2, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('去程要在哪裡下車？', '地點', stop1, [L(stop2, '張冠李戴', stop2 + '是回程下車的地方。')].concat(G.others(streets, [stop1, stop2], '差一點點', 2))),
            G.q('回程要在哪裡下車？', '地點', stop2, [L(stop1, '張冠李戴', stop1 + '是去程下車的地方。')].concat(G.others(streets, [stop1, stop2], '差一點點', 2))),
            G.q(T('去{place1}要做什麼？', v), '物品', pk.k, [L('買' + i2, '張冠李戴', i2 + '是' + p2 + '要的。')].concat(G.others(pkOthers, [], '差一點點', 2))),
            G.q(T('{place1}幾點關門？', v), '時間', closeT, G.others(P.times.slice(Math.max(0, ti - 2), ti + 3), closeT, '數字相近')),
            G.q(T('{shop2}的東西是誰要的？', v), '人物', p2, [L(p1, '張冠李戴', p1 + '要的是' + pk.k.slice(1) + '和花。'), L(nb, '似曾相識', nb + '只是在公車上聊天。')]
                .concat(G.others(P.kin, [p1, p2], '差一點點', 1))),
            G.q(T('{fl}是誰要的？', v), '人物', p1, [L(p2, '張冠李戴', p2 + '要的是' + cat.shop + '的東西。'), L(nb, '似曾相識', nb + '只是在公車上聊天。')]
                .concat(G.others(P.kin, [p1, p2], '差一點點', 1)), { must: true }),
            seatHeadQ, seatLeftQ, seatRightQ,
            G.q('誰要喝' + dk[0] + '？', '人物', d1, [L(d2, '張冠李戴', d2 + '要的是' + dk[1] + '。')].concat(G.others(P.kin.concat(P.friends), [d1, d2], '差一點點', 2))),
            G.q(d2 + '要喝什麼飲料？', '物品', dk[1], [L(dk[0], '張冠李戴', dk[0] + '是' + d1 + '要的。')].concat(G.others(P.diningDrinks, dk, '差一點點', 2))),
            G.q(T('在{shop2}要買什麼？', v), '物品', i2, [L(lureItem, '似曾相識', '「' + lureItem + '」是上次買錯的。')].concat(G.others(rest.slice(1), [], '差一點點', 2))),
            G.q(T('在{shop2}要買幾{u2}？', v), '數字', f2(n2), G.near(n2, f2, { lo: 1, hi: 7, swap: false })),
            G.dateQ('聚餐是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天，聚餐是' + D.ev.s + '。')], { must: true }),
            G.weekQ('聚餐是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')])
        ].concat(flowerQs(G, fs, flower));
        return { note: note, qs: finish(G, qs, 16) };
    }

    function D6(G, S) {
        var today = S.tl[S.i].today;
        var ev = addDays(today, 1);
        var who = G.pick(P.home);
        var p4 = G.pick(P.relatives, null, [who]);
        var r = S.r[0];
        var nb = people(G);
        var joiner = G.pick(P.kin.concat(P.friends), null, [who, p4]);
        var excl2 = G.pick(P.kin.concat(P.friends), 2, [who, p4, joiner]);
        var exclPerson1 = excl2[0];
        var exclPerson2 = excl2[1];
        var exclFoods = G.pick(P.diningExcludes, 2);
        var exclFood1 = exclFoods[0];
        var exclFood2 = exclFoods[1];
        var dishes = G.pick(P.diningDishes, 2);
        var dish1 = dishes[0];
        var dish2 = dishes[1];
        var methods = G.pick(P.diningCookMethods, 2);
        var oldMethod = methods[0];
        var newMethod = methods[1];
        var addDish = G.pick(P.diningDishes, null, dishes);
        var addMethod = G.pick(P.diningCookMethods, null, methods);
        var drinks = G.pick(P.diningDrinks, 2);
        var oldDrink = drinks[0];
        var newDrink = drinks[1];
        var n1 = G.num(4, 8, null, null, 'n1');
        var n2 = n1 + (G.coin() ? 1 : 2);
        var rt = G.pick(P.times.slice(1, 6));
        var pos = G.pick(P.places);
        var mat = G.pick(P.boxMats);
        var pc = G.pick(P.colors);
        var fs = flowerSet(G);
        var v = {
            p4: p4, who: who, r: r, nb: nb, joiner: joiner, e1: exclPerson1, e2: exclPerson2, f1: exclFood1, f2: exclFood2,
            dish1: dish1, dish2: dish2, oldMethod: oldMethod, newMethod: newMethod, addDish: addDish, addMethod: addMethod,
            oldDrink: oldDrink, newDrink: newDrink, n1: cnCount(n1), n2: cnCount(n2), rt: rt,
            pos: pos, mat: mat, pc: pc, k1: fs.ok[0], k2: fs.ok[1], k3: fs.ok[2], fx: fs.no,
            today: today.sw, ev: ev.sw
        };
        var note = [
            T('今天是{today}。明天{ev}要在{r}聚餐，{p4}一家會回來。', v),
            T('{who}早上交代你：「先訂{n1}個人的位子，{rt}前要跟餐廳確認人數。」', v),
            T('「菜先點{dish1}、{dish2}，{dish1}要{oldMethod}的。飲料先點{oldDrink}。」', v),
            T('{nb}剛好經過，說{r}隔壁新開一家飲料店，第一杯半價，不過今天沒空去買。', v),
            T('{who}又說：「{e1}不吃{f1}，{e2}不吃{f2}，記得先跟餐廳說一聲。」', v),
            T('「對了，{pos}那個{pc}的{mat}禮盒，是要帶去送餐廳的，記得順便帶著。」', v),
            T('你正要出門，{who}又打電話回來：「{dish1}改成{newMethod}的。{dish2}不用點了，改點{addMethod}的{addDish}。」', v),
            T('「飲料也改一下，{oldDrink}不要了，改點{newDrink}。{joiner}說他也會來，位子改訂{n2}個人。」', v),
            T('「順便帶一束花去，{k1}、{k2}或{k3}都可以，就是不要{fx}的。」', v)
        ];

        var ti = P.times.indexOf(rt);
        var giftboxQ = G.attrQ('關於那個禮盒，哪一個說法完全正確？', [
            { val: pos, alts: G.others(P.places, pos, '差一點點', 2) },
            { val: pc, alts: G.others(P.colors, pc, '差一點點', 2) },
            { val: mat, alts: G.others(P.boxMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[0], vals[1]].filter(Boolean).join('、');
            return (s ? s + '的' : '') + (vals[2] ? vals[2] + '禮盒' : '禮盒');
        }, 2);

        var qs = [
            G.q(dish1 + '最後要用什麼方式？', '更正', newMethod, [L(oldMethod, '新舊混淆', '「' + oldMethod + '」是改口之前的方式。')].concat(G.others(P.diningCookMethods, [oldMethod, newMethod], '差一點點', 2)), { must: true }),
            G.q(dish2 + '後來怎麼了？', '更正', '不點了，改點' + addDish, [
                L('改成' + newMethod + '的', '差一點點', '那是' + dish1 + '改的方式。'),
                L('不點了，改點' + dish1, '差一點點'),
                L('兩道都要', '拼湊組合', '只點' + addDish + '取代' + dish2 + '。')
            ], { must: true }),
            G.q(addDish + '要用什麼方式？', '更正', addMethod, G.others(P.diningCookMethods, [addMethod, oldMethod, newMethod], '差一點點', 3)),
            G.q('位子最後訂幾個人？', '更正', v.n2, [L(v.n1, '新舊混淆', '「' + v.n1 + '」是改之前的人數。')].concat(G.near(n2, cnCount, { lo: 1, hi: 20, swap: false })), { must: true }),
            G.q('飲料最後點什麼？', '更正', newDrink, [L(oldDrink, '新舊混淆', '「' + oldDrink + '」是改之前點的。')].concat(G.others(P.diningDrinks, [oldDrink, newDrink], '差一點點', 2)), { must: true }),
            G.q('誰不吃' + exclFood1 + '？', '人物', exclPerson1, [L(exclPerson2, '張冠李戴', exclPerson2 + '不吃的是' + exclFood2 + '。'), L(joiner, '差一點點'), L(who, '張冠李戴', who + '是交代這些事的人。')]),
            G.q('誰不吃' + exclFood2 + '？', '人物', exclPerson2, [L(exclPerson1, '張冠李戴', exclPerson1 + '不吃的是' + exclFood1 + '。'), L(joiner, '差一點點'), L(who, '張冠李戴', who + '是交代這些事的人。')]),
            G.q(exclPerson1 + '不吃什麼？', '物品', exclFood1, [L(exclFood2, '張冠李戴', exclFood2 + '是' + exclPerson2 + '不吃的。')].concat(G.others(P.diningExcludes, [exclFood1, exclFood2], '差一點點', 2))),
            G.q(exclPerson2 + '不吃什麼？', '物品', exclFood2, [L(exclFood1, '張冠李戴', exclFood1 + '是' + exclPerson1 + '不吃的。')].concat(G.others(P.diningExcludes, [exclFood1, exclFood2], '差一點點', 2))),
            G.q('誰說要臨時加入？', '人物', joiner, [L(exclPerson1, '張冠李戴', exclPerson1 + '不吃' + exclFood1 + '，不是臨時加入的。'), L(exclPerson2, '張冠李戴', exclPerson2 + '不吃' + exclFood2 + '，不是臨時加入的。'), L(nb, '似曾相識', nb + '只是剛好經過。')]),
            G.q('是誰交代這些事的？', '人物', who, [L(nb, '似曾相識', nb + '只是剛好經過。'), L(p4, '張冠李戴', p4 + '是明天要回來的人。')].concat(G.others(P.home, who))),
            G.q('是哪一位家人明天會回來？', '人物', p4, [L(joiner, '張冠李戴', joiner + '是臨時加入的。'), L(who, '張冠李戴', who + '是交代這些事的人。')].concat(G.others(P.relatives, p4, '差一點點', 1))),
            giftboxQ,
            G.q('要去哪家餐廳聚餐？', '地點', r, G.others(P.diningRestaurants, r, '差一點點', 3)),
            G.q('最晚幾點要跟餐廳確認人數？', '時間', rt, G.others(P.times.slice(Math.max(0, ti - 2), ti + 3), rt, '數字相近')),
            G.dateQ('聚餐是哪一天？', ev, [L(today.s, '張冠李戴', today.s + '是今天，聚餐是隔天。')], { must: true }),
            G.weekQ('今天是星期幾？', today, [L(ev.w, '張冠李戴', ev.w + '是隔天聚餐的日子。')]),
            G.daysQ('今天離聚餐還有幾天？', today, ev)
        ].concat(flowerQs(G, fs, '花'));
        return { note: note, qs: finish(G, qs, 20) };
    }

    function D7(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home);
        var r0 = S.r[0];
        var r1 = S.r[1];
        var nb = people(G);
        var headN = G.num(6, 12, null, null, 'headN');
        var headN2 = headN + (G.coin() ? 1 : 2);
        var dish = G.pick(P.diningDishes);
        var dish2 = G.pick(P.diningDishes, null, [dish]);
        var drink = G.pick(P.diningDrinks);
        var drink2 = G.pick(P.diningDrinks, null, [drink]);
        var cat = G.pick(P.diningShops);
        var item = G.pick(cat.items);
        var n = G.num(1, 4, null, null, 'n7');
        var bus = G.num(123, 987, null, threeDiff);
        var pair = G.pick(P.streetPairs);
        var stopA = pair[G.int(0, 1)];
        var floor = G.num(2, 5, null, null, 'floor7');
        var pk2 = G.pick(PICKUP_PAIRS);
        var place2 = pk2.place;
        var floorItem = pk2.item;
        var startT = G.pick(P.times.slice(1, 5));
        var startT2 = G.any(P.times.filter(function (t) { return t !== startT; }));
        var decoN = G.num(3, 8, null, null, 'decoN');
        var decoN2 = decoN + G.int(1, 3);
        var per1 = G.num(3, 8, null, null, 'per1') * 100;
        var per2 = per1 + G.int(1, 3) * 100;
        var v = {
            who: who, r0: r0, r1: r1, nb: nb, headN: cnCount(headN), headN2: cnCount(headN2),
            dish: dish, dish2: dish2, drink: drink, drink2: drink2, shop: cat.shop, item: item, n: cnCount(n), u: cat.u,
            bus: bus, stopA: stopA, floor: floor, place2: place2, floorItem: floorItem,
            startT: startT, startT2: startT2, decoN: cnCount(decoN), decoN2: cnCount(decoN2),
            per1: yuan(per1), per2: yuan(per2),
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}。{ev}要在{r0}聚餐，{who}要你先把東西準備好。', v),
            T('「先訂{headN}個人的位子，{startT}開始。菜先點{dish}、{dish2}，飲料先點{drink}。」', v),
            T('「順便搭 {bus} 號公車，在{stopA}下車，去{shop}買{n}{u}{item}。」', v),
            T('「再去{place2} {floor} 樓拿{floorItem}，大概抓每人 {per1}，先用這個數字跟大家收錢。」', v),
            T('{nb}聽說要聚餐，熱心地說{r1}也不錯，上次去吃很滿意，不過你們已經訂好{r0}了。', v),
            T('你想起上次聚餐，氣球是用{decoN}串布置的，這次還沒決定要幾串。', v),
            T('傍晚，{who}又打電話來，說計畫要改：「{r0}客滿了，改訂{r1}，位子也改成{headN2}個人。」', v),
            T('「時間也改一下，{startT}改成{startT2}。{dish}不用點了，直接點{dish2}，飲料改喝{drink2}。」', v),
            T('「氣球改成{decoN2}串，每人的錢也要跟著調整，改抓 {per2} 一個人。」', v)
        ];

        var qs = [
            G.q('最後要去哪家餐廳聚餐？', '更正', r1, [L(r0, '新舊混淆', r0 + '客滿了，改訂' + r1 + '。')].concat(G.others(P.diningRestaurants, [r0, r1], '差一點點', 2)), { must: true }),
            G.q('一開始訂的是哪家餐廳？', '一開始', r0, [L(r1, '新舊混淆', r1 + '是後來改訂的。')].concat(G.others(P.diningRestaurants, [r0, r1], '差一點點', 2)), { old: true }),
            G.q('最後位子訂幾個人？', '更正', v.headN2, [L(v.headN, '新舊混淆', v.headN + '個人是改之前的人數。')].concat(G.near(headN2, cnCount, { lo: 4, hi: 24, swap: false })), { must: true }),
            G.q('一開始訂幾個人的位子？', '一開始', v.headN, [L(v.headN2, '新舊混淆', v.headN2 + '個人是後來改的人數。')].concat(G.near(headN, cnCount, { lo: 4, hi: 24, swap: false })), { old: true }),
            G.q('聚餐最後幾點開始？', '更正', startT2, [L(startT, '新舊混淆', startT + '是改之前的時間。')].concat(G.others(P.times, [startT, startT2], '差一點點', 2)), { must: true }),
            G.q('聚餐一開始訂幾點開始？', '一開始', startT, [L(startT2, '新舊混淆', startT2 + '是後來改的時間。')].concat(G.others(P.times, [startT, startT2], '差一點點', 2)), { old: true }),
            G.q(dish + '後來怎麼了？', '更正', '不點了，改點' + dish2, [
                L('改成' + dish2, '差一點點'),
                L('兩道都要', '拼湊組合', '只點' + dish2 + '，' + dish + '不點了。'),
                L('兩道都不點', '差一點點', dish2 + '還是有點的。')
            ], { must: true }),
            G.q('最後確定要點的另一道菜是？', '物品', dish2, [L(dish, '新舊混淆', dish + '後來不點了。')].concat(G.others(P.diningDishes, [dish, dish2], '差一點點', 2))),
            G.q('飲料最後喝什麼？', '更正', drink2, [L(drink, '新舊混淆', drink + '是改之前點的。')].concat(G.others(P.diningDrinks, [drink, drink2], '差一點點', 2)), { must: true }),
            G.q('氣球最後要幾串？', '更正', v.decoN2, [L(v.decoN, '新舊混淆', v.decoN + '串是上次聚餐用的數量。')].concat(G.near(decoN2, cnCount, { lo: 1, hi: 12, swap: false })), { must: true }),
            G.q('每人最後改抓多少錢？', '更正', v.per2, [L(v.per1, '新舊混淆', v.per1 + '是改之前的金額。')].concat(G.near(per2, yuan, { step: 100, swap: false })), { must: true }),
            G.q('一開始抓每人多少錢？', '一開始', v.per1, [L(v.per2, '新舊混淆', v.per2 + '是後來改的金額。')].concat(G.near(per1, yuan, { step: 100, swap: false })), { old: true }),
            G.q(T('在{shop}要買什麼？', v), '物品', item, G.others(cat.items, item, '差一點點', 3)),
            G.q(T('在{shop}要買幾{u}？', v), '數字', v.n + cat.u, G.near(n, function (x) { return cnCount(x) + cat.u; }, { lo: 1, hi: 6, swap: false })),
            G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 100, hi: 999 })),
            G.q('要在哪裡下車？', '地點', stopA, G.others(P.streetPairs.map(function (p) { return p[0]; }).concat(P.streetPairs.map(function (p) { return p[1]; })), stopA, '差一點點', 3)),
            G.q(T('去{place2}要拿什麼？', v), '物品', floorItem, G.others(PICKUP_PAIRS.map(function (p) { return p.item; }), floorItem, '差一點點')),
            G.q(T('{place2}在幾樓？', v), '數字', floor + ' 樓', G.near(floor, function (x) { return x + ' 樓'; }, { lo: 1, hi: 9, swap: false })),
            G.q('誰說起另一家餐廳不錯？', '人物', nb, [L(who, '張冠李戴', who + '是交代這些事的人。')].concat(G.others(P.friends, [nb, who], '差一點點', 2))),
            G.q('是誰交代這些事的？', '人物', who, [L(nb, '似曾相識', nb + '只是說另一家餐廳不錯。')].concat(G.others(P.home, who))),
            G.q(T('買{item}是去哪一家店？', v), '地點', cat.shop, G.others(P.diningShops.map(function (s) { return s.shop; }), cat.shop, '差一點點')),
            G.dateQ('聚餐是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.weekQ('聚餐是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')]),
            G.daysQ('今天離聚餐還有幾天？', D.today, D.ev)
        ];
        return { note: note, qs: finish(G, qs, 24, 4) };
    }

    function D8(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home);
        var r = S.r[0];
        var nb = people(G);
        var nb2 = people(G, null, [nb]);
        var cat = G.pick(P.diningShops);
        var item = G.pick(cat.items);
        var n = G.num(1, 4, null, null, 'n8');
        var bus = G.num(123, 987, null, threeDiff);
        var pair1 = G.pick(P.streetPairs);
        var pair2 = G.pick(P.streetPairs, null, [pair1]);
        var t1 = G.coin() ? '右' : '左';
        var t2 = G.coin() ? '右' : '左';
        var stopFinal = G.pick(P.stops);
        var actionList = ['先跟服務生說訂位的名字', '先去洗手間洗手', '先把外套掛起來', '先幫忙把椅子排好'];
        var action = G.pick(actionList);
        var seat3 = G.pick(P.kin.concat(P.friends), 3);
        var head = seat3[0];
        var left = seat3[1];
        var right = seat3[2];
        var dishes = G.pick(P.diningDishes, 2);
        var dish1 = dishes[0];
        var dish2 = dishes[1];
        var oldDish = G.pick(P.diningDishes, null, dishes);
        var excl2 = G.pick(P.kin.concat(P.friends), 2, seat3);
        var exclFoods = G.pick(P.diningExcludes, 2);
        var drinkers = G.pick(P.kin.concat(P.friends), 2, seat3.concat(excl2));
        var dk = G.pick(P.diningDrinks, 2);
        var rideN = G.pick(P.kin.concat(P.friends), 2, seat3.concat(excl2).concat(drinkers));
        var rideA = rideN[0];
        var rideB = rideN[1];
        var headFinal = G.num(6, 14, null, null, 'headFinal');
        var per = G.num(3, 8, null, null, 'per8') * 100;
        var total = per * headFinal;
        var itemPrice = G.num(2, 6, null, null, 'itemPrice8') * 50;
        var pk2 = G.pick(PICKUP_PAIRS);
        var place2 = pk2.place;
        var floor2 = G.num(2, 5, null, null, 'floor8');
        var thing2 = pk2.item;
        var thing2U = PICKUP_UNITS[thing2];
        var thing2N = G.num(1, 3, null, null, 'thing2N8');
        var decorItem = G.pick(P.diningThings4);
        var decorColor = G.pick(P.colors);
        var decorShape = G.pick(P.shapes);
        var v = {
            who: who, r: r, nb: nb, nb2: nb2, shop: cat.shop, item: item, n: cnCount(n), u: cat.u,
            bus: bus, p1: pair1[t1 === '右' ? 0 : 1], p2: pair2[t2 === '右' ? 0 : 1], t1: t1, t2: t2, stopFinal: stopFinal,
            action: action, head: head, left: left, right: right, dish1: dish1, dish2: dish2, oldDish: oldDish,
            e1: excl2[0], e2: excl2[1], f1: exclFoods[0], f2: exclFoods[1],
            d1: drinkers[0], dk1: dk[0], d2: drinkers[1], dk2: dk[1],
            rideA: rideA, rideB: rideB, headFinal: cnCount(headFinal), per: yuan(per), total: yuan(total), itemPrice: yuan(itemPrice),
            place2: place2, floor2: floor2, thing2: thing2, thing2U: thing2U, thing2N: cnCount(thing2N),
            decorItem: decorItem, decorColor: decorColor, decorShape: decorShape,
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}，要在{r}聚餐，{who}傳訊息提醒你，下班後要辦幾件事再過去。', v),
            T('「先搭 {bus} 號公車去{shop}，買{n}{u}{item}，大概 {itemPrice}。」', v),
            T('{nb}上次說，{oldDish}這道菜很好吃，不過這次沒點。', v),
            T('「再去{place2} {floor2} 樓拿{thing2N}{thing2U}{thing2}。」', v),
            T('「騎 UBIKE 到{p1}{t1}轉，再到{p2}{t2}轉，就會看到{stopFinal}，餐廳在附近。」', v),
            T('{nb2}提醒你，到了餐廳門口，{action}，比較禮貌。', v),
            T('桌上要擺一個{decorColor}的{decorShape}{decorItem}，記得順便帶去。', v),
            T('位子已經排好：主位是{head}，{head}左邊坐{left}，右邊坐{right}。', v),
            T('菜點了{dish1}、{dish2}，{e1}不吃{f1}，{e2}不吃{f2}，已經先跟餐廳說過了。', v),
            T('飲料也點好了：{d1}喝{dk1}，{d2}喝{dk2}。', v),
            T('一共訂了{headFinal}個人的位子，每人要分攤 {per}，加起來一共 {total}。', v),
            T('吃完飯，{rideA}說要載{rideB}回家，剩下的人自己想辦法。', v)
        ];

        var seatHeadQ = G.q('聚餐時誰坐主位？', '人物', head,
            [L(left, '差一點點'), L(right, '差一點點')].concat(G.others(P.kin.concat(P.friends), [head, left, right], '差一點點', 1)));
        var seatLeftQ = G.q(head + '左邊坐誰？', '人物', left,
            [L(right, '順序顛倒', '左右弄反了，坐左邊的是' + left + '。')].concat(G.others(P.kin.concat(P.friends), [head, left, right], '差一點點', 2)));
        var seatRightQ = G.q(head + '右邊坐誰？', '人物', right,
            [L(left, '順序顛倒', '左右弄反了，坐右邊的是' + right + '。')].concat(G.others(P.kin.concat(P.friends), [head, left, right], '差一點點', 2)));

        var qs = [
            G.q(T('在{shop}要買什麼？', v), '物品', item, G.others(cat.items, item, '差一點點', 3)),
            G.q(T('在{shop}要買幾{u}？', v), '數字', v.n + cat.u, G.near(n, function (x) { return cnCount(x) + cat.u; }, { lo: 1, hi: 6, swap: false })),
            G.q(T('買{item}大概多少錢？', v), '數字', v.itemPrice, G.near(itemPrice, yuan, { step: 50, swap: false })),
            G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 100, hi: 999 }), { must: true }),
            turnQ(G, T('到{p1}要怎麼轉？', v), t1, t2, T('那是到' + v.p2 + '的轉法。', v)),
            turnQ(G, T('到{p2}要怎麼轉？', v), t2, t1, T('那是到' + v.p1 + '的轉法。', v)),
            G.q('最後會看到哪一站？', '地點', stopFinal, G.others(P.stops, stopFinal, '差一點點', 3)),
            G.q('到餐廳門口要先做什麼？', '物品', action, G.others(actionList, action, '差一點點', 3), { must: true }),
            G.q(T('去{place2}要拿什麼？', v), '物品', thing2, G.others(PICKUP_PAIRS.map(function (p) { return p.item; }), thing2, '差一點點')),
            G.q(T('{place2}在幾樓？', v), '數字', floor2 + ' 樓', G.near(floor2, function (x) { return x + ' 樓'; }, { lo: 1, hi: 9, swap: false })),
            G.q(T('要拿幾{thing2U}{thing2}？', v), '數字',
                cnCount(thing2N) + thing2U,
                G.near(thing2N, function (x) { return cnCount(x) + thing2U; }, { lo: 1, hi: 6, swap: false })),
            G.q('要去哪一家餐廳聚餐？', '地點', r, G.others(P.diningRestaurants, r, '差一點點', 3)),
            G.q(decorItem + '是什麼顏色？', '顏色', decorColor, G.others(P.colors, decorColor, '差一點點', 3)),
            G.q(decorItem + '是什麼形狀？', '形狀', decorShape, G.others(P.shapes, decorShape, '差一點點', 3)),
            seatHeadQ, seatLeftQ, seatRightQ,
            G.q('誰不吃' + exclFoods[0] + '？', '人物', excl2[0], [L(excl2[1], '張冠李戴', excl2[1] + '不吃的是' + exclFoods[1] + '。')].concat(G.others(P.kin.concat(P.friends), excl2, '差一點點', 2))),
            G.q('誰不吃' + exclFoods[1] + '？', '人物', excl2[1], [L(excl2[0], '張冠李戴', excl2[0] + '不吃的是' + exclFoods[0] + '。')].concat(G.others(P.kin.concat(P.friends), excl2, '差一點點', 2))),
            G.q(excl2[0] + '不吃什麼？', '物品', exclFoods[0], [L(exclFoods[1], '張冠李戴', exclFoods[1] + '是' + excl2[1] + '不吃的。')].concat(G.others(P.diningExcludes, exclFoods, '差一點點', 2))),
            G.q(excl2[1] + '不吃什麼？', '物品', exclFoods[1], [L(exclFoods[0], '張冠李戴', exclFoods[0] + '是' + excl2[0] + '不吃的。')].concat(G.others(P.diningExcludes, exclFoods, '差一點點', 2))),
            G.q('最後確定點了哪兩道菜？', '物品', dish1 + '、' + dish2, [L(dish1 + '、' + oldDish, '似曾相識', oldDish + '是' + nb + '提過的，沒有點。')]
                .concat(G.others(P.diningDishes.filter(function (d) { return [dish1, dish2, oldDish].indexOf(d) < 0; }), [], '差一點點', 2).map(function (l) { return L(dish1 + '、' + l.v, l.k); }))),
            G.q('誰喝' + dk[0] + '？', '人物', drinkers[0], [L(drinkers[1], '張冠李戴', drinkers[1] + '喝的是' + dk[1] + '。')].concat(G.others(P.kin.concat(P.friends), drinkers, '差一點點', 2))),
            G.q(drinkers[1] + '要喝什麼？', '物品', dk[1], [L(dk[0], '張冠李戴', dk[0] + '是' + drinkers[0] + '要的。')].concat(G.others(P.diningDrinks, dk, '差一點點', 2))),
            G.q('一共訂了幾個人的位子？', '數字', v.headFinal, G.near(headFinal, cnCount, { lo: 1, hi: 24, swap: false }), { must: true }),
            G.q('每人要分攤多少錢？', '計算', v.per, [L(v.total, '計算失誤', '那是' + v.headFinal + '個人的總金額，不是一個人的。')].concat(G.near(per, yuan, { step: 50, swap: false })), { must: true }),
            G.q('一共要付多少錢？', '計算', v.total, [L(v.per, '計算失誤', '那是一個人要分攤的錢，不是總金額。'), L(yuan(per * (headFinal - 1)), '計算失誤'), L(yuan(per * (headFinal + 1)), '計算失誤')], { must: true }),
            G.q('吃完飯誰要載' + rideB + '回家？', '人物', rideA, [L(rideB, '差一點點', rideB + '是被載的人。')].concat(G.others(P.kin.concat(P.friends), [rideA, rideB], '差一點點', 2)), { must: true }),
            G.q('吃完飯' + rideA + '要載誰回家？', '人物', rideB, [L(rideA, '差一點點', rideA + '是開車載人的。')].concat(G.others(P.kin.concat(P.friends), [rideA, rideB], '差一點點', 2))),
            G.q('誰說' + oldDish + '很好吃？', '人物', nb, [L(who, '張冠李戴', who + '是傳訊息提醒你的人。'), L(nb2, '似曾相識', nb2 + '只是提醒你進門禮貌。')].concat(G.others(P.friends, [nb, who, nb2], '差一點點', 1))),
            G.q('是誰傳訊息提醒你的？', '人物', who, [L(nb, '似曾相識', nb + '只是說' + oldDish + '很好吃。'), L(nb2, '似曾相識', nb2 + '只是提醒你進門禮貌。')].concat(G.others(P.home, who))),
            G.q('是誰提醒你進門要有禮貌的？', '人物', nb2, [L(nb, '似曾相識', nb + '只是說' + oldDish + '很好吃。'), L(who, '張冠李戴', who + '是傳訊息提醒你的人。')].concat(G.others(P.friends, [nb, who, nb2], '差一點點', 1))),
            G.dateQ('聚餐是哪一天？', D.ev, [], { must: true }),
            G.weekQ('聚餐是星期幾？', D.ev)
        ];
        return { note: note, qs: finish(G, qs, 32, 6) };
    }
})();
