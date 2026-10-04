/* ═══════════════════════════════════════════════════════════════════
   quiz_happyBirthday.js — 測試模式・主軸一：生日
   · 不同人的生日、不同的需求；8 關完全獨立撰寫（不共用其他主軸的關卡邏輯）。
   · 第 1～4 關：準備生日會要辦的差事（訂蛋糕、買禮物、布置會場…），
     每一關都會點名是誰的生日、生日是哪一天，緊貼「生日」主題。
   · 第 5～8 關：兩段行程、臨時改口、一通電話、回家的路，全部圍繞著幫忙籌備生日會。
   ───────────────────────────────────────────────────────────────────
   跟其他主軸檔案（quiz_travel.js／quiz_health.js／quiz_dining.js）完全同一套
   寫法：抽亂數、組題目的底層工具都來自 js/quiz_gen.js（檔案最上面
   `var lib = Q.lib;` 引用進來的那些方法），這裡的 B1~B8（下面各關函式的
   命名）只負責「生日主軸的 8 關各自要問什麼」。寫法細節（setup/S 參數、
   T()/G.q() 怎麼用、finish() 的作用）看 js/quiz_travel.js 開頭的完整說明，
   不重複寫一次。 */

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
    var otherGrand = lib.otherGrand;
    var flowerSet = lib.flowerSet;
    var flowerQs = lib.flowerQs;
    var turnQ = lib.turnQ;
    var timeline = lib.timeline;

    /* ─── 第 1 關：一件事（訂蛋糕付訂金、拿卡片、訂花…都是生日會的準備工作） ─── */
    var B_ERRANDS1 = [
        { place: '蛋糕店', act: '付', u: '筆', thing: '蛋糕訂金' },
        { place: '文具店', act: '買', u: '張', thing: '生日卡片' },
        { place: '相片沖印店', act: '拿', u: '張', thing: '洗好的照片' },
        { place: '花店', act: '訂', u: '束', thing: '生日花束' },
        { place: '西服店', act: '拿', u: '件', thing: '燙好的衣服' },
        { place: '禮品店', act: '拿', u: '個', thing: '包好的禮物' }
    ];

    /* ─── 第 2 關：兩件差事（打電話來的人自己在準備自己的生日會） ─── */
    var B_SHOPS2 = [
        { shop: '蛋糕店', u: '個', items: ['生日蛋糕', '杯子蛋糕', '慕斯蛋糕', '奶酥捲', '海綿蛋糕'] },
        { shop: '禮品店', u: '個', items: ['音樂盒', '相框', '存錢筒', '玩偶', '珠寶盒'] },
        { shop: '文具店', u: '包', items: ['氣球', '拉炮', '生日帽', '貼紙', '彩色蠟筆'] },
        { shop: '花店', u: '束', items: ['玫瑰', '康乃馨', '百合', '向日葵', '桔梗'] }
    ];

    /* ─── 第 3 關：先後順序（生日會前要辦的幾件事） ─── */
    var B_ERRANDS3 = [
        { k: '拿蛋糕', place: '蛋糕店', act: '拿{n}個訂好的蛋糕', q: '要拿幾個蛋糕？', u: '個', early: '蛋糕店五點就打烊了', late: '蛋糕最後拿才不會提前融化' },
        { k: '租音響', place: '租借行', act: '租{n}台小音響', q: '要租幾台音響？', u: '台', early: '租借行六點就關門了', late: '音響最後放，比較不佔位子' },
        { k: '買氣球', place: '雜貨店', act: '買{n}包氣球', q: '要買幾包氣球？', u: '包', early: '雜貨店提早打烊', late: '氣球最後拿才不會被壓扁' },
        { k: '拿照片', place: '相片沖印店', act: '拿{n}張洗好的照片', q: '要拿幾張照片？', u: '張', early: '沖印店五點半就休息', late: '照片要等老闆掃描完才能拿' },
        { k: '訂花束', place: '花店', act: '訂{n}束生日花束', q: '要訂幾束花？', u: '束', early: '花店老闆說晚點就沒現貨了', late: '花要保持新鮮，最後才拿' },
        { k: '買蠟燭', place: '文具店', act: '買{n}盒生日蠟燭', q: '要買幾盒蠟燭？', u: '盒', early: '文具店六點就拉下鐵門', late: '蠟燭很輕，放最後也不重' },
        { k: '拿包裝紙', place: '禮品店', act: '拿{n}張訂好的包裝紙', q: '要拿幾張包裝紙？', u: '張', early: '禮品店五點半打烊', late: '要等禮物挑好才能包' }
    ];

    /* ─── 第 4 關：顏色形狀（布置生日會的東西、party 零食、紀念相片盒） ─── */
    var B_THINGS4 = P.partyThings.concat(['派對拉旗', '吹泡泡棒', '許願卡片', '小禮物袋', '生日胸章', '氣球棒']);
    var B_ODDSNACKS = P.oddSnacks.map(function (s) { return { n: s.n, u: '包', typ: s.typ, odd: [s.odd] }; });

    /* ═══ 第 1 關：新手暖身（一件事，幾乎沒有干擾） ═══ */
    /* 【新手導讀】寫法與 js/quiz_travel.js 完全相同（共用 js/quiz_gen.js 的出題引擎）：G 是這一關的出題器，S 是整局共用資料，T 是範本代入，L 是誘答選項，finish 挑出要用的題目。B1 是生日主軸的第 1 關（最簡單），B2～B8 逐關加干擾；逐行說明請看 quiz_travel.js 的第 1 關。 */
    function B1(G, S) {
        var D = S.tl[S.i];
        /* G.pick：隨機挑一個 */
        var p = G.pick(P.kin.concat(P.friends));
        var e = G.pick(B_ERRANDS1);
        /* G.num：抽數字，twoDiff 避免兩位數有重複數字 */
        var bus = G.num(12, 98, null, twoDiff);
        var stop = G.pick(P.stops);
        var floor = G.num(2, 5, null, null, 'floor');
        var n = G.num(2, 4, [floor], null, 'n');
        /* v：範本代入用的資料包 */
        var v = { p: p, bus: bus, stop: stop, place: e.place, floor: floor, act: e.act, n: n, u: e.u, thing: e.thing, today: D.today.sw, ev: D.ev.sw };
        /* note：紙條，每個元素是一段文字 */
        var note = [
            T('{ev}是{p}的生日，你下午五點下班，要先幫忙辦一件事：', v),
            T('搭 {bus} 號公車，在{stop}下車，', v),
            T('去{place} {floor} 樓，{act} {n} {u}{thing}。', v)
        ];
        /* fl、cu：把答案格式化成「3 樓」「2 袋」的小函式 */
        var fl = function (x) { return x + ' 樓'; };
        var cu = function (x) { return x + ' ' + e.u; };
        /* qs：候選題目；G.dateQ 日期題、G.q(題目, 題型, 正解, [誘答])、L(文字, 混淆類型, 說明) 做誘答 */
        var qs = [
            G.dateQ('生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天，生日是' + D.ev.s + '。')], { must: true }),
            G.q('是誰要過生日？', '人物', p, G.others(P.kin.concat(P.friends), p, '差一點點')),
            G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 10, hi: 99 })),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('{place}在幾樓？', v), '數字', fl(floor),
                [L(fl(n), '張冠李戴', n + ' 是' + e.thing + '的數量，不是樓層。')].concat(G.near(floor, fl, { lo: 1, hi: 9, swap: false }))),
            G.q(T('要{act}幾{u}{thing}？', v), '數字', cu(n),
                [L(cu(floor), '張冠李戴', floor + ' 是樓層，不是' + e.thing + '的數量。')].concat(G.near(n, cu, { lo: 1, hi: 9, swap: false })))
        ];
        /* finish：從候選題目挑出這關要用的 4 題 */
        return { note: note, qs: finish(G, qs, 4) };
    }

    /* ═══ 第 2 關：兩件差事（打電話來的人在準備自己的生日會） ═══ */
    function B2(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home.concat(P.friends));
        var cs = G.pick(B_SHOPS2, 2);
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
            who: who, bus: bus, stop: stop, s1: c1.shop, s2: c2.shop, n1: cnCount(n1), n2: cnCount(n2),
            u1: c1.u, u2: c2.u, i1: i1, i2: i2, lure: lure, house: house, today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('{today}，{who}打電話來說：「{ev}是我的生日。」', v),
            T('「下班後幫我跑兩個地方好不好？先搭 {bus} 號公車到{stop}，去{s1}買{n1}{u1}{i1}。」', v),
            T('「然後走到{s2}，買{n2}{u2}{i2}。上次你買成{lure}，這次別再買錯囉！」掛電話前，{who}還說自己家的門牌換新了，是 {house} 號。', v)
        ];
        var f1 = function (x) { return cnCount(x) + c1.u; };
        var f2 = function (x) { return cnCount(x) + c2.u; };
        var lureWhy = '「' + lure + '」是上次買錯的。';
        var qs = [
            G.dateQ(who + '的生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是打電話來的那天。')], { must: true }),
            G.weekQ(who + '的生日是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是打電話來的那天。')]),
            G.q('要搭幾號公車？', '數字', bus,
                [L(house, '似曾相識', house + ' 是' + who + '家的門牌號碼。')].concat(G.near(bus, String, { lo: 10, hi: 99 }))),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('在{s1}要買什麼？', v), '物品', i1,
                [L(i2, '張冠李戴', i2 + '是在' + c2.shop + '買的。'), L(lure, '似曾相識', lureWhy), L(sib1, '差一點點')]),
            G.q(T('在{s1}要買幾{u1}？', v), '數字', f1(n1),
                [L(f1(n2), '張冠李戴', '「' + cnCount(n2) + '」是在' + c2.shop + '買的數量。')].concat(G.near(n1, f1, { lo: 1, hi: 6, swap: false }))),
            G.q(T('在{s2}要買什麼？', v), '物品', i2,
                [L(lure, '似曾相識', lureWhy), L(i1, '張冠李戴', i1 + '是在' + c1.shop + '買的。'), L(sib2, '差一點點')]),
            G.q(T('在{s2}要買幾{u2}？', v), '數字', f2(n2),
                [L(f2(n1), '張冠李戴', '「' + cnCount(n1) + '」是在' + c1.shop + '買的數量。')].concat(G.near(n2, f2, { lo: 1, hi: 6, swap: false })))
        ];
        return { note: note, qs: finish(G, qs, 6) };
    }

    /* ═══ 第 3 關：先後順序（生日會前的幾件差事，講的順序和做的順序不一樣） ═══ */
    function B3(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home.concat(P.friends));
        var nb = people(G, null, [who]);
        var p = G.pick(P.kin.concat(P.friends));
        var es = G.pick(B_ERRANDS3, 3);
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
            who: who, nb: nb, p: p, bus: bus, Ap: A.place, Aa: act(A, 0), Ae: A.early, Bp: B.place, Ba: act(B, 1),
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
        var note = [T('今天是{today}。{ev}是{p}的生日。', v)].concat(body, [
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
        qs.push(G.dateQ('大家準備慶生的生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }));
        qs.push(G.daysQ('今天離那個生日還有幾天？', D.today, D.ev));
        qs.push(G.q('是誰要過生日？', '人物', p, G.others(P.kin.concat(P.friends), p, '差一點點')));
        return { note: note, qs: finish(G, qs, 8) };
    }

    /* ═══ 第 4 關：顏色形狀（布置生日會的東西、party 零食、紀念相片盒） ═══ */
    function B4(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home);
        var nb = people(G, null, [who]);
        var g = G.pick(P.grand);
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var street = pair[a];
        var alt = pair[1 - a];
        var shop = G.pick(P.partyShops);
        var cols = G.pick(P.colors, 3);
        var shs = G.pick(P.shapes, 3);
        var things = G.pick(B_THINGS4, 4);
        var si = G.shuffle([0, 1, 2]);
        var x;
        var y;
        do { x = G.int(0, 2); y = G.int(0, 2); } while (si[x] === y);
        var objs = G.shuffle([0, 1, 2].map(function (i) { return { n: things[i], c: cols[i], s: shs[si[i]] }; })
            .concat([{ n: things[3], c: cols[x], s: shs[y] }]));
        var sn = G.pick(B_ODDSNACKS, 2);
        var fc = [G.any(sn[0].odd)];
        var odd2 = sn[1].odd.filter(function (c) { return c !== fc[0]; });
        fc.push(G.any(odd2.length ? odd2 : sn[1].odd));
        var fn0 = G.num(1, 4, null, null, 'fn1');
        var fn = [fn0, G.num(1, 4, [fn0], null, 'fn2')];
        var box = G.pick(P.boxThings);
        var pos = G.pick(P.places);
        var jc = cols[G.int(0, 2)];
        var mat = G.pick(P.boxMats);
        var lc = G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && fc.indexOf(c) < 0; }));
        var v = {
            who: who, nb: nb, g: g, street: street, shop: shop, lc: lc, pos: pos, jc: jc, mat: mat,
            sk1: sn[0].n, sk2: sn[1].n, fc1: fc[0], fc2: fc[1], fn1: cnCount(fn[0]), fn2: cnCount(fn[1]), su1: sn[0].u, su2: sn[1].u, box: box,
            today: D.today.sw, ev: D.ev.sw
        };
        objs.forEach(function (o, i) { v['c' + i] = o.c; v['s' + i] = o.s; v['n' + i] = o.n; });
        var note = [
            T('今天是{today}。{ev}是{g}的生日，{who}拜託你下班去{street}的{shop}，買幾樣布置生日會的東西。', v),
            T('「要一個{c0}的{s0}{n0}，還有一個{c1}的{s1}{n1}。」', v),
            T('{who}想了想又說：「再買一個{c2}的{s2}{n2}，和一個{c3}的{s3}{n3}。」', v),
            T('{nb}在旁邊聽到，說：「上次我在別家買的{n0}是{lc}的，用沒多久就壞了。」', v),
            T('派對零食也要買：{fc1}的{sk1}{fn1}{su1}、{fc2}的{sk2}{fn2}{su2}，{g}指定要吃這兩種。', v),
            T('最後，{who}交代：家裡放在{pos}的那個{jc}{mat}盒，裡面裝著去年生日拍的{box}，記得帶到會場給大家看看。', v)
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
        function snackColorQ(k) {
            var s = sn[k];
            var lures = [L(s.typ, '常理陷阱', s.n + '一般是' + s.typ + '，但這次要' + fc[k] + '的。')];
            lures.push(L(fc[1 - k], '張冠李戴', '「' + fc[1 - k] + '」是' + sn[1 - k].n + '的顏色。'));
            lures.push(L(cols[0], '張冠李戴', '「' + cols[0] + '」是' + ownerOfColor(cols[0]) + '的顏色。'));
            lures.push(L(spareColor([s.typ].concat(fc)), '差一點點'));
            return G.q(s.n + '要買什麼顏色的？', '顏色', fc[k], lures, { must: true });
        }
        function snackCountQ(k) {
            var s = sn[k];
            var fmt = function (n) { return cnCount(n) + s.u; };
            return G.q(s.n + '要買幾' + s.u + '？', '數字', fmt(fn[k]),
                [L(fmt(fn[1 - k]), '張冠李戴', '「' + cnCount(fn[1 - k]) + '」是' + sn[1 - k].n + '的數量。')].concat(G.near(fn[k], fmt, { lo: 1, hi: 6, swap: false })));
        }
        /* 紀念盒：位置、顏色、材質三個特徵 */
        var boxQ = G.attrQ('關於那個盒子，哪一個說法完全正確？', [
            { val: pos, alts: G.others(P.places, pos, '差一點點', 2) },
            {
                val: jc, alts: cols.filter(function (c) { return c !== jc; }).map(function (c) {
                    return L(c, '張冠李戴', '盒子是' + jc + '的；' + c + '是' + ownerOfColor(c) + '的顏色。');
                })
            },
            { val: mat, alts: G.others(P.boxMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[0], vals[1]].filter(Boolean).join('、');
            return (s ? s + '的' : '') + (vals[2] ? vals[2] + '盒' : '盒子');
        }, 2);

        var qs = [
            colorQ(order[0]), shapeQ(order[1]), revQ(order[2]), conjQ(order[3]),
            snackColorQ(0), snackColorQ(1), snackCountQ(0), snackCountQ(1), boxQ,
            G.q(shop + '在哪一條路？', '地點', street, [L(alt, '差一點點', '「' + alt + '」和「' + street + '」很像，紙條上是「' + street + '」。')]
                .concat(G.others(P.streetPairs.map(function (pr) { return pr[0]; }), [street, alt], '差一點點', 2))),
            G.q('誰指定要吃那兩種零食？', '人物', g, [L(who, '張冠李戴', who + '是拜託你買東西的人。'), L(nb, '似曾相識', nb + '只是在旁邊聽到。'),
            L(otherGrand(g), '差一點點')]),
            G.q('是誰拜託你買這些東西？', '人物', who, [L(nb, '似曾相識', nb + '只是在旁邊聽到。'), L(g, '張冠李戴', g + '是指定零食的人。')]
                .concat(G.others(P.friends.concat(P.home), [who, nb], '差一點點', 2))),
            G.dateQ('生日會是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.weekQ('生日會是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')])
        ];
        return { note: note, qs: finish(G, qs, 12) };
    }

    /* ═══ 第 5 關：兩段行程（兩班號碼很像的公車、兩個很像的站名、誰要的、花的範圍、四個特徵的盒子）═══ */
    function B5(G, S) {
        var D = S.tl[S.i];
        var bday = G.pick(P.kin.concat(P.friends));
        var ps = G.pick(P.kin.concat(P.friends), 2, [bday]);
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
            { place: '照相館', thing: '洗好的照片', k: '拿照片' }, { place: '眼鏡行', thing: '新配的眼鏡', k: '拿眼鏡' },
            { place: '鐘錶行', thing: '修好的手錶', k: '拿手錶' }, { place: '郵局', thing: '掛號包裹', k: '領包裹' },
            { place: '洗衣店', thing: '送洗的外套', k: '拿外套' }, { place: '裁縫店', thing: '改好的褲子', k: '拿褲子' }
        ]);
        var pkOthers = ['拿照片', '拿眼鏡', '拿手錶', '領包裹', '拿外套', '拿褲子'].filter(function (k) { return k !== pk.k; });
        var closeT = G.pick(P.times.slice(2));
        var cat = G.pick(P.shops);
        var i2 = G.pick(cat.items);
        var rest = G.shuffle(cat.items.filter(function (x) { return x !== i2; }));
        var lureItem = rest[0];
        var n2 = G.num(1, 4, null, null, 'n2');
        var flower = G.pick(P.flowers);
        var fs = flowerSet(G);
        var pos = G.pick(P.places);
        var pc = G.pick(P.colors);
        var lid = G.coin();
        var shape = G.pick(P.shapes);
        var mat = G.pick(P.boxMats);
        var content = G.pick(P.boxThings);
        var food = G.pick(['油飯', '紅蛋', '喜餅', '蛋糕']);
        var v = {
            bday: bday, p1: p1, p2: p2, nb: nb, bus1: bus1, bus2: bus2, stop1: stop1, stop2: stop2, place1: pk.place, thing1: pk.thing, closeT: closeT,
            shop2: cat.shop, n2: cnCount(n2), u2: cat.u, i2: i2, lure: lureItem, fl: flower, f1: fs.ok[0], f2: fs.ok[1], f3: fs.ok[2],
            fx: fs.no, fxr: fs.noWhy, pos: pos, pc: pc, lid: lid ? '有蓋子' : '沒有蓋子', shape: shape, mat: mat, content: content, food: food,
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}。{ev}是{bday}的生日。', v),
            T('{p1}和{p2}各拜託你一件事。{p1}要你搭 {bus1} 號公車，在{stop1}下車，去{place1}幫忙拿{thing1}，{place1}{closeT}就關門了。', v),
            T('{p2}則要你回程搭 {bus2} 號公車，在{stop2}下車，到{shop2}買{n2}{u2}{i2}。{p2}說上次買成{lure}，這次不要再買錯。', v),
            T('{p1}還想要一束{fl}，{f1}、{f2}或{f3}都可以，就是不要{fx}的，因為{fxr}。', v),
            T('另外，{p2}上次放在你家{pos}的那個盒子，這次要順便帶去還。那是一個畫著{pc}線條、{lid}的{shape}{mat}盒，裡面裝著{content}。', v),
            T('在公車上，{nb}跟你聊起孫子考上了大學，說下個月要請大家吃{food}，聊了好久。', v),
            T('{p1}還在電話裡抱怨，上次去{place1}等了快一個小時，這次希望快一點。', v)
        ];

        var streets = P.streetPairs.map(function (p) { return p[0]; }).concat(P.streetPairs.map(function (p) { return p[1]; }));
        var f2 = function (x) { return cnCount(x) + cat.u; };
        var ti = P.times.indexOf(closeT);
        var boxQ = G.attrQ('關於那個盒子，哪一個說法完全正確？', [
            { val: pc + '線條', alts: G.others(P.colors, pc, '差一點點', 2).map(function (l) { return L(l.v + '線條', l.k); }) },
            { val: lid ? '有蓋子' : '沒蓋子', alts: [L(lid ? '沒蓋子' : '有蓋子', '差一點點')] },
            { val: shape, alts: G.others(P.shapes, shape, '差一點點', 2) },
            { val: mat, alts: G.others(P.boxMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[0], vals[1]].filter(Boolean).join('、');
            return (s ? s + '的' : '') + (vals[2] || '') + (vals[3] ? vals[3] + '盒' : '盒子');
        }, 2);

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
            boxQ,
            G.q('盒子裡裝著什麼？', '物品', content, [L(food, '似曾相識', food + '是' + nb + '要請大家吃的。')].concat(G.others(P.boxThings, content, '差一點點'))),
            G.q('盒子現在放在你家哪裡？', '地點', pos, G.others(P.places, pos)),
            G.q('盒子要還給誰？', '人物', p2, [L(p1, '張冠李戴'), L(nb, '似曾相識')].concat(G.others(P.friends, [p1, p2, nb], '差一點點', 1))),
            G.q(T('在{shop2}要買什麼？', v), '物品', i2, [L(lureItem, '似曾相識', '「' + lureItem + '」是上次買錯的。'), L(food, '似曾相識', food + '是' + nb + '要請大家吃的。')]
                .concat(G.others(rest.slice(1), [], '差一點點', 2))),
            G.q(T('在{shop2}要買幾{u2}？', v), '數字', f2(n2), G.near(n2, f2, { lo: 1, hi: 7, swap: false })),
            G.dateQ('大家在準備的生日是哪一天？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天，生日是' + D.ev.s + '。')], { must: true }),
            G.weekQ('那個生日是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')]),
            G.q('是誰要過生日？', '人物', bday, [L(p1, '張冠李戴', p1 + '是拜託你拿東西的人。'), L(p2, '張冠李戴', p2 + '是拜託你買東西的人。'), L(nb, '似曾相識', nb + '只是在公車上聊天。')])
        ].concat(flowerQs(G, fs, flower));
        return { note: note, qs: finish(G, qs, 16) };
    }

    /* ═══ 第 6 關：臨時改口（買菜清單在電話裡被改掉；擾句；五個特徵的點心瓶）═══ */
    function B6(G, S) {
        var today = S.tl[S.i].today;
        var ev = addDays(today, 1);      /* 這一關：明天就是生日，今天去買菜 */
        var who = G.pick(P.home);
        var p4 = G.pick(P.relatives, null, [who]);
        var g = G.pick(P.grand);
        var nb = people(G);
        var market = G.pick(P.markets);
        var rt = G.pick(P.times.slice(1, 6));
        var hs = G.pick(P.herbs, 2);
        var H = hs[0];
        var H2 = hs[1];
        var H3 = G.any(P.herbs.filter(function (h) { return h !== H && h !== H2; }));
        var B1s = G.pick(P.soy);
        var B2s = G.pick(P.vinegarBrands);
        var V = G.pick(P.vinegars);
        var e1 = G.num(1, 3, null, null, 'e1');
        var e2 = G.num(2, 4, [e1], null, 'e2');
        var fish = G.pick(P.fish, 2);
        var fT = fish[G.int(0, 1)];
        var treat = G.pick(P.fishTreat);
        var fishFloor = G.pick(['一樓', '地下一樓']);
        var pork = G.num(15, 22, null, null, 'pork') * 10;
        var fr = G.pick(P.oddFruits, 2);
        var fc = [G.any(fr[0].odd)];
        fc.push(G.any(fr[1].odd));
        var fn0 = G.num(1, 4, null, null, 'fn1');
        var fn = [fn0, G.num(1, 4, [fn0], null, 'fn2')];
        var pos = G.pick(P.places);
        var pc = G.pick(P.colors, null, fc);
        var lid = G.coin();
        var shape = G.pick(P.shapes);
        var mat = G.pick(P.bottleMats);
        var sn = G.pick(P.oddSnacks);
        var fs = flowerSet(G);
        var v = {
            p4: p4, who: who, market: market, rt: rt, hq: '一' + H.u + H.n, H: H.n, good: H.good, bad: H.bad, res: H.res,
            e1: cnCount(e1), e2: cnCount(e2), f1: fish[0], f2: fish[1], fT: fT, treat: treat, ff: fishFloor, nb: nb, pork: pork,
            fr1: fr[0].n, fr2: fr[1].n, fc1: fc[0], fc2: fc[1], fn1: cnCount(fn[0]), fn2: cnCount(fn[1]), fu1: fr[0].u, fu2: fr[1].u, g: g,
            pos: pos, pc: pc, lid: lid ? '有蓋子' : '沒有蓋子', shape: shape, mat: mat, sc: sn.odd, snack: sn.n,
            h2q: '一' + H2.u + H2.n, B1: B1s, B2: B2s, V: V, k1: fs.ok[0], k2: fs.ok[1], k3: fs.ok[2], fx: fs.no,
            today: today.sw, ev: ev.sw
        };
        var note = [
            T('今天是{today}。明天{ev}是{p4}的生日，{p4}一家要回來吃午飯慶生。', v),
            T('{who}早上八點出門前交代你：「下午記得去{market}買菜，{rt}以前要回到家喔！」', v),
            T('「先買{hq}、一瓶醬油、一罐白醋，還有{e1}盒雞蛋。{H}要挑{good}一點的，上次你買的{H}太{bad}了，{res}。」', v),
            T('{who}想了想又說：「魚要買兩條，一條{f1}、一條{f2}，{fT}記得請老闆{treat}。魚攤在市場{ff}最裡面。」', v),
            T('{nb}剛好經過，說市場二樓的豬肉攤今天特價，一斤只要 {pork} 元，不過你們家不喜歡吃太油的豬肉。', v),
            T('蔬果要買{fc1}的{fr1}{fn1}{fu1}、{fc2}的{fr2}{fn2}{fu2}，{g}最近只吃這兩種。', v),
            T('對了，{pos}那個畫著{pc}線條、{lid}的{shape}{mat}瓶，是{p4}最喜歡的點心瓶，裡面的{sc}{snack}快吃完了，順便補滿。', v),
            T('你正要出門，{who}又打電話回來：「{H}不用買了，冰箱還有，改買{h2q}。醬油要買{B1}的；白醋也不要了，改買{B2}的{V}。」', v),
            T('「雞蛋改成{e2}盒，{p4}說要做蛋餅。花也順便帶一束，{k1}、{k2}或{k3}都可以，就是不要{fx}的。」', v)
        ];

        var other = function (arr, x) { return arr.filter(function (y) { return y !== x; }); };
        var fe = function (n) { return cnCount(n) + '盒'; };
        var ti = P.times.indexOf(rt);
        /* 點心瓶：位置、線條、蓋子、材質（形狀另外問，所以不放進這一題） */
        var jarQ = G.attrQ('關於點心瓶，哪一個說法完全正確？', [
            { val: pos, alts: G.others(P.places, pos, '差一點點', 2) },
            {
                val: pc + '線條', alts: [L(fc[0] + '線條', '張冠李戴', fc[0] + '是' + fr[0].n + '的顏色，瓶子是' + pc + '線條。')]
                    .concat(G.others(P.colors, [pc, fc[0]], '差一點點', 1).map(function (l) { return L(l.v + '線條', l.k); }))
            },
            { val: lid ? '有蓋子' : '沒蓋子', alts: [L(lid ? '沒蓋子' : '有蓋子', '差一點點')] },
            { val: mat, alts: G.others(P.bottleMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[1], vals[2]].filter(Boolean).join('、');
            return (vals[0] ? vals[0] + '的' : '') + (s ? s + '的' : '') + (vals[3] ? vals[3] + '瓶' : '瓶子');
        }, 2);

        var qs = [
            G.q('醬油要買哪個牌子？', '更正', B1s, [L(B2s, '張冠李戴', B2s + '是' + V + '的牌子。')].concat(G.others(P.soy, B1s, '差一點點', 2)), { must: true }),
            G.q('最後要買的醋是哪一種？', '更正', B2s + V, [
                L(B1s + V, '張冠李戴', '牌子弄錯了：' + B1s + '是醬油，' + V + '要買' + B2s + '的。'),
                L('白醋', '新舊混淆', '白醋後來不要了，改買' + B2s + '的' + V + '。'),
                L(B2s + '白醋', '拼湊組合', '這是把新的牌子和舊的白醋拼在一起了。'),
                L(B2s + other(P.vinegars, V)[0], '差一點點')
            ], { must: true }),
            G.q(H.n + '後來怎麼了？', '更正', '不買了，改買' + H2.n, [
                L('要挑' + H.good + '一點的', '新舊混淆', '這是改口之前的交代，後來' + H.n + '不買了。'),
                L('要挑' + H.bad + '一點的', '似曾相識', '「太' + H.bad + '」是上次買錯的。'),
                L('不買了，改買' + H3.n, '差一點點')
            ], { must: true }),
            G.q('雞蛋最後要買幾盒？', '更正', fe(e2), [L(fe(e1), '新舊混淆', '「' + cnCount(e1) + '盒」是改口之前的數量。')].concat(G.near(e2, fe, { lo: 1, hi: 6, swap: false })), { must: true }),
            G.q('要去哪個市場買菜？', '地點', market, G.others(P.markets, market)),
            G.q('最晚幾點要回到家？', '時間', rt, G.others(P.times.slice(Math.max(0, ti - 2), ti + 3), rt, '數字相近')),
            G.q('魚攤在市場幾樓？', '地點', fishFloor, [L('二樓', '似曾相識', '二樓是' + nb + '說的豬肉攤。'), L(fishFloor === '一樓' ? '地下一樓' : '一樓', '差一點點'), L('三樓', '差一點點')]),
            G.q('哪一條魚要請老闆' + treat + '？', '配對', fT, [
                L(other(fish, fT)[0], '張冠李戴', '要' + treat + '的是' + fT + '。'),
                L('兩條都要', '拼湊組合', '只有' + fT + '要' + treat + '。'),
                L('都不用', '差一點點', fT + '要' + treat + '。')
            ], { must: true }),
            G.q(fr[0].n + '要買什麼顏色的？', '顏色', fc[0], [
                L(fr[0].typ, '常理陷阱', fr[0].n + '一般是' + fr[0].typ + '，但這次要' + fc[0] + '的。'),
                L(fc[1], '張冠李戴', fc[1] + '是' + fr[1].n + '的顏色。'),
                L(sn.odd, '張冠李戴', sn.odd + '是' + sn.n + '的顏色。'),
                L(pc, '張冠李戴', pc + '是點心瓶線條的顏色。')
            ].concat(G.others(P.colors, [fc[0], fr[0].typ], '差一點點', 2)), { must: true }),
            G.q(fr[1].n + '要買什麼顏色的？', '顏色', fc[1], [
                L(fr[1].typ, '常理陷阱', fr[1].n + '一般是' + fr[1].typ + '，但這次要' + fc[1] + '的。'),
                L(fc[0], '張冠李戴', fc[0] + '是' + fr[0].n + '的顏色。'),
                L(sn.odd, '張冠李戴', sn.odd + '是' + sn.n + '的顏色。'),
                L(pc, '張冠李戴', pc + '是點心瓶線條的顏色。')
            ].concat(G.others(P.colors, [fc[1], fr[1].typ], '差一點點', 2)), { must: true }),
            G.q(fr[0].n + '要買幾' + fr[0].u + '？', '數字', cnCount(fn[0]) + fr[0].u,
                [L(cnCount(fn[1]) + fr[0].u, '張冠李戴', '「' + cnCount(fn[1]) + '」是' + fr[1].n + '的數量。')]
                    .concat(G.near(fn[0], function (n) { return cnCount(n) + fr[0].u; }, { lo: 1, hi: 6, swap: false }))),
            G.q(fr[1].n + '要買幾' + fr[1].u + '？', '數字', cnCount(fn[1]) + fr[1].u,
                [L(cnCount(fn[0]) + fr[1].u, '張冠李戴', '「' + cnCount(fn[0]) + '」是' + fr[0].n + '的數量。')]
                    .concat(G.near(fn[1], function (n) { return cnCount(n) + fr[1].u; }, { lo: 1, hi: 6, swap: false }))),
            G.q('誰最近只吃這兩種蔬果？', '人物', g, [L(p4, '張冠李戴', p4 + '最喜歡的是點心瓶。'), L(who, '張冠李戴', who + '是交代你買菜的人。'), L(nb, '似曾相識', nb + '只是剛好經過。')]),
            jarQ,
            G.q('點心瓶是什麼形狀？', '形狀', shape, G.others(P.shapes, shape)),
            G.q('點心瓶裡要補什麼？', '物品', sn.odd + '的' + sn.n, [
                L(sn.typ + '的' + sn.n, '常理陷阱', sn.n + '一般是' + sn.typ + '，但這次是' + sn.odd + '的。'),
                L(fc[0] + '的' + sn.n, '張冠李戴', fc[0] + '是' + fr[0].n + '的顏色。'),
                L(pc + '的' + sn.n, '張冠李戴', pc + '是點心瓶線條的顏色。')
            ].concat(other(P.oddSnacks, sn).map(function (s) { return L(sn.odd + '的' + s.n, '差一點點'); })), { must: true }),
            G.q('點心瓶是誰最喜歡的？', '人物', p4, [L(g, '張冠李戴', g + '喜歡的是蔬果。'), L(who, '張冠李戴', who + '是交代你買菜的人。'), L(nb, '似曾相識', nb + '只是剛好經過。')]),
            G.q('後來打電話來改口的是誰？', '人物', who, [L(nb, '似曾相識', nb + '只是剛好經過。'), L(p4, '張冠李戴', p4 + '是明天要回來吃飯的人。'), L(g, '張冠李戴', g + '是只吃那兩種水果的人。')]),
            G.dateQ('回來吃午飯慶生是哪一天？', ev, [L(today.s, '張冠李戴', today.s + '是去買菜的那天，慶生是隔天。')], { must: true }),
            G.weekQ('去市場買菜那天是星期幾？', today, [L(ev.w, '張冠李戴', ev.w + '是隔天慶生的日子。')])
        ].concat(flowerQs(G, fs, '花'));
        return { note: note, qs: finish(G, qs, 20) };
    }

    /* ═══ 第 7 關：一通電話（前面幾頁的計畫，被最後一通電話大幅更改）═══ */
    function B7(G, S) {
        var D = S.tl[S.i];
        var ev2 = addDays(D.ev, -1);     /* 電話裡：生日會改到生日的前一天 */
        var who = G.pick(P.home);
        var p = G.pick(P.kids, null, [who]);
        var g = G.pick(P.grand);
        var nb = people(G);
        var age = G.num(5, 9, null, null, 'age');
        var age2 = age + (G.coin() ? 1 : -1);
        var inch = G.pick([6, 8, 10], null, [age, age2]);
        var cks = G.pick(P.cakeShops, 2);
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var street1 = pair[a];
        var alt = pair[1 - a];
        var street2 = G.pick(P.streetPairs.map(function (x) { return x[0]; }), null, [street1, alt]);
        var fl = G.pick(P.flavors, 4);
        var F1 = fl[0];
        var F2 = fl[1];
        var F3 = fl[2];
        var F4 = fl[3];
        var gift = G.pick(P.gifts);
        var giftNames = P.gifts.map(function (x) { return x.n; });
        var gcs = G.pick(P.giftColors, 2);
        var GC = gcs[0];
        var GC2 = gcs[1];
        var dept = G.pick(P.depts);
        var floor = G.num(2, 8, null, null, 'floor');
        var bus1 = G.num(123, 987, null, threeDiff);
        var stop1 = G.pick(P.stops);
        var shop3 = G.pick(P.partyShops);
        var bn = G.num(2, 5, null, null, 'bn');
        var things = G.pick(P.partyThings, 2);
        var ti = G.int(0, P.times.length - 4);
        var tm = [P.times[ti], P.times[ti + 1], P.times[ti + 2], P.times[ti + 3]];
        var time0 = tm[0];       /* 原本：東西送到 */
        var time1 = tm[2];       /* 原本：生日會開始 */
        var time2 = tm[3];       /* 改成：生日會開始 */
        var time3 = tm[1];       /* 改成：東西送到 */
        var v = {
            g: g, who: who, p: p, nb: nb, agec: cnNum(age), age2c: cnNum(age2), street1: street1, street2: street2,
            cake: cks[0], cake2: cks[1], F1: F1, F2: F2, F3: F3, F4: F4, inchc: cnNum(inch), dept: dept, floorc: cnNum(floor), GC: GC, GC2: GC2,
            gift: gift.n, gu: gift.u, bus1: bus1, stop1: stop1, shop3: shop3, bnc: cnCount(bn), thing3: things[0],
            time0: time0, time1: time1, time2: time2, time3: time3, today: D.today.sw, ev: D.ev.sw, ev2: ev2.sw
        };
        var note = [
            T('今天是{today}。{ev}是{g}的{agec}歲生日，{who}要你先把東西準備好。', v),
            T('第一件事，是去{street1}的{cake}蛋糕店拿預訂的蛋糕。', v),
            T('「要{F1}口味、{inchc}吋的，」{who}說，「{p}說上次的奶油蛋糕很好吃，但是這次{g}想吃{F1}口味。」', v),
            T('蠟燭要{agec}根，不要數字造型，要一般的彩色蠟燭。第二件事，是去{dept}{floorc}樓買生日禮物：一{gu}{GC}的{gift}。', v),
            T('去百貨公司要搭 {bus1} 號公車，在{stop1}下車。{who}還交代，順便在{shop3}買{bnc}包氣球和一盒{thing3}。', v),
            T('生日會就在生日當天{time1}開始，東西最晚{time0}要送到{p}家。', v),
            T('{who}又說，今年{p}家要請{g}的同學一起來，大概會有十幾個小朋友，所以蛋糕千萬不能買太小。', v),
            T('{nb}聽說要辦生日會，熱心地說{street2}有一家{cake2}蛋糕店，{F3}蛋糕買一送一，不過你們已經訂好了。', v),
            T('你想起去年{g}生日時，買的是{F4}蛋糕，結果{g}只吃了一口，剩下的都是大人吃掉的。', v),
            T('傍晚，{who}又打電話來，說計畫要改：「{g}說還是想吃{F2}口味，蛋糕改成{F2}的。還有，{g}今年是{age2c}歲，不是{agec}歲，蠟燭要{age2c}根才對。」', v),
            T('「禮物的顏色也改一下，{g}最近喜歡{GC2}，改買{GC2}的{gift}。氣球不用買了，{p}家還有。」', v),
            T('「生日會改到前一天，{ev2}{time2}開始，東西{time3}前送到就好。」', v)
        ];

        var fk = function (f) { return f + '口味'; };
        var near = function (f) { return P.flavorNear[f]; };
        var cand = function (n) { return cnNum(n) + '根'; };
        var gifts = P.giftColors;
        var qs = [
            G.q('最後蛋糕要什麼口味？', '更正', fk(F2), [L(fk(F1), '新舊混淆', F1 + '是改口之前的口味。'),
            L(fk('奶油'), '似曾相識', '奶油蛋糕是上次吃的。'), L(fk(F3), '似曾相識', F3 + '是' + nb + '說的另一家店在特價的。'),
            L(fk(near(F2)), '差一點點'), L(fk(F4), '似曾相識', F4 + '蛋糕是去年買的。')], { must: true }),
            G.q('一開始說蛋糕要什麼口味？', '一開始', fk(F1), [L(fk(F2), '新舊混淆', F2 + '是後來才改的。'),
            L(fk('奶油'), '似曾相識', '奶油蛋糕是上次吃的。'), L(fk(near(F1)), '差一點點')], { old: true, must: true }),
            G.q('蠟燭最後要幾根？', '更正', cand(age2), [L(cand(age), '新舊混淆', cnNum(age) + '歲是說錯的，後來改成' + cnNum(age2) + '歲。'),
            L(cand(inch), '張冠李戴', cnNum(inch) + '是蛋糕的吋數。')].concat(G.near(age2, cand, { lo: 3, hi: 12, swap: false })), { must: true }),
            G.q('一開始說蠟燭要幾根？', '一開始', cand(age), [L(cand(age2), '新舊混淆', cnNum(age2) + '根是後來才改的。'),
            L(cand(inch), '張冠李戴', cnNum(inch) + '是蛋糕的吋數。')].concat(G.near(age, cand, { lo: 3, hi: 12, swap: false })), { old: true }),
            G.q('蛋糕要幾吋？', '數字', cnNum(inch) + '吋', [L(cnNum(age2) + '吋', '張冠李戴', cnNum(age2) + '是蠟燭的數量。')]
                .concat([6, 8, 10, 12].filter(function (x) { return x !== inch; }).map(function (x) { return L(cnNum(x) + '吋', '數字相近'); }))),
            G.q('要去哪一家蛋糕店拿蛋糕？', '地點', cks[0] + '蛋糕店', [L(cks[1] + '蛋糕店', '似曾相識', cks[1] + '是' + nb + '推薦的另一家。')]
                .concat(G.others(P.cakeShops, cks, '差一點點', 2).map(function (l) { return L(l.v + '蛋糕店', l.k); }))),
            G.q('蛋糕店在哪一條路？', '地點', street1, [L(alt, '差一點點', '「' + alt + '」和「' + street1 + '」很像，紙條上是「' + street1 + '」。'),
            L(street2, '似曾相識', street2 + '是' + nb + '推薦的那家店。'), L(stop1, '張冠李戴', stop1 + '是去百貨公司下車的地方。')]),
            G.q('蠟燭要哪一種？', '否定', '一般的彩色蠟燭', [L('數字造型的', '否定遺漏', '紙條特別說數字造型的不要。'),
            L(GC2 + '的蠟燭', '張冠李戴', GC2 + '是禮物的顏色。'), L(GC + '的蠟燭', '張冠李戴', GC + '是禮物原本的顏色。')]),
            G.q('禮物最後要買什麼顏色？', '更正', GC2, [L(GC, '新舊混淆', GC + '是改口之前的顏色。')].concat(G.others(gifts, [GC, GC2], '差一點點', 2)), { must: true }),
            G.q('一開始說禮物要什麼顏色？', '一開始', GC, [L(GC2, '新舊混淆', GC2 + '是後來才改的。')].concat(G.others(gifts, [GC, GC2], '差一點點', 2)), { old: true }),
            G.q('生日禮物是什麼？', '物品', gift.n, [L(things[0], '張冠李戴', things[0] + '是在' + shop3 + '買的。')].concat(G.others(giftNames, gift.n, '差一點點', 2))),
            G.q('禮物在百貨公司幾樓買？', '數字', cnNum(floor) + '樓', G.near(floor, function (n) { return cnNum(n) + '樓'; }, { lo: 1, hi: 12, swap: false })),
            G.q('去百貨公司要搭幾號公車？', '數字', bus1, G.near(bus1, String, { lo: 100, hi: 999 })),
            G.q('去百貨公司要在哪裡下車？', '地點', stop1, [L(street1, '張冠李戴', street1 + '是蛋糕店那條路。')].concat(G.others(P.stops, stop1, '差一點點', 2))),
            G.q('要去哪一家百貨公司？', '地點', dept, G.others(P.depts, dept)),
            G.q('氣球後來怎麼了？', '更正', '不用買了', [L('要買' + cnCount(bn) + '包', '新舊混淆', '這是改口之前的交代，後來氣球不用買了。'),
            L('改買' + cnCount(bn === 5 ? 3 : bn + 1) + '包', '差一點點', '氣球不用買了。'), L('改成' + GC2 + '的', '張冠李戴', GC2 + '是禮物改的顏色。')], { must: true }),
            G.q(things[0] + '要買幾盒？', '數字', '一盒', [L(cnCount(bn) + '盒', '張冠李戴', '「' + cnCount(bn) + '」是原本氣球的數量。'), L('兩盒', '數字相近'), L('三盒', '數字相近'), L('四盒', '數字相近')]),
            G.q('生日會最後幾點開始？', '更正', time2, [L(time1, '新舊混淆', time1 + '是改口之前的時間。'),
            L(time3, '張冠李戴', time3 + '是東西要送到的時間。'), L(time0, '張冠李戴', time0 + '是原本送東西的時間。')], { must: true }),
            G.q('一開始說生日會幾點開始？', '一開始', time1, [L(time2, '新舊混淆', time2 + '是後來才改的。'),
            L(time0, '張冠李戴', time0 + '是原本送東西的時間。'), L(time3, '張冠李戴', time3 + '是後來送東西的時間。')], { old: true, must: true }),
            G.q('東西最晚幾點要送到？', '更正', time3, [L(time0, '新舊混淆', time0 + '是改口之前的時間。'),
            L(time2, '張冠李戴', time2 + '是生日會開始的時間。'), L(time1, '張冠李戴', time1 + '是原本生日會開始的時間。')], { must: true }),
            G.q('東西要送到誰家？', '人物', p + '家', [L(nb + '家', '似曾相識', nb + '只是推薦了另一家蛋糕店。')]
                .concat(G.others(P.kids.concat(['表妹美玲', '老朋友周大哥']), [p], '差一點點', 2).map(function (l) { return L(l.v + '家', l.k); }))),
            G.q('是誰要過生日？', '人物', g, [L(p, '張冠李戴', p + '是生日會的主人家。'), L(otherGrand(g), '差一點點'), L(nb, '似曾相識', nb + '只是推薦了蛋糕店。')]),
            G.q('打電話來改計畫的是誰？', '人物', who, [L(p, '張冠李戴', p + '是生日會的主人家。'), L(nb, '似曾相識', nb + '只是推薦了蛋糕店。'), L(g, '差一點點', g + '是要過生日的人。')]),
            G.dateQ('生日會最後改到哪一天？', ev2, [L(D.ev.s, '新舊混淆', D.ev.s + '是生日當天，生日會改到前一天。'), L(D.today.s, '張冠李戴', D.today.s + '是接到交代的那天。')], { must: true }),
            G.dateQ('過生日的那一天是幾月幾日？', D.ev, [L(ev2.s, '張冠李戴', ev2.s + '是生日會改到的日子，生日沒有變。'), L(D.today.s, '張冠李戴', D.today.s + '是接到交代的那天。')], { must: true }),
            G.weekQ('生日會最後是星期幾？', ev2, [L(D.ev.w, '新舊混淆', D.ev.w + '是生日當天，生日會改到前一天。')]),
            (function () {
                var same = G.any(['蛋糕的吋數', '禮物是什麼', '百貨公司', '公車號碼']);
                return G.q('電話裡「沒有」改到的是哪一個？', '更正', same, ['蛋糕的口味', '蠟燭的數量', '禮物的顏色', '開始的時間'].map(function (c) {
                    return L(c, '新舊混淆', '「' + c + '」在電話裡改掉了。');
                }));
            })()
        ];
        return { note: note, qs: finish(G, qs, 24, 4) };
    }

    /* ═══ 第 8 關：回家的路（全部混合：三班公車、禮物、蛋糕、UBIKE、巷子、預算，最後兩通電話大改）═══ */
    function B8(G, S) {
        var today = S.tl[S.i].today;
        var who = G.pick(P.home);
        var p = G.pick(P.home.concat(P.kin).filter(function (x, i, a) { return a.indexOf(x) === i; }), null, [who]);
        var nbs = people(G, 2);
        var nb = nbs[0];
        var nb2 = nbs[1];
        var cash = G.num(15, 25) * 100;
        var d1 = G.int(2, 9) * 10;
        var c1 = G.int(28, 48) * 10;
        var g1 = cash - d1 - c1;
        var d2 = G.int(3, 12) * 10;
        var c2 = c1 + d1 + d2;
        var bus1 = G.num(123, 987, null, threeDiff);
        var bus2 = G.any(perms(bus1));
        var bus3 = G.num(12, 98, null, twoDiff);
        var stops = G.pick(P.stops, 2);
        var stopA = stops[0];
        var stopB = stops[1];
        var dept = G.pick(P.depts);
        var floor = G.num(2, 8, null, null, 'floor');
        var gift = G.pick(P.gifts);
        var gcs = G.pick(P.giftColors, 2);
        var gc = gcs[0];
        var gc2 = gcs[1];
        var lastGift = G.any(P.gifts.filter(function (x) { return x !== gift; }));
        var giftNames = P.gifts.map(function (x) { return x.n; });
        var gc3 = G.any(P.giftColors.filter(function (x) { return x !== gc && x !== gc2; }));
        var cake = G.pick(P.cakeShops);
        var fl = G.pick(P.flavors, 3);
        var box = G.pick(P.boxShapes);
        var noiseThing = G.pick(P.snacksNoise);
        var noiseN = G.num(5, 12) * 5;
        var prs = G.pick(P.streetPairs, 3);
        var o1 = G.coin() ? 0 : 1;
        var s1 = prs[0][o1];
        var s1b = prs[0][1 - o1];
        var s2 = prs[1][G.coin() ? 0 : 1];
        var s3i = G.coin() ? 0 : 1;
        var s3 = prs[2][s3i];
        var s3alt = prs[2][1 - s3i];
        var s2alt = prs[1][0] === s2 ? prs[1][1] : prs[1][0];
        var t1 = G.coin() ? '右' : '左';
        var t2 = G.coin() ? '右' : '左';
        var t3 = G.coin() ? '右' : '左';
        var t4 = G.coin() ? '右' : '左';
        var side = G.coin() ? '右' : '左';
        var a1 = G.num(2, 4, null, null, 'a1');
        var a2 = G.num(1, 3, [a1], null, 'a2');
        var k = G.num(2, 4, [a1], null, 'k');
        var house = G.num(12, 58, null, twoDiff);
        var st = G.num(3, 12, null, null, 'st');
        var v = {
            who: who, p: p, nb: nb, nb2: nb2, cash: cash, bus1: bus1, bus2: bus2, bus3: bus3, stopA: stopA, stopB: stopB,
            dept: dept, floorc: cnNum(floor), gc: gc, gc2: gc2, gift: gift.n, gu: gift.u, g1: g1, cake: cake, flavor1: fl[0], flavor2: fl[1],
            lureFlavor: fl[2], c1: c1, c2: c2, box: box, noiseThing: noiseThing, noiseN: noiseN, s1: s1, s1b: s1b, s2: s2, s3: s3,
            t1: t1, t2: t2, t3: t3, t4: t4, a1c: cnNum(a1), a2c: cnCount(a2), side: side, kc: cnNum(k), house: house, stc: cnNum(st),
            lastGift: lastGift.n, lu: lastGift.u, gc3: gc3, today: today.sw
        };
        var note = [
            T('今天是{today}。下午四點，{who}傳訊息提醒你：今天是{p}的生日，下班後要辦幾件事再回家。', v),
            T('你身上只帶了 {cash} 元現金。', v),
            T('你想起{p}去年生日時，你送了一{lu}{gc3}的{lastGift}給{p}。', v),
            T('「先搭 {bus1} 號公車，在{stopA}下車，去{dept}{floorc}樓買生日禮物：一{gu}{gc}的{gift}，要 {g1} 元。」{who}說{p}上次看到就很喜歡。', v),
            T('「走出百貨公司的時候，先傳簡訊跟我說『禮物買好了』。然後搭 {bus2} 號公車去{cake}蛋糕店，拿{flavor1}蛋糕，{c1} 元，用{box}的盒子裝。」', v),
            T('{nb}上次說，{cake}的{lureFlavor}蛋糕很好吃，還說他們家的{noiseThing}一個才 {noiseN} 元，不過這次不用買。', v),
            T('「拿完蛋糕，在店門口租 UBIKE，騎到{s1}{t1}轉，再騎到{s2}{t2}轉，就會看到{s3}的公車站。搭 {bus3} 號公車，在{stopB}下車。」', v),
            T('騎車要小心，{who}說上個月{nb2}在{s2}騎車跌倒，手上縫了{stc}針，到現在還沒好。', v),
            T('{who}還說，家裡巷口那家雜貨店今天公休，要買什麼都要在外面先買好。', v),
            T('「下車後往前走，第{a1c}個巷子{t3}轉，再過{a2c}個巷子{t4}轉，{side}手邊第{kc}間、{house} 號就是家。」', v),
            T('快下班時，{who}又打電話來：「禮物改成{gc2}的，{p}說{gc}的太老氣了。蛋糕也改成{flavor2}口味，那個比較貴，要 {c2} 元。」', v),
            T('「還有，{s1}最近在施工，不要在{s1}轉，改在{s1b}{t1}轉。」{who}最後提醒你：兩樣加起來超過身上的現金，就要先去提款機領錢。', v)
        ];

        var yuan = function (n) { return n + ' 元'; };
        var fk = function (f) { return f + '口味'; };
        var nearF = function (f) { return P.flavorNear[f]; };
        var ord = function (n) { return '第' + cnNum(n) + '個'; };
        var cnt = function (n) { return cnCount(n) + '個'; };
        var sideK = function (sd, n) { return sd + '手邊第' + cnNum(n) + '間'; };
        var opp = side === '右' ? '左' : '右';
        var total = g1 + c2;
        var qs = [
            G.q('第一段要搭幾號公車？', '數字', bus1, [L(bus2, '張冠李戴', bus2 + ' 是去蛋糕店的公車。')].concat(G.near(bus1, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('去蛋糕店要搭幾號公車？', '數字', bus2, [L(bus1, '張冠李戴', bus1 + ' 是第一段的公車。')].concat(G.near(bus2, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('最後一段要搭幾號公車？', '數字', bus3, [L(house, '張冠李戴', house + ' 是家的門牌。')].concat(G.near(bus3, String, { lo: 10, hi: 99 })), { must: true }),
            G.q('禮物在百貨公司幾樓？', '數字', cnNum(floor) + '樓', G.near(floor, function (n) { return cnNum(n) + '樓'; }, { lo: 1, hi: 12, swap: false })),
            G.q('家是幾號？', '數字', house + ' 號', [L(rev2(house) + ' 號', '數字相近'), L(st + ' 號', '似曾相識', '「' + cnNum(st) + '」是' + nb2 + '縫的針數。')]
                .concat(G.near(house, function (n) { return n + ' 號'; }, { lo: 1, hi: 99, swap: false })), { must: true }),
            G.q('禮物要多少錢？', '數字', yuan(g1), [L(yuan(c1), '張冠李戴', c1 + ' 元是蛋糕原本的價錢。')].concat(G.near(g1, yuan, { step: 100, swap: false }))),
            G.q('蛋糕最後要多少錢？', '更正', yuan(c2), [L(yuan(c1), '新舊混淆', c1 + ' 元是改口味之前的價錢。'),
            L(yuan(noiseN), '似曾相識', noiseN + ' 元是' + noiseThing + '的價錢。')].concat(G.near(c2, yuan, { step: 10, swap: false })), { must: true }),
            G.q('你身上帶了多少現金？', '數字', yuan(cash), G.near(cash, yuan, { step: 100, swap: false, lo: 500 })),
            G.q('一開始說蛋糕要什麼口味？', '一開始', fk(fl[0]), [L(fk(fl[1]), '新舊混淆', fl[1] + '是後來才改的。'),
            L(fk(fl[2]), '似曾相識', fl[2] + '是' + nb + '說好吃的。'), L(fk(nearF(fl[0])), '差一點點')], { old: true, must: true }),
            G.q('一開始說禮物要什麼顏色？', '一開始', gc, [L(gc2, '新舊混淆', gc2 + '是後來才改的。'), L(gc3, '似曾相識', gc3 + '是去年那份禮物的顏色。')].concat(G.others(P.giftColors, [gc, gc2], '差一點點', 2)), { old: true, must: true }),
            G.q('UBIKE 第一個彎，一開始說在哪轉？', '一開始', s1, [L(s1b, '新舊混淆', s1b + '是後來才改的。'),
            L(s2, '順序顛倒', s2 + '是第二個彎。'), L(s3, '張冠李戴', s3 + '是公車站那條路。')], { old: true, must: true }),
            G.q('一開始說蛋糕要多少錢？', '一開始', yuan(c1), [L(yuan(c2), '新舊混淆', c2 + ' 元是改口味之後的價錢。')].concat(G.near(c1, yuan, { step: 10, swap: false })), { old: true, must: true }),
            G.q('第一段要在哪裡下車？', '地點', stopA, [L(stopB, '張冠李戴', stopB + '是最後一段下車的地方。')].concat(G.others(P.stops, stops, '差一點點', 2))),
            G.q('最後一段要在哪裡下車？', '地點', stopB, [L(stopA, '張冠李戴', stopA + '是第一段下車的地方。')].concat(G.others(P.stops, stops, '差一點點', 2))),
            G.q('禮物在哪一家百貨公司買？', '地點', dept, G.others(P.depts, dept)),
            G.q('蛋糕要去哪一家拿？', '地點', cake + '蛋糕店', G.others(P.cakeShops, cake, '差一點點').map(function (l) { return L(l.v + '蛋糕店', l.k); })),
            G.q('UBIKE 第一個彎，最後改在哪轉？', '更正', s1b, [L(s1, '新舊混淆', s1 + '在施工，不在那裡轉。'),
            L(s2, '順序顛倒', s2 + '是第二個彎。'), L(s3, '張冠李戴', s3 + '是公車站那條路。')], { must: true }),
            G.q('UBIKE 第二個彎在哪一條路？', '地點', s2, [L(s1b, '順序顛倒', s1b + '是第一個彎。'), L(s3, '張冠李戴', s3 + '是公車站那條路。'),
            L(s2alt, '差一點點', '「' + s2alt + '」和「' + s2 + '」很像，紙條上是「' + s2 + '」。')]),
            G.q('最後一段的公車站在哪一條路？', '地點', s3, [L(s2, '張冠李戴', s2 + '是第二個彎。'), L(s1b, '張冠李戴', s1b + '是第一個彎。'),
            L(s3alt, '差一點點', '「' + s3alt + '」和「' + s3 + '」很像，紙條上是「' + s3 + '」。')]),
            G.q('禮物最後要什麼顏色？', '更正', gc2, [L(gc, '新舊混淆', gc + '是改口之前的顏色。'), L(gc3, '似曾相識', gc3 + '是去年那份禮物的顏色。')].concat(G.others(P.giftColors, [gc, gc2], '差一點點', 2)), { must: true }),
            G.q('蛋糕最後是什麼口味？', '更正', fk(fl[1]), [L(fk(fl[0]), '新舊混淆', fl[0] + '是改口之前的口味。'),
            L(fk(fl[2]), '似曾相識', fl[2] + '是' + nb + '說好吃的。'), L(fk(nearF(fl[1])), '差一點點')], { must: true }),
            turnQ(G, 'UBIKE 第一個彎要怎麼轉？', t1, t2, '那是第二個彎的方向。'),
            turnQ(G, 'UBIKE 第二個彎要怎麼轉？', t2, t1, '那是第一個彎的方向。'),
            G.q('下公車後，第幾個巷子轉彎？', '數字', ord(a1), [L(ord(a2), '張冠李戴', '「' + cnCount(a2) + '個」是轉進巷子後，再過幾個巷子。')]
                .concat(G.near(a1, ord, { lo: 1, hi: 6, swap: false }))),
            turnQ(G, '下公車後，第一次轉彎怎麼轉？', t3, t4, '那是第二次轉彎的方向。'),
            G.q('轉進巷子後，再過幾個巷子轉彎？', '數字', cnt(a2), [L(cnt(a1), '張冠李戴', '「第' + cnNum(a1) + '個」是下公車後第一個轉彎的巷子。')]
                .concat(G.near(a2, cnt, { lo: 1, hi: 6, swap: false }))),
            turnQ(G, '下公車後，第二次轉彎怎麼轉？', t4, t3, '那是第一次轉彎的方向。'),
            G.q('家在哪一邊、第幾間？', '方向', sideK(side, k), [L(sideK(opp, k), '差一點點', '左右弄反了，是' + side + '手邊。'),
            L(sideK(side, a1), '張冠李戴', '「第' + cnNum(a1) + '」是第幾個巷子轉彎。'),
            L(sideK(side, k + 1), '數字相近'), L(sideK(side, k - 1), '數字相近')], { must: true }),
            G.q('生日禮物是什麼？', '物品', gift.n, [L(lastGift.n, '似曾相識', lastGift.n + '是去年送的禮物。'), L(noiseThing, '似曾相識', noiseThing + '只是' + nb + '順口提到的。')].concat(G.others(giftNames, gift.n, '差一點點', 2))),
            G.q('蛋糕用什麼形狀的盒子裝？', '形狀', box, G.others(P.boxShapes, box)),
            G.q('什麼時候要傳簡訊？', '順序', '走出百貨公司時', [L('拿到蛋糕後', '順序顛倒', '是走出百貨公司的時候，還沒去拿蛋糕。'),
            L('騎 UBIKE 前', '順序顛倒', '是走出百貨公司的時候。'), L('回到家的時候', '差一點點')]),
            G.q('簡訊要寫什麼？', '物品', '禮物買好了', [L('蛋糕拿到了', '張冠李戴', '簡訊是走出百貨公司時傳的，那時還沒拿蛋糕。'),
            L('快到家了', '差一點點'), L('生日快樂', '差一點點')]),
            G.q('禮物加蛋糕一共多少錢？', '計算', yuan(total), [L(yuan(g1 + c1), '新舊混淆', '這是蛋糕改口味之前的總數。'),
            L(yuan(total + 100), '計算失誤'), L(yuan(total - 10), '計算失誤'), L(yuan(total + 10), '計算失誤')], { must: true }),
            G.q('要不要先去提款機領錢？', '計算', '要，錢不夠', [L('不用，錢夠', '新舊混淆', '蛋糕改口味變貴了，兩樣加起來 ' + total + ' 元，超過身上的 ' + cash + ' 元。'),
            L('到家再說', '差一點點', '紙條說超過身上的現金，就要先去提款機。'), L('先打電話問', '差一點點', '紙條說超過身上的現金，就要先去提款機。')], { must: true }),
            G.q('兩樣加起來，和身上的現金差多少？', '計算', yuan(d2), [L(yuan(d1), '新舊混淆', '這是蛋糕改口味之前的差額。'),
            L(yuan(d1 + d2), '計算失誤', '那是蛋糕漲的價錢。'), L(yuan(d2 + 10), '計算失誤'), L(yuan(d2 + 100), '計算失誤')]),
            G.q('今天是誰的生日？', '人物', p, [L(who, '張冠李戴', who + '是傳訊息給你的人。'), L(nb, '似曾相識', nb + '只是說過蛋糕好吃。'),
            L(nb2, '似曾相識', nb2 + '是騎車跌倒的人。')]),
            G.q('誰打電話來改計畫？', '人物', who, [L(p, '張冠李戴', p + '是今天生日的人。'), L(nb, '似曾相識', nb + '只是說過蛋糕好吃。'),
            L(nb2, '似曾相識', nb2 + '是騎車跌倒的人。')]),
            G.dateQ('今天（生日那天）是幾月幾日？', today, [], { must: true }),
            G.weekQ('今天是星期幾？', today)
        ];
        return { note: note, qs: finish(G, qs, 32, 6) };
    }

    /* 把整個生日主軸登記進引擎：id、顯示名稱、8 關的關卡名稱、setup（整局共用資料：時間軸）、levels（8 個關卡函式） */
    Q.addTheme({
        id: 'birthday', name: '生日',
        names: ['新手暖身', '兩件差事', '先後順序', '顏色形狀', '兩段行程', '臨時改口', '一通電話', '回家的路'],
        /* 時間軸：每一關隔 4～10 天；每一關都有一個人在 2～9 天後過生日 */
        setup: function (G) { return { tl: timeline(G, [4, 10], [2, 9]) }; },
        levels: [B1, B2, B3, B4, B5, B6, B7, B8]
    });
})();
