/* ═══════════════════════════════════════════════════════════════════
   quiz_health.js — 測試模式・主軸三：看病
   · 長者日常最需要記清楚的事：哪家醫院、哪一科、哪位醫師、第幾診、掛號號碼、
     藥的樣子與吃法（什麼時候、吃幾顆）、回診日期、空腹、健康檢查要帶的東西、醫療費用。
   · 一局抽 2 家醫院，8 關重複使用（同一家醫院在不同關卡看不同的科，更容易混淆）；
     這兩家醫院從第 1 關就開始出現，8 關完全獨立撰寫。
   ═══════════════════════════════════════════════════════════════════ */

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
    var timeline = lib.timeline;

    function others(list, not) { return list.filter(function (x) { return [].concat(not).indexOf(x) < 0; }); }
    var yuan = function (n) { return n + ' 元'; };
    var DAILY = ['降血壓藥', '降血糖藥', '胃藥', '鈣片', '維他命', '降血脂藥'];
    var DOSES = ['半顆', '一顆', '一顆半', '兩顆', '三顆'];
    var FAST = ['晚上八點', '晚上十點', '半夜十二點'];
    var FRUITS = ['蘋果', '芭樂', '木瓜', '香蕉', '葡萄', '西瓜', '鳳梨', '奇異果'];

    /* 第 4 關：常見成藥「一般是什麼顏色」與「這次要買的顏色」（借用水果反常理顏色的手法） */
    var H_ODDMEDS = [
        { n: '普拿疼', u: '盒', typ: '白色', odd: ['綠色', '藍色'] },
        { n: '感冒糖漿', u: '瓶', typ: '黃色', odd: ['紅色'] },
        { n: '腸胃藥', u: '瓶', typ: '白色', odd: ['粉紅色'] },
        { n: '維他命C', u: '瓶', typ: '橘色', odd: ['白色', '綠色'] }
    ];

    /* 藥的樣子：顏色＋形狀（每一種藥各不相同） */
    function looks(G, n) {
        var out = [];
        while (out.length < n) {
            var c = G.any(P.medColors) + G.any(P.medShapes);
            if (out.indexOf(c) < 0) out.push(c);
        }
        return out;
    }

    /* ═══ 第 1 關：新手暖身（陪家人去醫院前，先辦一件差事） ═══ */
    function H1(G, S) {
        var D = S.tl[S.i];
        var p = G.pick(P.kin);
        var h = S.h[0];
        var e = G.pick(P.healthErrands1);
        var bus = G.num(12, 98, null, twoDiff);
        var stop = G.pick(P.stops);
        var floor = G.num(2, 5, null, null, 'floor');
        var n = G.num(2, 4, [floor], null, 'n');
        var v = { p: p, h: h, bus: bus, stop: stop, place: e.place, floor: floor, act: e.act, n: n, u: e.u, thing: e.thing, today: D.today.sw, ev: D.ev.sw };
        var note = [
            T('今天是{today}。{ev}要陪{p}去{h}看病，你今天下班先辦一件事：', v),
            T('搭 {bus} 號公車，在{stop}下車，', v),
            T('去{place} {floor} 樓，{act} {n} {u}{thing}。', v)
        ];
        var fl = function (x) { return x + ' 樓'; };
        var cu = function (x) { return x + ' ' + e.u; };
        var qs = [
            G.dateQ('哪一天要去看病？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.q('要陪誰去看病？', '人物', p, G.others(P.kin, p, '差一點點')),
            G.q('要去哪家醫院？', '地點', h, [L(S.h[1], '差一點點', '這次是去' + h + '。')].concat(G.others(P.hospitals, [h, S.h[1]], '差一點點', 2))),
            G.q('要搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 10, hi: 99 })),
            G.q('要在哪一站下車？', '地點', stop, G.others(P.stops, stop)),
            G.q(T('{place}在幾樓？', v), '數字', fl(floor),
                [L(fl(n), '張冠李戴', n + ' 是' + e.thing + '的數量，不是樓層。')].concat(G.near(floor, fl, { lo: 1, hi: 9, swap: false }))),
            G.q(T('要{act}幾{u}{thing}？', v), '數字', cu(n),
                [L(cu(floor), '張冠李戴', floor + ' 是樓層，不是' + e.thing + '的數量。')].concat(G.near(n, cu, { lo: 1, hi: 9, swap: false })))
        ];
        return { note: note, qs: finish(G, qs, 4) };
    }

    /* ═══ 第 2 關：兩件差事（打電話來的人交代回診的事，順路買兩樣醫療用品） ═══ */
    function H2(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home.concat(P.friends));
        var dep = G.pick(P.clinics);
        var h = S.h[0];
        var cs = G.pick(P.healthShops, 2);
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
            who: who, dep: dep, h: h, bus: bus, stop: stop, s1: c1.shop, s2: c2.shop, n1: cnCount(n1), n2: cnCount(n2),
            u1: c1.u, u2: c2.u, i1: i1, i2: i2, lure: lure, house: house, today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}，{who}打電話來說：「我{ev}要去{h}看{dep}回診。」', v),
            T('「下班後幫我跑兩個地方好不好？先搭 {bus} 號公車到{stop}，去{s1}買{n1}{u1}{i1}。」', v),
            T('「然後走到{s2}，買{n2}{u2}{i2}。上次你買成{lure}，這次別再買錯囉！」掛電話前，{who}還說自己家的門牌換新了，是 {house} 號。', v)
        ];
        var f1 = function (x) { return cnCount(x) + c1.u; };
        var f2 = function (x) { return cnCount(x) + c2.u; };
        var lureWhy = '「' + lure + '」是上次買錯的。';
        var qs = [
            G.dateQ(who + '哪一天要回診？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是打電話來的那天。')], { must: true }),
            G.weekQ(who + '回診是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是打電話來的那天。')]),
            G.q(who + '要回診看哪一科？', '科別', dep, G.others(P.clinics, dep)),
            G.q(who + '要去哪家醫院回診？', '地點', h, G.others(P.hospitals, h)),
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

    /* ═══ 第 3 關：先後順序（陪家人看診前，還有幾件差事要先辦好） ═══ */
    function H3(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home.concat(P.friends));
        var nb = people(G, null, [who]);
        var p = G.pick(P.kin);
        var h = S.h[1];
        var es = G.pick(P.healthErrands3, 3);
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
            who: who, nb: nb, p: p, h: h, bus: bus, Ap: A.place, Aa: act(A, 0), Ae: A.early, Bp: B.place, Ba: act(B, 1),
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
        var note = [T('今天是{today}。{ev}一早要陪{p}去{h}看診，{who}傳語音交代你幾件事。', v)].concat(body, [
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
        qs.push(G.dateQ('哪一天要陪家人看診？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }));
        qs.push(G.daysQ('今天離看診還有幾天？', D.today, D.ev));
        qs.push(G.q('要陪誰去看診？', '人物', p, G.others(P.kin, p, '差一點點')));
        return { note: note, qs: finish(G, qs, 8) };
    }

    /* ═══ 第 4 關：顏色形狀（打包住院用品、成藥的顏色、平時吃藥用的杯子） ═══ */
    function H4(G, S) {
        var D = S.tl[S.i];
        var who = G.pick(P.home);
        var nb = people(G, null, [who]);
        var pair = G.pick(P.streetPairs);
        var a = G.coin() ? 0 : 1;
        var street = pair[a];
        var alt = pair[1 - a];
        var shop = G.pick(['醫療用品店', '藥局', '生活百貨']);
        var cols = G.pick(P.colors, 3);
        var shs = G.pick(P.shapes, 3);
        var things = G.pick(P.healthThings4, 4);
        var si = G.shuffle([0, 1, 2]);
        var x;
        var y;
        do { x = G.int(0, 2); y = G.int(0, 2); } while (si[x] === y);
        var objs = G.shuffle([0, 1, 2].map(function (i) { return { n: things[i], c: cols[i], s: shs[si[i]] }; })
            .concat([{ n: things[3], c: cols[x], s: shs[y] }]));
        var meds = G.pick(H_ODDMEDS, 2);
        var fc = [G.any(meds[0].odd)];
        var odd2 = meds[1].odd.filter(function (c) { return c !== fc[0]; });
        fc.push(G.any(odd2.length ? odd2 : meds[1].odd));
        var fn0 = G.num(1, 4, null, null, 'fn1');
        var fn = [fn0, G.num(1, 4, [fn0], null, 'fn2')];
        var jar = G.pick(P.jars);
        var mat = G.pick(jar.mats);
        var pos = G.pick(P.places);
        var jc = cols[G.int(0, 2)];
        var lc = G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && fc.indexOf(c) < 0; }));
        var v = {
            who: who, nb: nb, street: street, shop: shop, lc: lc, pos: pos, jc: jc, mat: mat, jar: jar.n,
            m1: meds[0].n, m2: meds[1].n, fc1: fc[0], fc2: fc[1], fn1: cnCount(fn[0]), fn2: cnCount(fn[1]), fu1: meds[0].u, fu2: meds[1].u,
            today: D.today.sw, ev: D.ev.sw
        };
        objs.forEach(function (o, i) { v['c' + i] = o.c; v['s' + i] = o.s; v['n' + i] = o.n; });
        var note = [
            T('今天是{today}。{who}{ev}要住院檢查，拜託你下班去{street}的{shop}，買幾樣要帶的東西。', v),
            T('「要一個{c0}的{s0}{n0}，還有一個{c1}的{s1}{n1}。」', v),
            T('{who}想了想又說：「再買一個{c2}的{s2}{n2}，和一個{c3}的{s3}{n3}。」', v),
            T('{nb}在旁邊聽到，說：「上次我在別家買的{n0}是{lc}的，用沒多久就壞了。」', v),
            T('順便買{fc1}的{m1}{fn1}{fu1}、{fc2}的{m2}{fn2}{fu2}，醫生說這兩種{who}可以吃。', v),
            T('最後，{who}交代：家裡放在{pos}的那個{jc}{mat}{jar}，是平時配水吃藥用的，記得也放進住院包裡。', v)
        ];

        var ownerOfColor = function (c) { return objs.filter(function (o) { return o.c === c; })[0].n; };
        var ownerOfShape = function (s) { return objs.filter(function (o) { return o.s === s; })[0].n; };
        var spareColor = function (not) { return G.any(P.colors.filter(function (c) { return cols.indexOf(c) < 0 && not.indexOf(c) < 0; })); };
        var order = G.shuffle(objs);

        function colorQ(o) {
            var lures = [];
            if (o === objs[0]) lures.push(L(lc, '似曾相識', '「' + lc + '」是' + nb + '上次在別家買的。'));
            cols.forEach(function (c) { if (c !== o.c) lures.push(L(c, '張冠李戴', '「' + c + '」是' + ownerOfColor(c) + '的顏色。')); });
            lures.push(L(fc[0], '張冠李戴', '「' + fc[0] + '」是' + meds[0].n + '的顏色。'));
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
        function medColorQ(k) {
            var m = meds[k];
            var lures = [L(m.typ, '常理陷阱', m.n + '一般是' + m.typ + '，但這次要' + fc[k] + '的。')];
            lures.push(L(fc[1 - k], '張冠李戴', '「' + fc[1 - k] + '」是' + meds[1 - k].n + '的顏色。'));
            lures.push(L(cols[0], '張冠李戴', '「' + cols[0] + '」是' + ownerOfColor(cols[0]) + '的顏色。'));
            lures.push(L(spareColor([m.typ].concat(fc)), '差一點點'));
            return G.q(m.n + '要買什麼顏色的？', '顏色', fc[k], lures, { must: true });
        }
        function medCountQ(k) {
            var m = meds[k];
            var fmt = function (n) { return cnCount(n) + m.u; };
            return G.q(m.n + '要買幾' + m.u + '？', '數字', fmt(fn[k]),
                [L(fmt(fn[1 - k]), '張冠李戴', '「' + cnCount(fn[1 - k]) + '」是' + meds[1 - k].n + '的數量。')].concat(G.near(fn[k], fmt, { lo: 1, hi: 6, swap: false })));
        }
        var jarQ = G.attrQ('關於那個' + jar.n + '子，哪一個說法完全正確？', [
            { val: pos, alts: G.others(P.places, pos, '差一點點', 2) },
            {
                val: jc, alts: cols.filter(function (c) { return c !== jc; }).map(function (c) {
                    return L(c, '張冠李戴', jar.n + '子是' + jc + '的；' + c + '是' + ownerOfColor(c) + '的顏色。');
                })
            },
            { val: mat, alts: G.others(jar.mats, mat, '差一點點', 2) }
        ], function (vals) {
            return (vals[0] ? vals[0] + '的' : '') + (vals[1] || '') + (vals[2] ? vals[2] + jar.n : jar.n + '子');
        }, 2);

        var qs = [
            colorQ(order[0]), shapeQ(order[1]), revQ(order[2]), conjQ(order[3]),
            medColorQ(0), medColorQ(1), medCountQ(0), medCountQ(1), jarQ,
            G.q(shop + '在哪一條路？', '地點', street, [L(alt, '差一點點', '「' + alt + '」和「' + street + '」很像，紙條上是「' + street + '」。')]
                .concat(G.others(P.streetPairs.map(function (p) { return p[0]; }), [street, alt], '差一點點', 2))),
            G.q('是誰要住院檢查？', '人物', who, [L(nb, '似曾相識', nb + '只是在旁邊聽到。')].concat(G.others(P.home, who, '差一點點'))),
            G.dateQ('哪一天要住院檢查？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.weekQ('住院檢查是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是今天。')])
        ];
        return { note: note, qs: finish(G, qs, 12) };
    }

    /* ═══ 第 5 關：兩個人看病（兩家醫院、兩科、兩位醫師、倒過來的掛號號碼、可以吃的水果、藥盒）═══ */
    function H5(G, S) {
        var D = S.tl[S.i];
        var dayA = D.ev;
        var dayB = addDays(D.ev, G.int(1, 4));
        var rv = addDays(dayA, 14);       /* 兩個禮拜後回診（要自己算） */
        var hA = S.h[0];
        var hB = S.h[1];
        var ps = G.pick(P.kin.concat(P.friends), 2);
        var p1 = ps[0];
        var p2 = ps[1];
        var nb = people(G, null, ps);
        var deps = G.pick(P.clinics, 2);
        var docs = G.pick(P.doctors, 2);
        var rm1 = G.num(3, 35, null, null, 'rm1');
        var rm2 = G.num(3, 35, [rm1], null, 'rm2');
        var no1 = G.num(12, 98, null, twoDiff);
        var no2 = rev2(no1);
        var t2 = G.pick(P.mornings.slice(0, 4));
        var fr = G.pick(FRUITS, 4);
        var set = fr.slice(0, 3);
        var fx = fr[3];
        var pc = G.pick(P.colors);
        var lid = G.coin();
        var shape = G.pick(P.shapes);
        var mat = G.pick(P.boxMats);
        var pos = G.pick(P.places);
        var noiseMed = G.any(DAILY);
        var mn = G.num(1, 4, null, null, 'mn');
        var v = {
            p1: p1, p2: p2, nb: nb, hA: hA, hB: hB, dep1: deps[0], dep2: deps[1], doc1: docs[0], doc2: docs[1], rm1: cnNum(rm1), rm2: cnNum(rm2),
            no1: no1, no2: no2, day1: dayA.sw, day2: dayB.sw, today: D.today.sw, t2: t2, f1: set[0], f2: set[1], f3: set[2], fx: fx,
            pc: pc, lid: lid ? '有蓋子' : '沒有蓋子', shape: shape, mat: mat, pos: pos, noiseMed: noiseMed, mn: cnCount(mn)
        };
        var note = [
            T('今天是{today}。{p1}和{p2}最近都要去看病，都請你陪。', v),
            T('{p1}{day1}早上去{hA}看{dep1}，{doc1}，第{rm1}診，掛號{no1}號。', v),
            T('{p2}{day2}去{hB}看{dep2}，{doc2}，第{rm2}診，掛號{no2}號，要空腹抽血，早上{t2}以前要到。', v),
            T('{doc1}交代{p1}：水果可以吃{f1}、{f2}或{f3}，就是不要吃{fx}，因為太甜了。兩個禮拜後再回診。', v),
            T('{p2}的藥都放在一個藥盒裡，是畫著{pc}線條、{lid}的{shape}{mat}盒，放在{pos}。', v),
            T('候診的時候，{nb}跟你說，{nb}的鄰居也是看{dep1}，吃了{noiseMed}以後就好多了。', v),
            T('{p1}還說，看完病要去藥局領藥，順便買{mn}盒口罩。', v),
            T('{p1}還提醒你，{hA}的停車場在地下二樓，不過你們是搭公車去，不用停車。', v),
            T('{p2}說上次在{hB}等了很久，這次想早一點到，先在門口的機器報到。', v)
        ];
        var rmF = function (x) { return '第' + cnNum(x) + '診'; };
        var noF = function (x) { return x + ' 號'; };
        var boxQ = G.attrQ('關於那個藥盒，哪一個說法完全正確？', [
            { val: pc + '線條', alts: G.others(P.colors, pc, '差一點點', 2).map(function (l) { return L(l.v + '線條', l.k); }) },
            { val: lid ? '有蓋子' : '沒蓋子', alts: [L(lid ? '沒蓋子' : '有蓋子', '差一點點')] },
            { val: shape, alts: G.others(P.shapes, shape, '差一點點', 2) },
            { val: mat, alts: G.others(P.boxMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[0], vals[1]].filter(Boolean).join('、');
            return (s ? s + '的' : '') + (vals[2] || '') + (vals[3] ? vals[3] + '盒' : '盒子');
        }, 2);
        var qs = [
            G.q(p1 + '去哪家醫院？', '地點', hA, [L(hB, '張冠李戴', hB + '是' + p2 + '去的。')].concat(G.others(P.hospitals, [hA, hB], '差一點點', 2))),
            G.q(p2 + '去哪家醫院？', '地點', hB, [L(hA, '張冠李戴', hA + '是' + p1 + '去的。')].concat(G.others(P.hospitals, [hA, hB], '差一點點', 2))),
            G.q(p1 + '看哪一科？', '科別', deps[0], [L(deps[1], '張冠李戴', deps[1] + '是' + p2 + '看的。')].concat(G.others(P.clinics, deps, '差一點點', 2))),
            G.q(p2 + '看哪一科？', '科別', deps[1], [L(deps[0], '張冠李戴', deps[0] + '是' + p1 + '看的。')].concat(G.others(P.clinics, deps, '差一點點', 2))),
            G.q(p1 + '看哪位醫師？', '人物', docs[0], [L(docs[1], '張冠李戴', docs[1] + '是' + p2 + '的醫師。')].concat(G.others(P.doctors, docs, '差一點點', 2))),
            G.q(p2 + '是第幾診？', '數字', rmF(rm2), [L(rmF(rm1), '張冠李戴', '那是' + p1 + '的診間。')].concat(G.near(rm2, rmF, { lo: 1, hi: 40, swap: false }))),
            G.q(p1 + '掛號幾號？', '數字', noF(no1), [L(noF(no2), '張冠李戴', no2 + ' 號是' + p2 + '的，剛好倒過來。'), L(noF(rm1), '張冠李戴', cnNum(rm1) + '是診間號碼。')].concat(G.near(no1, noF, { lo: 1, hi: 99, swap: false }))),
            G.q(p2 + '掛號幾號？', '數字', noF(no2), [L(noF(no1), '張冠李戴', no1 + ' 號是' + p1 + '的，剛好倒過來。'), L(noF(rm2), '張冠李戴', cnNum(rm2) + '是診間號碼。')].concat(G.near(no2, noF, { lo: 1, hi: 99, swap: false }))),
            G.q(p2 + '早上幾點以前要到？', '時間', t2, G.others(P.mornings, t2, '數字相近')),
            G.q(p2 + '為什麼要早一點到？', '細節', '要空腹抽血', [L('怕人太多', '差一點點'), L('要先量血壓', '差一點點'), L('要先領藥', '張冠李戴', '領藥是' + p1 + '看完病要做的。')]),
            G.q('醫生說哪一種水果可以吃？', '範圍', G.any(set), [L(fx, '否定遺漏', '醫生特別說不要吃' + fx + '。')].concat(G.others(fr.concat(FRUITS), set.concat([fx]), '差一點點', 2).map(function (l) { return L(l.v, l.k, l.v + '不在醫生說的裡面。'); })), { must: true }),
            G.q('哪一種水果不要吃？', '否定', fx, set.map(function (x) { return L(x, '否定遺漏', x + '是可以吃的。'); })),
            boxQ,
            G.q('藥盒放在哪裡？', '地點', pos, G.others(P.places, pos)),
            G.q('看完病要買幾盒口罩？', '數字', cnCount(mn) + '盒', G.near(mn, function (x) { return cnCount(x) + '盒'; }, { lo: 1, hi: 7, swap: false })),
            G.dateQ('哪一天要陪' + p2 + '看病？', dayB, [L(dayA.s, '張冠李戴', dayA.s + '是陪' + p1 + '的。'), L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.dateQ('哪一天要陪' + p1 + '看病？', dayA, [L(dayB.s, '張冠李戴', dayB.s + '是陪' + p2 + '的。'), L(D.today.s, '張冠李戴', D.today.s + '是今天。')]),
            G.weekQ(p2 + '看病那天是星期幾？', dayB, [L(dayA.w, '張冠李戴', dayA.w + '是陪' + p1 + '的那天。')]),
            G.dateQ(p1 + '哪一天要回診？', rv, [L(addDays(dayB, 14).s, '張冠李戴', '要從' + p1 + '看病那天（' + dayA.s + '）算兩個禮拜。'), L(addDays(dayA, 7).s, '計算失誤', '是兩個禮拜，不是一個禮拜。')], { must: true })
        ];
        return { note: note, qs: finish(G, qs, 16) };
    }

    /* ═══ 第 6 關：醫生換了藥（每種藥的樣子、時間、顆數，藥局又打電話來改）═══ */
    function H6(G, S) {
        var D = S.tl[S.i];
        var rv = addDays(D.today, G.int(14, 24));
        var rv2 = addDays(rv, G.int(3, 9));
        var who = G.pick(P.home);
        var h = S.h[0];
        var dep = G.pick(P.clinics);
        var nb = people(G);
        var ms = G.pick(DAILY, 2);
        var hs = G.shuffle(['止痛藥', '頭痛藥', '退燒止痛藥']);
        var lk = looks(G, 4);
        var tms = G.pick(P.medTimes, 3);
        var tm1 = tms[0];
        var tm2 = tms[1];
        var tm2b = tms[2];
        var d1 = G.any(DOSES.slice(0, 3));
        var d2 = G.any(DOSES.slice(0, 3));
        var d2b = G.any(others(DOSES, d2));
        var max = G.num(2, 4, null, null, 'max');
        var fastT = G.pick(FAST);
        var nt = G.any(others(P.medTimes, [tm1, tm2, tm2b]));
        var nd = G.any(others(DOSES, [d1]));
        var pc = G.pick(P.colors);
        var lid = G.coin();
        var shape = G.pick(P.shapes);
        var mat = G.pick(P.boxMats);
        var pos = G.pick(P.places);
        var v = {
            who: who, h: h, dep: dep, nb: nb, m1: ms[0], m2: ms[1], m3: hs[0], m4: hs[1], l1: lk[0], l2: lk[1], l3: lk[2], l4: lk[3],
            tm1: tm1, tm2: tm2, tm2b: tm2b, d1: d1, d2: d2, d2b: d2b, max: cnCount(max), rv: rv.sw, rv2: rv2.sw, today: D.today.sw, fastT: fastT, nt: nt, nd: nd,
            pc: pc, lid: lid ? '有蓋子' : '沒有蓋子', shape: shape, mat: mat, pos: pos
        };
        var note = [
            T('今天是{today}，{who}從{h}看完{dep}回來，醫生換了新的藥，要你幫忙記清楚。', v),
            T('「{m1}是{l1}的，每天{tm1}吃{d1}；{m2}是{l2}的，{tm2}吃{d2}。」', v),
            T('「還有{m3}，{l3}的，只有頭痛的時候才吃，一天最多{max}顆。」', v),
            T('下次回診是{rv}，要先抽血，前一天{fastT}以後不能吃東西。', v),
            T('{nb}聽說了，說自己以前也吃過{m1}，不過{nb}是{nt}吃的，一次吃{nd}。', v),
            T('{who}的藥盒放在{pos}，是畫著{pc}線條、{lid}的{shape}{mat}盒。', v),
            T('{who}還說，醫生交代每天要走路三十分鐘，少吃太鹹的東西。', v),
            T('藥局還提醒，藥要放在陰涼的地方，不要放在浴室。', v),
            T('你想起{nb}以前常常忘了吃藥，後來買了一個會響鈴的藥盒。', v),
            T('晚上，藥局打電話來：「{m2}的吃法要改，改成{tm2b}吃{d2b}。{m1}照舊。」', v),
            T('「另外，{m3}先不要吃，改吃{m4}，是{l4}的，一樣頭痛才吃。回診也改到{rv2}。」', v)
        ];
        var boxQ = G.attrQ('關於那個藥盒，哪一個說法完全正確？', [
            { val: pc + '線條', alts: G.others(P.colors, pc, '差一點點', 2).map(function (l) { return L(l.v + '線條', l.k); }) },
            { val: lid ? '有蓋子' : '沒蓋子', alts: [L(lid ? '沒蓋子' : '有蓋子', '差一點點')] },
            { val: mat, alts: G.others(P.boxMats, mat, '差一點點', 2) }
        ], function (vals) {
            var s = [vals[0], vals[1]].filter(Boolean).join('、');
            return (s ? s + '的' : '') + (vals[2] ? vals[2] + '盒' : '盒子');
        }, 2);
        var qs = [
            G.q(ms[0] + '什麼時候吃？', '吃藥', tm1, [L(tm2, '張冠李戴', tm2 + '是' + ms[1] + '原本的時間。'), L(nt, '似曾相識', nt + '是' + nb + '以前吃的時間。')].concat(G.others(P.medTimes, [tm1, tm2, nt], '差一點點', 1))),
            G.q(ms[0] + '一次吃幾顆？', '吃藥', d1, [L(d2, '張冠李戴', d2 + '是' + ms[1] + '原本的顆數。'), L(nd, '似曾相識', nd + '是' + nb + '以前吃的。')].concat(G.others(DOSES, [d1, d2, nd], '數字相近', 2))),
            G.q(ms[0] + '長什麼樣子？', '樣子', lk[0], [L(lk[1], '張冠李戴', '那是' + ms[1] + '。'), L(lk[2], '張冠李戴', '那是' + hs[0] + '。'), L(lk[3], '張冠李戴', '那是' + hs[1] + '。')]),
            G.q(ms[1] + '最後什麼時候吃？', '更正', tm2b, [L(tm2, '新舊混淆', tm2 + '是改之前的。'), L(tm1, '張冠李戴', tm1 + '是' + ms[0] + '的時間。')].concat(G.others(P.medTimes, [tm1, tm2, tm2b], '差一點點', 1)), { must: true }),
            G.q(ms[1] + '最後一次吃幾顆？', '更正', d2b, [L(d2, '新舊混淆', d2 + '是改之前的。'), L(d1, '張冠李戴', d1 + '是' + ms[0] + '的顆數。')].concat(G.others(DOSES, [d1, d2, d2b], '數字相近', 2)), { must: true }),
            G.q(ms[1] + '長什麼樣子？', '樣子', lk[1], [L(lk[0], '張冠李戴', '那是' + ms[0] + '。'), L(lk[2], '張冠李戴', '那是' + hs[0] + '。'), L(lk[3], '張冠李戴', '那是' + hs[1] + '。')]),
            G.q('頭痛的時候，最後吃哪一種藥？', '更正', hs[1], [L(hs[0], '新舊混淆', hs[0] + '先不要吃了。'), L(ms[0], '張冠李戴', ms[0] + '是每天吃的。'), L(ms[1], '張冠李戴', ms[1] + '是每天吃的。')], { must: true }),
            G.q('新的頭痛藥長什麼樣子？', '更正', lk[3], [L(lk[2], '新舊混淆', '那是先不要吃的' + hs[0] + '。'), L(lk[0], '張冠李戴', '那是' + ms[0] + '。'), L(lk[1], '張冠李戴', '那是' + ms[1] + '。')]),
            G.q('頭痛藥一天最多吃幾顆？', '數字', cnCount(max) + '顆', G.near(max, function (x) { return cnCount(x) + '顆'; }, { lo: 1, hi: 7, swap: false })),
            G.q('哪一種藥先不要吃了？', '更正', hs[0], [L(hs[1], '新舊混淆', hs[1] + '是改吃的。'), L(ms[0], '張冠李戴', ms[0] + '照舊。'), L(ms[1], '張冠李戴', ms[1] + '只是改了吃法。')]),
            G.dateQ('下次回診最後是哪一天？', rv2, [L(rv.s, '新舊混淆', rv.s + '是改之前的。'), L(D.today.s, '張冠李戴', D.today.s + '是看完病回來的那天。')], { must: true }),
            G.dateQ('一開始說回診是哪一天？', rv, [L(rv2.s, '新舊混淆', rv2.s + '是後來才改的。')], { old: true }),
            G.weekQ('回診最後是星期幾？', rv2, [L(rv.w, '新舊混淆', rv.w + '是改之前那天。')]),
            G.q('回診前一天，幾點以後不能吃？', '時間', fastT, G.others(FAST.concat(['晚上九點']), fastT, '數字相近')),
            G.q('回診前要先做什麼？', '細節', '先抽血', [L('先量血壓', '差一點點'), L('先照 X 光', '差一點點'), L('先領藥', '差一點點')]),
            G.q('在哪家醫院看的？', '地點', h, [L(S.h[1], '差一點點')].concat(G.others(P.hospitals, [h, S.h[1]], '差一點點', 2))),
            G.q('看的是哪一科？', '科別', dep, G.others(P.clinics, dep)),
            boxQ,
            G.q('藥盒放在哪裡？', '地點', pos, G.others(P.places, pos)),
            G.q('誰打電話來改藥？', '人物', '藥局', [L('醫生', '差一點點'), L(nb, '似曾相識', nb + '只是聊了以前吃藥的事。'), L(who, '張冠李戴', who + '是看病的人。')]),
            G.q('是誰去看病、換了新藥？', '人物', who, [L(nb, '似曾相識', nb + '只是聊了以前吃藥的事。')].concat(G.others(P.kin, [who], '差一點點', 2))),
            G.q('藥盒是什麼形狀？', '形狀', shape, G.others(P.shapes, shape))
        ];
        return { note: note, qs: finish(G, qs, 20) };
    }

    /* ═══ 第 7 關：健康檢查（報到時間、樓層、號碼、要帶的東西、禁食，被一通電話大改）═══ */
    function H7(G, S) {
        var D = S.tl[S.i];
        var eve = addDays(D.ev, -1);
        var h = S.h[1];
        var h2 = S.h[0];
        var who = G.pick(P.home);
        var p = G.pick(P.kin, null, [who]);
        var nb = people(G);
        var ts = G.pick(P.mornings.slice(0, 5), 3);
        var t1 = ts[0];
        var t2 = ts[1];
        var tOld = ts[2];
        var fl = G.num(2, 12, null, null, 'fl');
        var fl2 = G.num(2, 12, [fl], null, 'fl2');
        var no = G.num(12, 98, null, twoDiff);
        var no2 = G.num(12, 98, [no], twoDiff);
        var ck = G.pick(P.checks, 4);
        var br = G.pick(P.brings, 2);
        var fs = G.pick(FAST, 2);
        var bus = G.num(123, 987, null, threeDiff);
        var stop = G.pick(P.stops);
        var gate = G.pick(['東門', '西門', '南門', '北門']);
        var meal = G.pick(P.meals);
        var hours = G.num(2, 4, null, null, 'hours');
        var v = {
            p: p, who: who, nb: nb, h: h, h2: h2, today: D.today.sw, ev: D.ev.sw, t1: t1, t2: t2, tOld: tOld, fl: cnNum(fl), fl2: cnNum(fl2), no: no, no2: no2,
            ck1: ck[0], ck2: ck[1], ckN: ck[2], hours: cnCount(hours), br: br[0], br2: br[1], fast: fs[0], fast2: fs[1], bus: bus, stop: stop, gate: gate, meal: meal
        };
        var note = [
            T('今天是{today}。{p}要去{h}做健康檢查，{who}要你陪著去，把注意事項記好。', v),
            T('「檢查在{ev}早上{t1}，到{fl}樓的健檢中心報到，號碼是{no}號，要做{ck1}和{ck2}，大約{hours}個小時。」', v),
            T('「要帶健保卡、身分證和{br}。前一天{fast}以後不能吃東西，連水都不能喝。」', v),
            T('「{p}有高血壓，早上的降血壓藥可以配一小口水吃。去醫院搭 {bus} 號公車，在{stop}下車，從{gate}進去。」', v),
            T('「檢查完可以去醫院地下室吃{meal}。」{nb}說上次去做健檢等了兩個小時，還建議你們加做{ckN}。', v),
            T('你想起去年{who}自己做健檢的時候，是在{h2}，早上{tOld}就要到。', v),
            T('「如果檢查當天身體不舒服，要先打電話給健檢中心，不要自己改時間。」拿到報告以後，要放在家裡固定的抽屜。', v),
            T('{nb}又說，健檢中心的沙發很舒服，等的時候可以帶一本書去看。', v),
            T('你在月曆上把檢查那一天圈起來，旁邊寫了「不要吃早餐」。', v),
            T('前一天下午，健檢中心打電話來：「報到時間改成{t2}，改到{fl2}樓報到，號碼變成{no2}號。」', v),
            T('「{br}不用帶了，改帶{br2}。還有，前一天改成{fast2}以後不能吃東西，水可以喝一點。」', v)
        ];
        var flF = function (x) { return cnNum(x) + '樓'; };
        var noF = function (x) { return x + ' 號'; };
        var same = G.any(['檢查日期', '搭的公車', '要做的檢查']);
        var qs = [
            G.q('最後幾點報到？', '更正', t2, [L(t1, '新舊混淆', t1 + '是改之前的。'), L(tOld, '似曾相識', tOld + '是去年' + who + '健檢的時間。')].concat(G.others(P.mornings, ts, '數字相近', 1)), { must: true }),
            G.q('一開始說幾點報到？', '一開始', t1, [L(t2, '新舊混淆', t2 + '是後來才改的。'), L(tOld, '似曾相識', tOld + '是去年的時間。')].concat(G.others(P.mornings, ts, '數字相近', 1)), { old: true }),
            G.q('最後到幾樓報到？', '更正', flF(fl2), [L(flF(fl), '新舊混淆', cnNum(fl) + '樓是改之前的。')].concat(G.near(fl2, flF, { lo: 1, hi: 15, swap: false }))),
            G.q('一開始說到幾樓報到？', '一開始', flF(fl), [L(flF(fl2), '新舊混淆', cnNum(fl2) + '樓是後來才改的。')].concat(G.near(fl, flF, { lo: 1, hi: 15, swap: false })), { old: true }),
            G.q('報到號碼最後是幾號？', '更正', noF(no2), [L(noF(no), '新舊混淆', no + ' 號是改之前的。')].concat(G.near(no2, noF, { lo: 1, hi: 99 }))),
            G.q('一開始說報到號碼幾號？', '一開始', noF(no), [L(noF(no2), '新舊混淆', no2 + ' 號是後來才改的。')].concat(G.near(no, noF, { lo: 1, hi: 99 })), { old: true }),
            G.dateQ('哪一天檢查？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。'), L(eve.s, '張冠李戴', eve.s + '是檢查前一天。')], { must: true }),
            G.dateQ('哪一天晚上開始不能吃東西？', eve, [L(D.ev.s, '順序顛倒', '要在檢查的前一天，也就是' + eve.s + '。')]),
            G.weekQ('檢查那天是星期幾？', D.ev, [L(eve.w, '張冠李戴', eve.w + '是檢查前一天。')]),
            G.q('在哪家醫院檢查？', '地點', h, [L(h2, '似曾相識', h2 + '是去年' + who + '健檢的地方。')].concat(G.others(P.hospitals, [h, h2], '差一點點', 2))),
            G.q('陪誰去做健康檢查？', '人物', p, [L(who, '張冠李戴', who + '是叫你陪著去的人。'), L(nb, '似曾相識', nb + '只是分享經驗。')].concat(G.others(P.kin, [p, who], '差一點點', 1))),
            G.q('最後要帶什麼去？', '更正', br[1], [L(br[0], '新舊混淆', br[0] + '後來不用帶了。')].concat(G.others(P.brings, br, '差一點點', 2)), { must: true }),
            G.q('除了健保卡，還要帶哪個證件？', '細節', '身分證', [L('駕照', '差一點點'), L('戶口名簿', '差一點點'), L('護照', '差一點點')]),
            G.q('前一天最後幾點以後不能吃？', '更正', fs[1], [L(fs[0], '新舊混淆', fs[0] + '是改之前的。')].concat(G.others(FAST.concat(['晚上九點']), fs, '數字相近', 2)), { must: true }),
            G.q('一開始說前一天幾點以後不能吃？', '一開始', fs[0], [L(fs[1], '新舊混淆', fs[1] + '是後來才改的。')].concat(G.others(FAST.concat(['晚上九點']), fs, '數字相近', 2)), { old: true }),
            G.q('檢查前，水最後可以喝嗎？', '更正', '可以喝一點', [L('連水都不能喝', '新舊混淆', '這是改之前的交代。'), L('可以喝飲料', '差一點點'), L('只能喝熱水', '差一點點')]),
            G.q('去醫院搭幾號公車？', '數字', bus, G.near(bus, String, { lo: 100, hi: 999 })),
            G.q('在哪裡下公車？', '地點', stop, G.others(P.stops, stop)),
            G.q('從醫院哪一個門進去？', '地點', gate, others(['東門', '西門', '南門', '北門'], gate).map(function (x) { return L(x, '差一點點'); })),
            G.q('檢查完去吃什麼？', '美食', meal, G.others(P.meals, meal)),
            G.q('誰打電話來改時間？', '人物', '健檢中心', [L('醫院櫃台', '差一點點'), L(nb, '似曾相識', nb + '只是分享經驗。'), L(who, '張冠李戴', who + '是叫你陪著去的人。')]),
            G.q('電話裡「沒有」改到的是？', '更正', same, ['報到時間', '報到樓層', '報到號碼', '要帶的東西', '禁食時間'].map(function (c) { return L(c, '新舊混淆', '「' + c + '」在電話裡改掉了。'); })),
            G.q('要做哪兩項檢查？', '組合', ck[0] + '和' + ck[1], [L(ck[0] + '和' + ck[2], '似曾相識', ck[2] + '是' + nb + '建議加做的。'), L(ck[1] + '和' + ck[3], '差一點點'), L(ck[2] + '和' + ck[3], '差一點點')]),
            G.q('檢查大約要幾個小時？', '數字', cnCount(hours) + '個小時', [L('兩個小時', '似曾相識', '兩個小時是' + nb + '上次等的時間。')].concat(G.near(hours, function (x) { return cnCount(x) + '個小時'; }, { lo: 1, hi: 6, swap: false }))),
            G.q('早上的降血壓藥可以吃嗎？', '細節', '可以，配一小口水', [L('不能吃', '差一點點'), L('檢查完再吃', '差一點點'), L('可以，配一杯水', '差一點點')]),
            G.q('檢查完去哪裡吃東西？', '地點', '醫院地下室', [L('醫院一樓', '差一點點'), L('醫院對面的店', '差一點點'), L('回家再吃', '差一點點')])
        ];
        return { note: note, qs: finish(G, qs, 24, 4) };
    }

    /* ═══ 第 8 關：陪診的一天（兩家醫院、兩班公車、藥的改變、醫師換人、費用計算，全部混合）═══ */
    function H8(G, S) {
        var today = S.tl[S.i].today;
        var ev = addDays(today, 1);
        var rvs = [addDays(ev, G.int(10, 20))];
        rvs.push(addDays(rvs[0], G.int(2, 6) * (G.coin() ? 1 : -1)));
        var h1 = S.h[0];
        var h2 = S.h[1];
        var ps = G.pick(P.kin, 2);
        var p1 = ps[0];
        var p2 = ps[1];
        var nbs = people(G, 2);
        var nb = nbs[0];
        var nb2 = nbs[1];
        var fee = G.int(2, 4) * 50;
        var self = G.num(10, 18, null, null, 'self') * 50;
        var oldTotal = fee * 2 + self;
        var cash = Math.ceil((oldTotal + G.int(1, 3) * 50) / 100) * 100;
        var self2 = self + (cash - oldTotal) + G.int(1, 4) * 50;
        var total = fee * 2 + self2;
        var diff = total - cash;
        var bus1 = G.num(123, 987, null, threeDiff);
        var bus2 = G.any(perms(bus1));
        var t1 = G.pick(P.mornings);
        var stopA = G.pick(P.stops);
        var deps = G.pick(P.clinics, 3);
        var docs = G.pick(P.doctors, 3);
        var rm1 = G.num(3, 35, null, null, 'rm1');
        var no2 = G.num(12, 98, null, twoDiff);
        var no3 = rev2(no2);
        var ms = G.pick(DAILY, 3);
        var lk = looks(G, 3);
        var meal = G.pick(P.meals);
        var noiseFood = G.any(others(P.meals, meal));
        var v = {
            p1: p1, p2: p2, nb: nb, nb2: nb2, cash: cash, fee: fee, self: self, self2: self2, bus1: bus1, bus2: bus2, t1: t1, stopA: stopA,
            h1: h1, h2: h2, dep1: deps[0], dep2: deps[1], depN: deps[2], doc1: docs[0], doc2: docs[1], doc3: docs[2], rm1: cnNum(rm1), no2: no2, no3: no3,
            m1: ms[0], m2: ms[1], m3: ms[2], l1: lk[0], l2: lk[1], l3: lk[2], meal: meal, noiseFood: noiseFood,
            today: today.sw, ev: ev.sw, rv1: rvs[0].sw, rv2: rvs[1].sw
        };
        var note = [
            T('今天是{today}。明天{ev}是忙碌的一天，你要陪{p1}和{p2}看病，身上帶了 {cash} 元。', v),
            T('早上{t1}先搭 {bus1} 號公車，在{stopA}下車，陪{p1}去{h1}的{dep1}，{doc1}，第{rm1}診。', v),
            T('看完病，到一樓藥局領藥：{m1}是{l1}的，早餐後吃一顆；{m2}是{l2}的，睡前吃半顆。', v),
            T('中午在醫院附近吃{meal}，然後搭 {bus2} 號公車去{h2}，陪{p2}看{dep2}，{doc2}，掛號{no2}號。', v),
            T('掛號費兩個人各 {fee} 元，{p2}還要自費 {self} 元做檢查。', v),
            T('你想起上個月陪{nb}去{h1}，{nb}看的是{depN}，那天等到晚上才看到。', v),
            T('{nb2}說{h2}的停車場很難停，最好搭公車，還說醫院旁邊那家{noiseFood}很好吃。', v),
            T('出門前，記得把{p1}和{p2}的健保卡都帶上，兩張卡放在同一個小袋子裡。', v),
            T('{p2}說下午看完病想順便去市場買菜，不過要看時間夠不夠。', v),
            T('你想起上個月陪{nb}的那天，還在醫院門口遇到以前的老同事，聊了好久。', v),
            T('晚上，{doc1}的護理師打電話來：「{m1}改成晚餐後吃，一次兩顆。{m2}先停掉，改吃{m3}，是{l3}的，睡前吃一顆。」', v),
            T('{p2}那邊也改了：{doc2}明天下午請假，改成{doc3}看診，號碼改成{no3}號，自費檢查也漲到 {self2} 元。', v),
            T('睡前，兩家醫院都傳來簡訊：{p1}下次回診是{rv1}，{p2}下次回診是{rv2}。', v)
        ];
        var noF = function (x) { return x + ' 號'; };
        var qs = [
            G.q('第一班公車搭幾號？', '數字', bus1, [L(bus2, '張冠李戴', bus2 + ' 是第二班。')].concat(G.near(bus1, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('第二班公車搭幾號？', '數字', bus2, [L(bus1, '張冠李戴', bus1 + ' 是第一班。')].concat(G.near(bus2, String, { lo: 100, hi: 999 })), { must: true }),
            G.q('早上幾點出門？', '時間', t1, G.others(P.mornings, t1, '數字相近')),
            G.q('第一班公車在哪裡下車？', '地點', stopA, G.others(P.stops, stopA)),
            G.q('早上去哪家醫院？', '地點', h1, [L(h2, '張冠李戴', h2 + '是下午去的。')].concat(G.others(P.hospitals, [h1, h2], '差一點點', 2))),
            G.q('下午去哪家醫院？', '地點', h2, [L(h1, '張冠李戴', h1 + '是早上去的。')].concat(G.others(P.hospitals, [h1, h2], '差一點點', 2))),
            G.q('早上看哪一科？', '科別', deps[0], [L(deps[1], '張冠李戴', deps[1] + '是下午看的。'), L(deps[2], '似曾相識', deps[2] + '是' + nb + '上個月看的。')].concat(G.others(P.clinics, deps, '差一點點', 1))),
            G.q('下午看哪一科？', '科別', deps[1], [L(deps[0], '張冠李戴', deps[0] + '是早上看的。'), L(deps[2], '似曾相識', deps[2] + '是' + nb + '上個月看的。')].concat(G.others(P.clinics, deps, '差一點點', 1))),
            G.q('早上看哪位醫師？', '人物', docs[0], [L(docs[1], '張冠李戴', docs[1] + '是下午原本的醫師。'), L(docs[2], '張冠李戴', docs[2] + '是下午換的醫師。')].concat(G.others(P.doctors, docs, '差一點點', 1))),
            G.q('下午最後是哪位醫師？', '更正', docs[2], [L(docs[1], '新舊混淆', docs[1] + '請假了。'), L(docs[0], '張冠李戴', docs[0] + '是早上的醫師。')].concat(G.others(P.doctors, docs, '差一點點', 1)), { must: true }),
            G.q('下午原本是哪位醫師？', '一開始', docs[1], [L(docs[2], '新舊混淆', docs[2] + '是後來換的。'), L(docs[0], '張冠李戴', docs[0] + '是早上的醫師。')].concat(G.others(P.doctors, docs, '差一點點', 1)), { old: true }),
            G.q('早上是第幾診？', '數字', '第' + cnNum(rm1) + '診', G.near(rm1, function (x) { return '第' + cnNum(x) + '診'; }, { lo: 1, hi: 40, swap: false })),
            G.q('下午最後的號碼是幾號？', '更正', noF(no3), [L(noF(no2), '新舊混淆', no2 + ' 號是改之前的，剛好倒過來。')].concat(G.near(no3, noF, { lo: 1, hi: 99, swap: false })), { must: true }),
            G.q('下午原本掛號幾號？', '一開始', noF(no2), [L(noF(no3), '新舊混淆', no3 + ' 號是後來改的，剛好倒過來。')].concat(G.near(no2, noF, { lo: 1, hi: 99, swap: false })), { old: true }),
            G.q(ms[0] + '最後什麼時候吃？', '更正', '晚餐後', [L('早餐後', '新舊混淆', '早餐後是改之前的。'), L('睡前', '張冠李戴', '睡前是另一種藥。'), L('午餐後', '差一點點')], { must: true }),
            G.q(ms[0] + '最後一次吃幾顆？', '更正', '兩顆', [L('一顆', '新舊混淆', '一顆是改之前的。'), L('半顆', '張冠李戴', '半顆是原本睡前那種藥。'), L('三顆', '數字相近')]),
            G.q(ms[0] + '一開始什麼時候吃？', '一開始', '早餐後', [L('晚餐後', '新舊混淆', '晚餐後是後來改的。'), L('睡前', '張冠李戴', '睡前是另一種藥。'), L('午餐後', '差一點點')], { old: true }),
            G.q(ms[0] + '長什麼樣子？', '樣子', lk[0], [L(lk[1], '張冠李戴', '那是' + ms[1] + '。'), L(lk[2], '張冠李戴', '那是' + ms[2] + '。')]
                .concat(looks(G, 5).filter(function (x) { return lk.indexOf(x) < 0; }).slice(0, 1).map(function (x) { return L(x, '差一點點'); }))),
            G.q('睡前最後吃哪一種藥？', '更正', ms[2], [L(ms[1], '新舊混淆', ms[1] + '先停掉了。'), L(ms[0], '張冠李戴', ms[0] + '是晚餐後吃的。')].concat(G.others(DAILY, ms, '差一點點', 1)), { must: true }),
            G.q('新換的藥長什麼樣子？', '更正', lk[2], [L(lk[1], '新舊混淆', '那是停掉的' + ms[1] + '。'), L(lk[0], '張冠李戴', '那是' + ms[0] + '。')]
                .concat(looks(G, 5).filter(function (x) { return lk.indexOf(x) < 0; }).slice(0, 1).map(function (x) { return L(x, '差一點點'); }))),
            G.q('睡前的藥最後一次吃幾顆？', '更正', '一顆', [L('半顆', '新舊混淆', '半顆是原本那種藥的。'), L('兩顆', '張冠李戴', '兩顆是' + ms[0] + '的。'), L('三顆', '數字相近')]),
            G.q('原本睡前吃哪一種藥？', '一開始', ms[1], [L(ms[2], '新舊混淆', ms[2] + '是後來改吃的。'), L(ms[0], '張冠李戴', ms[0] + '是另一種藥。')].concat(G.others(DAILY, ms, '差一點點', 1)), { old: true }),
            G.q('誰打電話來改藥？', '人物', '護理師', [L('藥師', '差一點點'), L(nb, '似曾相識', nb + '只是上個月一起去過。'), L(nb2, '似曾相識', nb2 + '只是說了停車的事。')]),
            G.q('中午吃什麼？', '美食', meal, [L(noiseFood, '似曾相識', noiseFood + '是' + nb2 + '說好吃的。')].concat(G.others(P.meals, [meal, noiseFood], '差一點點', 2))),
            G.q('早上陪誰看病？', '人物', p1, [L(p2, '張冠李戴', p2 + '是下午。'), L(nb, '似曾相識', nb + '是上個月陪的。')].concat(G.others(P.kin, ps, '差一點點', 1))),
            G.q('下午陪誰看病？', '人物', p2, [L(p1, '張冠李戴', p1 + '是早上。'), L(nb, '似曾相識', nb + '是上個月陪的。')].concat(G.others(P.kin, ps, '差一點點', 1))),
            G.q('掛號費一個人多少錢？', '數字', yuan(fee), G.near(fee, yuan, { step: 50, swap: false, lo: 50 })),
            G.q('自費檢查最後多少錢？', '更正', yuan(self2), [L(yuan(self), '新舊混淆', self + ' 元是漲價之前。')].concat(G.near(self2, yuan, { step: 50, swap: false })), { must: true }),
            G.q('自費檢查原本多少錢？', '一開始', yuan(self), [L(yuan(self2), '新舊混淆', self2 + ' 元是漲價之後。')].concat(G.near(self, yuan, { step: 50, swap: false })), { old: true }),
            G.q('最後一共要付多少錢？', '計算', yuan(total), [L(yuan(oldTotal), '新舊混淆', '這是漲價之前的總數。'), L(yuan(fee + self2), '計算失誤', '掛號費有兩個人。'),
            L(yuan(total + 100), '計算失誤'), L(yuan(total - 50), '計算失誤')], { must: true }),
            G.q('身上的錢夠不夠？', '計算', '不夠', [L('夠', '新舊混淆', '原本夠，自費漲價後一共 ' + total + ' 元，就不夠了。'), L('剛剛好', '差一點點'), L('不用付錢', '差一點點')], { must: true }),
            G.q('要付的錢和身上的錢相差多少？', '計算', yuan(diff), [L(yuan(cash - oldTotal), '新舊混淆', '那是漲價之前剩下的錢。'), L(yuan(self2 - self), '計算失誤', '那是自費漲的價錢。'),
            L(yuan(diff + 50), '計算失誤'), L(yuan(diff + 100), '計算失誤')]),
            G.q('身上帶了多少錢？', '數字', yuan(cash), G.near(cash, yuan, { step: 100, swap: false, lo: 100 })),
            G.dateQ('陪兩個人看病是哪一天？', ev, [L(today.s, '張冠李戴', today.s + '是前一天晚上。')], { must: true }),
            G.dateQ(p1 + '下次回診是哪一天？', rvs[0], [L(rvs[1].s, '張冠李戴', rvs[1].s + '是' + p2 + '回診的日子。')], { must: true }),
            G.dateQ(p2 + '下次回診是哪一天？', rvs[1], [L(rvs[0].s, '張冠李戴', rvs[0].s + '是' + p1 + '回診的日子。')]),
            G.q('下午的醫師為什麼換人？', '更正', '原本的醫師請假', [L('掛號額滿', '差一點點'), L('停車場太難停', '似曾相識', '停車是' + nb2 + '說的。'), L('看錯科', '差一點點')])
        ];
        return { note: note, qs: finish(G, qs, 32, 6) };
    }

    Q.addTheme({
        id: 'health', name: '看病',
        names: ['看病前一天', '幫忙跑兩趟', '就醫前三件事', '住院要帶的', '兩個人看病', '醫生換了藥', '健康檢查', '陪診的一天'],
        /* 時間軸：每一關隔 3～9 天；看病、回診的日期在 2～6 天後 */
        setup: function (G) { return { h: G.pick(P.hospitals, 2), tl: timeline(G, [3, 9], [2, 6]) }; },
        levels: [H1, H2, H3, H4, H5, H6, H7, H8]
    });
})();
