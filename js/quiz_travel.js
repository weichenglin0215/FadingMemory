/* ═══════════════════════════════════════════════════════════════════
   quiz_travel.js — 測試模式・主軸二：旅遊
   · 一局抽 3 個真實的台灣旅遊地點（quiz_pools.js 的 trips），8 關重複使用：
     同一個地點會在不同關卡、不同的人、不同的行程裡再出現，更容易混淆。
   · 內容：挑地點、訂房、交通、人數、景點特色與歷史、美食、名產／伴手禮、突發事件、天氣、時間安排與調整。
   · 第 1～4 關沿用共用結構（quiz_gen.js 的 L1～L4），只換開場文字與題庫；第 5～8 關是旅遊專屬的故事。
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
    var finish = lib.finish;
    var addDays = lib.addDays;
    var wearOf = lib.wearOf;
    var people = lib.people;

    function names(arr) { return arr.map(function (x) { return x.n; }); }

    /* 時間軸：一局橫跨大半年，每一關的出發日期落在不同的月份（季節不同 → 要帶的衣服不同）。
       只用季節很明確的月份（3、6、9 月這種換季的月份不用），出發前 3～10 天是「今天」。 */
    var MONTHS = [1, 2, 4, 5, 7, 8, 10, 11, 12];
    function travelTimeline(G) {
        var s = G.int(0, MONTHS.length - 1);
        var out = [];
        for (var i = 0; i < 8; i++) {
            var k = s + i;
            var m = MONTHS[k % MONTHS.length] + (k >= MONTHS.length ? 12 : 0);
            var ev = lib.mkDay(m, G.int(12, 28));
            out.push({ today: addDays(ev, -G.int(3, 10)), ev: ev });
        }
        return out;
    }
    function others(list, not) { return list.filter(function (x) { return [].concat(not).indexOf(x) < 0; }); }
    var ppl = function (n) { return cnCount(n) + '個人'; };
    var yuan = function (n) { return n + ' 元'; };

    /* ═══ 第 5 關：兩家人的旅行（兩個地點、兩種交通、兩種住宿、誰想去哪、伴手禮的範圍）═══ */
    function T5(G, S) {
        var D = S.tl[S.i];
        var evA = D.ev;
        var evB = addDays(D.ev, G.int(40, 90));     /* 第二家人晚一兩個月出發：多半換了季節 */
        while (MONTHS.indexOf(evB.m) < 0) evB = addDays(evB, 10);
        var dA = S.d[0];
        var dB = S.d[1];
        var dC = S.d[2];
        var ps = G.pick(P.kin.concat(P.friends), 2);
        var p1 = ps[0];
        var p2 = ps[1];
        var nb = people(G, null, ps);
        var nA = G.num(3, 6, null, null, 'nA');
        var nB = G.num(2, 6, [nA], null, 'nB');
        var trs = G.pick(P.transports, 2);
        var sts = G.pick(P.stays, 2);
        var spA = G.any(dA.spots);
        var spB = G.any(dB.spots);
        var ws = G.pick(P.weathers, 2);
        var gA = G.shuffle(dA.gifts);
        var gB = G.shuffle(dB.gifts);
        var set = G.shuffle([gA[0], gA[1], gB[0]]);
        var gx = gB[1];
        var foodA = G.any(dA.foods);
        var v = {
            p1: p1, p2: p2, nb: nb, dA: dA.n, dB: dB.n, nA: cnCount(nA), nB: cnCount(nB), tA: trs[0], tB: trs[1], stA: sts[0], stB: sts[1],
            spA: spA.n, fA: spA.f, spB: spB.n, fB: spB.f, wA: ws[0], wB: ws[1], g1: set[0], g2: set[1], g3: set[2], gx: gx, foodA: foodA,
            today: D.today.sw, evA: evA.sw, evB: evB.sw
        };
        var note = [
            T('今天是{today}晚上八點。{p1}和{p2}最近都要去旅行，出發前都找你幫忙。', v),
            T('{p1}一家{nA}個人{evA}要去{dA}，搭{tA}去，住在{stA}。{p1}說到了{dA}一定要去{spA}，那裡是{fA}。', v),
            T('{p2}和朋友{nB}個人{evB}要去{dB}，搭{tB}去，住{stB}。{p2}想去{spB}，聽說是{fB}。', v),
            T('兩個人都要你幫忙查天氣：{dA}那幾天{wA}，{dB}那幾天{wB}。', v),
            T('{p1}說回來要送你伴手禮，{g1}、{g2}或{g3}都可以挑，你說只要不是{gx}就好，因為家裡還有一大包。', v),
            T('你想起{nb}去年也去過{dA}，說那邊的{foodA}排了一個小時才吃到。', v),
            T('{p2}還說，那邊的蚊子很多，要記得帶防蚊液，上次{nb}就被叮得滿腳包。', v),
            T('你答應兩個人，出發前一天晚上會再打電話，提醒他們要帶的東西。', v)
        ];
        var trips = names(P.trips);
        var qs = [
            G.q(p1 + '一家要去哪裡玩？', '地點', dA.n, [L(dB.n, '張冠李戴', dB.n + '是' + p2 + '要去的。')].concat(G.others(others(trips, [dA.n, dB.n]), [], '差一點點', 2))),
            G.q(p2 + '要去哪裡玩？', '地點', dB.n, [L(dA.n, '張冠李戴', dA.n + '是' + p1 + '一家要去的。')].concat(G.others(others(trips, [dA.n, dB.n]), [], '差一點點', 2))),
            G.q(p1 + '一家有幾個人？', '數字', ppl(nA), [L(ppl(nB), '張冠李戴', cnCount(nB) + '個人是' + p2 + '那一團。')].concat(G.near(nA, ppl, { lo: 1, hi: 9, swap: false }))),
            G.q(p2 + '那一團有幾個人？', '數字', ppl(nB), [L(ppl(nA), '張冠李戴', cnCount(nA) + '個人是' + p1 + '一家。')].concat(G.near(nB, ppl, { lo: 1, hi: 9, swap: false }))),
            G.q(p1 + '一家怎麼去？', '交通', '搭' + trs[0], [L('搭' + trs[1], '張冠李戴', trs[1] + '是' + p2 + '搭的。')].concat(G.others(others(P.transports, trs), [], '差一點點', 2).map(function (l) { return L('搭' + l.v, l.k); }))),
            G.q(p2 + '怎麼去？', '交通', '搭' + trs[1], [L('搭' + trs[0], '張冠李戴', trs[0] + '是' + p1 + '一家搭的。')].concat(G.others(others(P.transports, trs), [], '差一點點', 2).map(function (l) { return L('搭' + l.v, l.k); }))),
            G.q(p1 + '一家住哪裡？', '住宿', sts[0], [L(sts[1], '張冠李戴', sts[1] + '是' + p2 + '住的。')].concat(G.others(others(P.stays, sts), [], '差一點點', 2))),
            G.q(p2 + '住哪裡？', '住宿', sts[1], [L(sts[0], '張冠李戴', sts[0] + '是' + p1 + '一家住的。')].concat(G.others(others(P.stays, sts), [], '差一點點', 2))),
            G.q('誰想去' + spA.n + '？', '人物', p1, [L(p2, '張冠李戴', p2 + '想去的是' + spB.n + '。'), L(nb, '似曾相識', nb + '只是去年去過。')].concat(G.others(P.kin, [p1, p2], '差一點點', 1))),
            G.q(spA.n + '是什麼樣的地方？', '景點', spA.f, [L(spB.f, '張冠李戴', '那是' + spB.n + '。')].concat(others(dA.spots, [spA]).map(function (s) { return L(s.f, '差一點點', '那是' + s.n + '。'); }))),
            G.q(p2 + '想去哪個景點？', '景點', spB.n, [L(spA.n, '張冠李戴', spA.n + '是' + p1 + '想去的。')].concat(others(dB.spots, [spB]).map(function (s) { return L(s.n, '差一點點'); }))),
            G.q(p1 + '要去的地方，那幾天天氣怎樣？', '天氣', ws[0], [L(ws[1], '張冠李戴', '那是' + p2 + '要去的地方。')].concat(G.others(others(P.weathers, ws), [], '差一點點', 2))),
            G.q(p2 + '要去的地方，那幾天天氣怎樣？', '天氣', ws[1], [L(ws[0], '張冠李戴', '那是' + p1 + '要去的地方。')].concat(G.others(others(P.weathers, ws), [], '差一點點', 2))),
            G.q('哪一樣伴手禮可以挑？', '範圍', G.any(set), [L(gx, '否定遺漏', '你說只要不是' + gx + '就好。'), L(foodA, '似曾相識', foodA + '是' + nb + '排隊吃的。')]
                .concat(dC.gifts.map(function (x) { return L(x, '差一點點', x + '不在可以挑的裡面。'); })), { must: true }),
            G.q('你說不要哪一樣伴手禮？', '否定', gx, set.map(function (x) { return L(x, '否定遺漏', x + '是可以挑的。'); })),
            G.q('伴手禮是誰要送你的？', '人物', p1, [L(p2, '張冠李戴'), L(nb, '似曾相識', nb + '只是去年去過' + dA.n + '。')].concat(G.others(P.friends, [p1, p2, nb], '差一點點', 1))),
            G.dateQ(p1 + '一家哪一天出發？', evA, [L(evB.s, '張冠李戴', evB.s + '是' + p2 + '出發的日子。'), L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
            G.dateQ(p2 + '哪一天出發？', evB, [L(evA.s, '張冠李戴', evA.s + '是' + p1 + '一家出發的日子。'), L(D.today.s, '張冠李戴', D.today.s + '是今天。')]),
            G.wearQ(p1 + '一家要帶哪一種衣服？', evA, [L(wearOf(evB), '張冠李戴', '那是' + p2 + '出發時的季節。')], { must: true }),
            G.wearQ(p2 + '要帶哪一種衣服？', evB, [L(wearOf(evA), '張冠李戴', '那是' + p1 + '一家出發時的季節。')])
        ];
        return { note: note, qs: finish(G, qs, 16) };
    }

    /* ═══ 第 6 關：改了行程（三天兩夜的規劃，被天氣和人數一改再改）═══ */
    function T6(G, S) {
        var D = S.tl[S.i];
        var back = addDays(D.ev, 2);
        var d = S.d[1];
        var d2 = S.d[0];
        var who = G.pick(P.home);
        var p = G.pick(P.kin, null, [who]);
        var nbs = people(G, 2);
        var nb = nbs[0];
        var nb2 = nbs[1];
        var n = G.num(3, 5, null, null, 'n');
        var n2 = n + 1;
        var r = G.num(1, 2, null, null, 'r');
        var r2 = r + 1;
        var rt = G.pick(P.roomTypes);
        var stay = G.pick(P.stayNames) + G.pick(P.stays);
        var ci = G.pick(['兩點', '三點', '四點']);
        var mi = G.int(2, P.mornings.length - 1);
        var t1 = P.mornings[mi];
        var t2 = P.mornings[mi - G.int(1, 2)];
        var sp = G.shuffle(d.spots);
        var fd = G.shuffle(d.foods);
        var g = G.any(d.gifts);
        var gn = G.num(2, 5, null, null, 'gn');
        var indoor = G.pick(P.indoors);
        var g2 = G.any(d2.gifts);
        var v = {
            who: who, p: p, nb: nb, nb2: nb2, d: d.n, d2: d2.n, n: cnCount(n), n2: cnCount(n2), r: cnCount(r), r2: cnCount(r2), rt: rt, stay: stay,
            ci: ci, t1: t1, t2: t2, s1: sp[0].n, f1: sp[0].f, s2: sp[1].n, s3: sp[2].n, fa: fd[0], fb: fd[1], fc: fd[2], g: g, gn: cnCount(gn), indoor: indoor, g2: g2,
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}晚上九點。{who}在規劃{ev}出發、去{d}三天兩夜的旅行，一共{n}個人，早上{t1}出發。', v),
            T('「住的地方訂在{stay}，訂了{r}間{rt}，下午{ci}以後才能入住。」', v),
            T('「第一天早上去{s1}，那裡是{f1}；下午去{s2}，晚上吃{fb}。第二天早上去{s3}，中午吃{fa}。」', v),
            T('「回程前要買{gn}盒{g}當伴手禮，其中一盒要送{nb}。」', v),
            T('{who}還說，住的地方早餐會準備當地的小菜，不用另外買。', v),
            T('你想起上次全家出去玩，就是因為沒先訂好房間，最後只好住在很遠的旅館。', v),
            T('{nb2}聽說你們要去{d}，說上次去的時候{s3}人多到擠不進去，還說{d2}的{g2}比較好吃，不過你們已經決定了。', v),
            T('出發前一天，{who}又打電話來：「氣象說第一天下午有大雨，{s2}改成去{indoor}。晚餐的{fb}也不吃了，改吃{fc}。」', v),
            T('「還有，{p}也要一起去，變成{n2}個人，房間要改成{r2}間。出發時間從{t1}改成{t2}，早一點出門才不會塞車。」', v)
        ];
        var room = function (x) { return cnCount(x) + '間'; };
        var qs = [
            G.q('最後一共幾個人去？', '更正', ppl(n2), [L(ppl(n), '新舊混淆', cnCount(n) + '個人是' + p + '加入之前。')].concat(G.near(n2, ppl, { lo: 1, hi: 9, swap: false }))),
            G.q('最後訂幾間房？', '更正', room(r2), [L(room(r), '新舊混淆', cnCount(r) + '間是改之前的。'), L(room(n2), '張冠李戴', cnCount(n2) + '是人數。')].concat(G.near(r2, room, { lo: 1, hi: 6, swap: false }))),
            G.q('訂的是什麼房型？', '住宿', rt, G.others(P.roomTypes, rt)),
            G.q('住在哪裡？', '住宿', stay, G.others(P.stayNames, stay.slice(0, 2), '差一點點', 2).map(function (l) { return L(l.v + stay.slice(2), l.k); })
                .concat(G.others(P.stays, stay.slice(2), '差一點點', 2).map(function (l) { return L(stay.slice(0, 2) + l.v, l.k); }))),
            G.q('下午幾點以後才能入住？', '時間', ci, others(['一點', '兩點', '三點', '四點', '五點'], ci).map(function (x) { return L(x, '數字相近'); })),
            G.q('最後早上幾點出發？', '更正', t2, [L(t1, '新舊混淆', t1 + '是改之前的出發時間。')].concat(G.others(P.mornings, [t1, t2], '數字相近', 2))),
            G.q('第一天早上去哪裡？', '順序', sp[0].n, [L(sp[1].n, '順序顛倒', sp[1].n + '原本是第一天下午。'), L(sp[2].n, '順序顛倒', sp[2].n + '是第二天早上。'), L(indoor, '張冠李戴', indoor + '是下大雨改去的。')]),
            G.q('第一天下午最後去哪裡？', '更正', indoor, [L(sp[1].n, '新舊混淆', sp[1].n + '因為大雨取消了。'), L(sp[2].n, '順序顛倒', sp[2].n + '是第二天早上。')].concat(G.others(P.indoors, indoor, '差一點點', 1))),
            G.q('第二天早上去哪裡？', '順序', sp[2].n, [L(sp[0].n, '順序顛倒', sp[0].n + '是第一天早上。'), L(sp[1].n, '新舊混淆', sp[1].n + '已經取消了。'), L(indoor, '張冠李戴', indoor + '是第一天下午。')]),
            G.q('第一天早上的景點有什麼特色？', '景點', sp[0].f, [L(sp[1].f, '張冠李戴', '那是' + sp[1].n + '的特色。'), L(sp[2].f, '張冠李戴', '那是' + sp[2].n + '的特色。')]
                .concat(d2.spots.map(function (s) { return L(s.f, '差一點點', '那是' + s.n + '。'); }))),
            G.q('第一天晚餐最後吃什麼？', '更正', fd[2], [L(fd[1], '新舊混淆', fd[1] + '是改之前的晚餐。'), L(fd[0], '張冠李戴', fd[0] + '是第二天中午吃的。'), L(g2, '似曾相識', g2 + '是' + nb2 + '說的名產。')]),
            G.q('第二天中午吃什麼？', '美食', fd[0], [L(fd[1], '新舊混淆', fd[1] + '原本是第一天晚餐，後來取消了。'), L(fd[2], '張冠李戴', fd[2] + '是第一天晚餐。'), L(g, '張冠李戴', g + '是伴手禮。')]),
            G.q('伴手禮要買什麼？', '名產', g, [L(g2, '似曾相識', g2 + '是' + nb2 + '說' + d2.n + '比較好吃的。')].concat(G.others(others(d.gifts, g), [], '差一點點', 2))),
            G.q('伴手禮要買幾盒？', '數字', cnCount(gn) + '盒', G.near(gn, function (x) { return cnCount(x) + '盒'; }, { lo: 1, hi: 8, swap: false })),
            G.q('其中一盒伴手禮要送誰？', '人物', nb, [L(nb2, '似曾相識', nb2 + '只是說了' + d2.n + '的名產。'), L(p, '張冠李戴', p + '是後來也要一起去的人。'), L(who, '張冠李戴', who + '是規劃行程的人。')]),
            G.q('誰後來也要一起去？', '人物', p, [L(nb, '張冠李戴', nb + '是要送伴手禮的人。'), L(nb2, '似曾相識', nb2 + '只是聊了幾句。'), L(who, '張冠李戴', who + '本來就要去。')]),
            G.q('為什麼第一天下午改行程？', '更正', '會下大雨', [L('人太多', '似曾相識', '人多是' + nb2 + '說的。'), L('怕塞車', '張冠李戴', '怕塞車是出發提早的原因。'), L('太熱了', '差一點點')], { must: true }),
            G.q('為什麼出發時間要改？', '更正', '怕塞車', [L('會下大雨', '張冠李戴', '大雨是下午改行程的原因。'), L('人太多', '似曾相識', '人多是' + nb2 + '說的。'), L('要趕入住', '差一點點')]),
            G.q('這次要去哪裡玩？', '地點', d.n, [L(d2.n, '似曾相識', d2.n + '只是' + nb2 + '提到的。'), L(S.d[2].n, '差一點點')].concat(G.others(others(names(P.trips), [d.n, d2.n, S.d[2].n]), [], '差一點點', 1))),
            G.q('誰在規劃這趟旅行？', '人物', who, [L(p, '張冠李戴', p + '是後來加入的。'), L(nb, '張冠李戴', nb + '是要送伴手禮的人。'), L(nb2, '似曾相識', nb2 + '只是聊了幾句。')]),
            G.dateQ('哪一天出發？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是規劃行程的那天。'), L(back.s, '張冠李戴', back.s + '是第三天，回程的日子。')], { must: true }),
            G.dateQ('第三天回程是幾月幾日？', back, [L(D.ev.s, '張冠李戴', D.ev.s + '是出發的日子。'), L(addDays(D.ev, 3).s, '計算失誤', '三天兩夜：' + D.ev.s + '出發，第三天是' + back.s + '。')]),
            G.wearQ('這趟旅行要帶哪一種衣服？', D.ev, [], { must: true })
        ];
        return { note: note, qs: finish(G, qs, 20) };
    }

    /* ═══ 第 7 關：一通揪團電話（集合時間、車廂、景點、人數、價錢，被一通電話大改）═══ */
    function T7(G, S) {
        var D = S.tl[S.i];
        var d = S.d[0];
        var d1 = S.d[1];
        var who = G.pick(P.friends);
        var np = G.pick(P.kin.concat(P.friends), null, [who]);
        var nb = people(G, null, [who, np]);
        var n = G.num(8, 14, null, null, 'n');
        var n2 = n + G.int(1, 2);
        var gate = G.pick(P.gates);
        var ms = G.pick(P.mornings, 2);
        var car = G.num(2, 9, null, null, 'car');
        var car2 = G.num(2, 9, [car], null, 'car2');
        var guide = G.pick(P.guides);
        var sp = G.shuffle(d.spots);
        var fa = G.any(d.foods);
        var g = G.any(d.gifts);
        var gpr = G.num(20, 40, null, null, 'gpr') * 10;
        var gpr2 = gpr + G.int(2, 6) * 10;
        var g1 = G.any(d1.gifts);
        var v = {
            who: who, np: np, nb: nb, d: d.n, d1: d1.n, n: cnNum(n), n2: cnNum(n2), gate: gate, mt: ms[0], mt2: ms[1], car: cnNum(car), car2: cnNum(car2),
            guide: guide, s1: sp[0].n, f1: sp[0].f, s2: sp[1].n, f2: sp[1].f, s3: sp[2].n, f3: sp[2].f, fa: fa, g: g, gpr: gpr, gpr2: gpr2, g1: g1,
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}。{who}揪團{ev}去{d}玩，一共{n}個人，你是負責記事情的人。', v),
            T('「大家{mt}在台北車站{gate}集合，搭火車去，我們坐第{car}車。」{who}說導遊是{guide}，會在下車的車站等大家。', v),
            T('「到了以後先去{s1}，那裡是{f1}。中午吃{fa}，下午去{s2}，那裡是{f2}。」', v),
            T('「回程前每個人自己買伴手禮，我推薦{g}，一盒 {gpr} 元。」', v),
            T('{nb}聽到了，說上次去{d}的時候遇到颱風，火車停駛，最後在車站睡了一晚。', v),
            T('{nb}還說{d1}的{g1}也很有名，可以順便看看，不過這次不會去{d1}。', v),
            T('{who}提醒大家要穿好走路的鞋子，因為第一個景點要走很多路，還要爬一段樓梯。', v),
            T('{nb}又說，火車上可以買便當，不過最好自己帶水，車上的水比較貴。', v),
            T('你把大家的名字寫在一張紙上，一共寫了滿滿一頁。', v),
            T('晚上，{who}又打電話來：「集合時間改成{mt2}，因為火車班次改了，我們改坐第{car2}車。」', v),
            T('「下午去{s2}的路那天封路，改去{s3}，那裡是{f3}。還有，{np}也要來，變成{n2}個人。伴手禮{g}漲價了，一盒變成 {gpr2} 元。」', v)
        ];
        var carF = function (x) { return '第' + cnNum(x) + '車'; };
        var nF = function (x) { return cnNum(x) + '個人'; };
        var same = G.any(['集合地點', '導遊是誰', '中午吃的']);
        var qs = [
            G.q('最後幾點集合？', '更正', ms[1], [L(ms[0], '新舊混淆', ms[0] + '是改之前的集合時間。')].concat(G.others(P.mornings, ms, '數字相近', 2)), { must: true }),
            G.q('一開始說幾點集合？', '一開始', ms[0], [L(ms[1], '新舊混淆', ms[1] + '是後來才改的。')].concat(G.others(P.mornings, ms, '數字相近', 2)), { old: true }),
            G.q('最後坐第幾車？', '更正', carF(car2), [L(carF(car), '新舊混淆', '第' + cnNum(car) + '車是改之前的。')].concat(G.near(car2, carF, { lo: 1, hi: 12, swap: false }))),
            G.q('一開始說坐第幾車？', '一開始', carF(car), [L(carF(car2), '新舊混淆', '第' + cnNum(car2) + '車是後來才改的。')].concat(G.near(car, carF, { lo: 1, hi: 12, swap: false })), { old: true }),
            G.q('在哪裡集合？', '地點', '台北車站' + gate, G.others(P.gates, gate).map(function (l) { return L('台北車站' + l.v, l.k); })),
            G.q('導遊是誰？', '人物', guide, G.others(P.guides, guide)),
            G.q('導遊會在哪裡等大家？', '地點', '下車的車站', [L('台北車站', '張冠李戴', '台北車站是集合的地方。'), L('第一個景點', '差一點點'), L('飯店大廳', '差一點點')]),
            G.q('到了以後先去哪裡？', '順序', sp[0].n, [L(sp[1].n, '順序顛倒', sp[1].n + '原本是下午，後來取消了。'), L(sp[2].n, '張冠李戴', sp[2].n + '是下午改去的。')]
                .concat(d1.spots.map(function (s) { return L(s.n, '差一點點'); }))),
            G.q('第一個景點有什麼特色？', '景點', sp[0].f, [L(sp[1].f, '張冠李戴', '那是' + sp[1].n + '。'), L(sp[2].f, '張冠李戴', '那是' + sp[2].n + '。')].concat(d1.spots.map(function (s) { return L(s.f, '差一點點', '那是' + s.n + '。'); }))),
            G.q('下午最後去哪裡？', '更正', sp[2].n, [L(sp[1].n, '新舊混淆', sp[1].n + '那天封路，取消了。'), L(sp[0].n, '順序顛倒', sp[0].n + '是第一個景點。')]
                .concat(d1.spots.map(function (s) { return L(s.n, '差一點點'); })), { must: true }),
            G.q('下午一開始說要去哪裡？', '一開始', sp[1].n, [L(sp[2].n, '新舊混淆', sp[2].n + '是後來才改的。'), L(sp[0].n, '順序顛倒', sp[0].n + '是第一個景點。')]
                .concat(d1.spots.map(function (s) { return L(s.n, '差一點點'); })), { old: true }),
            G.q('為什麼下午改行程？', '更正', '那天封路', [L('遇到颱風', '似曾相識', '颱風是' + nb + '上次遇到的。'), L('人太多', '差一點點'), L('會下大雨', '差一點點')]),
            G.q('下午新的景點有什麼特色？', '更正', sp[2].f, [L(sp[1].f, '新舊混淆', '那是取消的' + sp[1].n + '。'), L(sp[0].f, '張冠李戴', '那是' + sp[0].n + '。')].concat(d1.spots.map(function (s) { return L(s.f, '差一點點', '那是' + s.n + '。'); }))),
            G.q('中午吃什麼？', '美食', fa, [L(g, '張冠李戴', g + '是推薦的伴手禮。')].concat(G.others(others(d.foods, fa).concat(d1.foods), [], '差一點點', 2))),
            G.q('推薦的伴手禮是什麼？', '名產', g, [L(g1, '似曾相識', g1 + '是' + nb + '說的' + d1.n + '名產。')].concat(G.others(others(d.gifts, g), [], '差一點點', 2))),
            G.q('伴手禮最後一盒多少錢？', '更正', yuan(gpr2), [L(yuan(gpr), '新舊混淆', gpr + ' 元是漲價之前。')].concat(G.near(gpr2, yuan, { step: 10, swap: false }))),
            G.q('伴手禮一開始一盒多少錢？', '一開始', yuan(gpr), [L(yuan(gpr2), '新舊混淆', gpr2 + ' 元是漲價之後。')].concat(G.near(gpr, yuan, { step: 10, swap: false })), { old: true }),
            G.q('伴手禮要怎麼買？', '細節', '每個人自己買', [L('大家一起買', '差一點點'), L(who + '幫大家買', '張冠李戴', who + '只是推薦。'), L('導遊幫忙買', '差一點點')]),
            G.q('最後一共幾個人？', '更正', nF(n2), [L(nF(n), '新舊混淆', cnNum(n) + '個人是' + np + '加入之前。')].concat(G.near(n2, nF, { lo: 2, hi: 20, swap: false }))),
            G.q('誰後來也要來？', '人物', np, [L(nb, '似曾相識', nb + '只是聊了颱風的事。'), L(who, '張冠李戴', who + '是揪團的人。'), L(guide, '張冠李戴', guide + '是導遊。')]),
            G.q('揪團的是誰？', '人物', who, [L(nb, '似曾相識', nb + '只是聊了颱風的事。'), L(np, '張冠李戴', np + '是後來加入的。'), L(guide, '張冠李戴', guide + '是導遊。')]),
            G.q('為什麼集合時間改了？', '更正', '火車班次改了', [L('遇到颱風', '似曾相識', '颱風是' + nb + '上次遇到的。'), L('怕塞車', '差一點點'), L('導遊遲到', '差一點點')]),
            G.q('這次怎麼去？', '交通', '搭火車', [L('坐遊覽車', '差一點點'), L('自己開車', '差一點點'), L('搭飛機', '差一點點')]),
            G.q('電話裡「沒有」改到的是？', '更正', same, ['集合時間', '坐第幾車', '下午的景點', '人數', '伴手禮價錢'].map(function (c) { return L(c, '新舊混淆', '「' + c + '」在電話裡改掉了。'); })),
            G.q('這次要去哪裡玩？', '地點', d.n, [L(d1.n, '似曾相識', d1.n + '只是' + nb + '提到的。'), L(S.d[2].n, '差一點點')].concat(G.others(others(names(P.trips), [d.n, d1.n, S.d[2].n]), [], '差一點點', 1))),
            G.dateQ('揪團哪一天出發？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是' + who + '揪團的那天。')], { must: true }),
            G.weekQ('出發那天是星期幾？', D.ev, [L(D.today.w, '張冠李戴', D.today.w + '是揪團的那天。')]),
            G.wearQ('這次出去玩要帶哪一種衣服？', D.ev, [], { must: true })
        ];
        return { note: note, qs: finish(G, qs, 24, 4) };
    }

    /* ═══ 第 8 關：兩天一夜（交通、景點、時間、住宿與預算、伴手禮、暈車、天氣改行程，全部混合）═══ */
    function T8(G, S) {
        var D = S.tl[S.i];
        var back = addDays(D.ev, 1);
        var d = S.d[2];
        var d0 = S.d[0];
        var who = G.pick(P.home);
        var p = G.pick(P.kin, null, [who]);
        var nbs = people(G, 2);
        var nb = nbs[0];
        var nb2 = nbs[1];
        var n = G.num(3, 6, null, null, 'n');
        var trs = G.pick(P.transports, 2);
        var t1 = G.pick(P.mornings);
        var sp = G.shuffle(d.spots);
        var st = G.pick(['十點', '十一點', '十二點']);
        var fa = G.any(d.foods);
        var stay = G.pick(P.stayNames) + G.pick(P.stays);
        var room = G.num(18, 26, null, null, 'room') * 100;
        var r = G.num(2, 3, null, null, 'r');
        var inc = G.int(2, 4) * 100;
        var cap = room * r + inc * r - 100;
        var room2 = room + inc;
        var gs = G.shuffle(d.gifts);
        var gn1 = G.num(1, 4, null, null, 'gn1');
        var gn2 = G.num(1, 4, [gn1], null, 'gn2');
        var g0 = G.any(d0.gifts);
        var v = {
            who: who, p: p, nb: nb, nb2: nb2, d: d.n, d0: d0.n, n: cnCount(n), tr1: trs[0], tr2: trs[1], t1: t1, st: st,
            s1: sp[0].n, f1: sp[0].f, s2: sp[1].n, f2: sp[1].f, s3: sp[2].n, f3: sp[2].f, fa: fa, stay: stay, room: room, room2: room2, r: cnCount(r), cap: cap,
            g1: gs[0], g2: gs[1], g3: gs[2], gn1: cnCount(gn1), gn2: cnCount(gn2), g0: g0,
            today: D.today.sw, ev: D.ev.sw
        };
        var note = [
            T('今天是{today}。{ev}換你帶{who}和{p}他們去{d}玩兩天一夜，一共{n}個人。', v),
            T('去程搭{tr1}，早上{t1}出發；到了先去{s1}，那裡是{f1}，要在{st}前到，因為門票只賣到那個時候。', v),
            T('中午吃{fa}，下午去{s2}，那裡是{f2}。晚上住{stay}，一間房 {room} 元，訂了{r}間。', v),
            T('第二天早上去{s3}，那裡是{f3}。然後買伴手禮：{who}要{gn1}盒{g1}，{p}要{gn2}盒{g2}，{nb}拜託你帶{g3}。', v),
            T('你想起上次和{nb2}去{d0}的時候，也買了{g0}，結果放在車上忘了拿，最後被{nb2}吃掉了。', v),
            T('出發前一天，{p}說自己會暈車，要你記得買暈車藥，上車前半小時吃一顆。', v),
            T('{p}還說，想在{d}拍很多照片，要你記得把相機的電池充飽。', v),
            T('你想起{who}上次出門忘了帶健保卡，結果在外地看醫生很麻煩，這次一定要提醒。', v),
            T('住的地方老闆說，晚上十點以後大門會鎖起來，要早一點回去。', v),
            T('結果出發當天早上，{who}說：「氣象說第二天會下大雨，{s3}改到第一天下午去，{s2}不去了。」', v),
            T('「還有，住的地方打來說房價漲了，一間變成 {room2} 元。{nb}的{g3}也不用買了，{nb}上個月自己買過了。」', v),
            T('「回程改搭{tr2}，比較快。住宿費最多花 {cap} 元，超過就要改訂便宜一點的房間。」', v)
        ];
        var room$ = function (x) { return cnCount(x) + '間'; };
        var box = function (x) { return cnCount(x) + '盒'; };
        var tr = P.transports;
        var qs = [
            G.q('這次去哪裡玩？', '地點', d.n, [L(d0.n, '似曾相識', d0.n + '是上次和' + nb2 + '去的。'), L(S.d[1].n, '差一點點')].concat(G.others(others(names(P.trips), [d.n, d0.n, S.d[1].n]), [], '差一點點', 1))),
            G.q('一共幾個人去？', '數字', ppl(n), G.near(n, ppl, { lo: 2, hi: 9, swap: false })),
            G.q('去程搭什麼？', '交通', trs[0], [L(trs[1], '張冠李戴', trs[1] + '是回程改搭的。')].concat(G.others(others(tr, trs), [], '差一點點', 2))),
            G.q('回程最後搭什麼？', '更正', trs[1], [L(trs[0], '張冠李戴', trs[0] + '是去程。')].concat(G.others(others(tr, trs), [], '差一點點', 2))),
            G.q('早上幾點出發？', '時間', t1, G.others(P.mornings, t1, '數字相近')),
            G.q('第一個景點是哪裡？', '順序', sp[0].n, [L(sp[2].n, '順序顛倒', sp[2].n + '是改到第一天下午的。'), L(sp[1].n, '新舊混淆', sp[1].n + '後來不去了。')].concat(d0.spots.map(function (s) { return L(s.n, '差一點點'); }))),
            G.q('第一個景點有什麼特色？', '景點', sp[0].f, [L(sp[1].f, '張冠李戴', '那是' + sp[1].n + '。'), L(sp[2].f, '張冠李戴', '那是' + sp[2].n + '。')].concat(d0.spots.map(function (s) { return L(s.f, '差一點點', '那是' + s.n + '。'); }))),
            G.q('第一個景點要在幾點前到？', '時間', st, others(['九點', '十點', '十一點', '十二點', '一點'], st).map(function (x) { return L(x, '數字相近'); })),
            G.q('為什麼要趕在那之前到？', '細節', '門票只賣到那時', [L('怕下大雨', '張冠李戴', '大雨是改行程的原因。'), L('怕人太多', '差一點點'), L('要趕去吃午餐', '差一點點')]),
            G.q('中午吃什麼？', '美食', fa, [L(g0, '似曾相識', g0 + '是上次在' + d0.n + '買的。')].concat(G.others(others(d.foods, fa).concat(d0.foods), [], '差一點點', 2))),
            G.q('第一天下午最後去哪裡？', '更正', sp[2].n, [L(sp[1].n, '新舊混淆', sp[1].n + '後來不去了。'), L(sp[0].n, '順序顛倒', sp[0].n + '是早上。')].concat(d0.spots.map(function (s) { return L(s.n, '差一點點'); })), { must: true }),
            G.q('第一天下午一開始要去哪裡？', '一開始', sp[1].n, [L(sp[2].n, '新舊混淆', sp[2].n + '是後來才改的。'), L(sp[0].n, '順序顛倒', sp[0].n + '是早上。')].concat(d0.spots.map(function (s) { return L(s.n, '差一點點'); })), { old: true }),
            G.q('改到第一天下午的景點，要看什麼？', '更正', sp[2].f, [L(sp[1].f, '新舊混淆', '那是取消的' + sp[1].n + '。'), L(sp[0].f, '張冠李戴', '那是' + sp[0].n + '。')].concat(d0.spots.map(function (s) { return L(s.f, '差一點點', '那是' + s.n + '。'); }))),
            G.q('為什麼改行程？', '更正', '第二天會下大雨', [L('房價漲了', '張冠李戴', '房價漲了是另一件事。'), L('景點封路', '差一點點'), L('怕塞車', '差一點點')]),
            G.q('晚上住哪裡？', '住宿', stay, G.others(P.stayNames, stay.slice(0, 2), '差一點點', 2).map(function (l) { return L(l.v + stay.slice(2), l.k); })
                .concat(G.others(P.stays, stay.slice(2), '差一點點', 2).map(function (l) { return L(stay.slice(0, 2) + l.v, l.k); }))),
            G.q('訂了幾間房？', '數字', room$(r), G.near(r, room$, { lo: 1, hi: 6, swap: false })),
            G.q('房價最後一間多少錢？', '更正', yuan(room2), [L(yuan(room), '新舊混淆', room + ' 元是漲價之前。')].concat(G.near(room2, yuan, { step: 100, swap: false })), { must: true }),
            G.q('房價一開始一間多少錢？', '一開始', yuan(room), [L(yuan(room2), '新舊混淆', room2 + ' 元是漲價之後。')].concat(G.near(room, yuan, { step: 100, swap: false })), { old: true }),
            G.q('住宿費最後一共多少錢？', '計算', yuan(room2 * r), [L(yuan(room * r), '新舊混淆', '這是漲價之前的總數。'), L(yuan(room2), '計算失誤', '要乘上' + cnCount(r) + '間。'),
                L(yuan(room2 * r + 100), '計算失誤'), L(yuan(room2 * r - 100), '計算失誤')], { must: true }),
            G.q('要不要改訂便宜一點的房間？', '計算', '要，超過了', [L('不用，沒超過', '新舊混淆', '漲價後一共 ' + room2 * r + ' 元，超過 ' + cap + ' 元。'), L('改住別的地方', '差一點點'), L('少住一晚', '差一點點')], { must: true }),
            G.q('住宿費最多能花多少？', '數字', yuan(cap), [L(yuan(room2 * r), '計算失誤', '那是漲價後的住宿費。')].concat(G.near(cap, yuan, { step: 100, swap: false }))),
            G.q(who + '要什麼伴手禮？', '名產', gs[0], [L(gs[1], '張冠李戴', gs[1] + '是' + p + '要的。'), L(gs[2], '張冠李戴', gs[2] + '是' + nb + '原本拜託的。'), L(g0, '似曾相識', g0 + '是上次買的。')]),
            G.q(p + '要什麼伴手禮？', '名產', gs[1], [L(gs[0], '張冠李戴', gs[0] + '是' + who + '要的。'), L(gs[2], '張冠李戴', gs[2] + '是' + nb + '原本拜託的。'), L(g0, '似曾相識', g0 + '是上次買的。')]),
            G.q(who + '的伴手禮要買幾盒？', '數字', box(gn1), [L(box(gn2), '張冠李戴', cnCount(gn2) + '盒是' + p + '的。')].concat(G.near(gn1, box, { lo: 1, hi: 6, swap: false }))),
            G.q(p + '的伴手禮要買幾盒？', '數字', box(gn2), [L(box(gn1), '張冠李戴', cnCount(gn1) + '盒是' + who + '的。')].concat(G.near(gn2, box, { lo: 1, hi: 6, swap: false }))),
            G.q(nb + '的伴手禮後來怎麼了？', '更正', '不用買了', [L('改買' + gs[0], '張冠李戴', gs[0] + '是' + who + '要的。'), L('要買兩盒', '差一點點'), L('改成' + g0, '似曾相識', g0 + '是上次買的。')]),
            G.q(nb + '一開始拜託你帶什麼？', '一開始', gs[2], [L(gs[0], '張冠李戴', gs[0] + '是' + who + '要的。'), L(gs[1], '張冠李戴', gs[1] + '是' + p + '要的。'), L(g0, '似曾相識', g0 + '是上次買的。')], { old: true }),
            G.q('誰會暈車？', '人物', p, [L(who, '張冠李戴'), L(nb, '差一點點'), L(nb2, '似曾相識', nb2 + '是上次一起去' + d0.n + '的人。')]),
            G.q('暈車藥什麼時候吃？', '順序', '上車前半小時', [L('上車以後', '順序顛倒', '要上車前先吃。'), L('吃完午餐', '差一點點'), L('上車前一小時', '數字相近')]),
            G.q('暈車藥一次吃幾顆？', '數字', '一顆', [L('兩顆', '數字相近'), L('半顆', '數字相近'), L('三顆', '數字相近')]),
            G.q('回程為什麼改交通工具？', '更正', '比較快', [L('比較便宜', '差一點點'), L('怕暈車', '張冠李戴', '暈車是要吃藥的原因。'), L('會下大雨', '張冠李戴', '大雨是改景點的原因。')]),
            G.q('誰說要改行程？', '人物', who, [L(p, '張冠李戴'), L(nb, '差一點點'), L(nb2, '似曾相識', nb2 + '是上次一起去' + d0.n + '的人。')]),
            G.dateQ('哪一天出發？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。'), L(back.s, '張冠李戴', back.s + '是第二天，回程的日子。')], { must: true }),
            G.dateQ('哪一天回來？', back, [L(D.ev.s, '張冠李戴', D.ev.s + '是出發的日子。')]),
            G.weekQ('出發那天是星期幾？', D.ev),
            G.wearQ('這趟要帶哪一種衣服？', D.ev, [], { must: true })
        ];
        return { note: note, qs: finish(G, qs, 32, 6) };
    }

    Q.addTheme({
        id: 'travel', name: '旅遊',
        names: ['出發前一天', '旅行的準備', '行前三件事', '行李怎麼帶', '兩家人的旅行', '改了行程', '一通揪團電話', '兩天一夜'],
        setup: function (G) { return { d: G.pick(P.trips, 3), tl: travelTimeline(G) }; },
        X: {
            errands1: P.travelErrands1,
            head1: function (G, S, D) {
                var p = G.pick(P.kin);
                return {
                    line: '今天是' + D.today.sw + '晚上八點。' + D.ev.sw + '要和' + p + '去' + S.d[0].n + '玩，出發前要先辦一件事：',
                    qs: [
                        G.dateQ('哪一天出發？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
                        G.wearQ('這趟要帶哪一種衣服？', D.ev),
                        G.q('要和誰一起去玩？', '人物', p, G.others(P.kin, p, '差一點點'))
                    ]
                };
            },
            ctx2: function (G, S, D, who) {
                return {
                    when: D.today.sw + '下午三點',
                    ctx: '我' + D.ev.sw + '要去' + S.d[1].n + '玩',
                    qs: [
                        G.dateQ(who + '哪一天要去玩？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是打電話來的那天。')], { must: true }),
                        G.wearQ(who + '要帶哪一種衣服？', D.ev)
                    ]
                };
            },
            shops: P.travelShops,
            head3: function (G, S, D) {
                var p = G.pick(P.kin);
                return {
                    line: '今天是' + D.today.sw + '早上十點。' + D.ev.s + '就要和' + p + '出發去' + S.d[2].n + '了，還有幾件事要先辦好。',
                    qs: [
                        G.dateQ('哪一天出發？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
                        G.daysQ('今天離出發還有幾天？', D.today, D.ev),
                        G.wearQ('這趟要帶哪一種衣服？', D.ev)
                    ]
                };
            },
            errands3: P.travelErrands3,
            head4: function (G, S, D, v) {
                return {
                    line: T('今天是{t}晚上七點。{who}說{d}要去{dest}玩，拜託你下班去{street}的{shop}，買幾樣出門要帶的東西。',
                        { t: D.today.sw, d: D.ev.s, who: v.who, dest: S.d[1].n, street: v.street, shop: v.shop }),
                    qs: [
                        G.dateQ('哪一天出發去玩？', D.ev, [L(D.today.s, '張冠李戴', D.today.s + '是今天。')], { must: true }),
                        G.wearQ('這趟要帶哪一種衣服？', D.ev, [], { must: true })
                    ]
                };
            },
            things4: P.travelThings4
        },
        levels: [lib.L1, lib.L2, lib.L3, lib.L4, T5, T6, T7, T8]
    });
})();
