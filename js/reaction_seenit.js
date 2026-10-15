/* ═══════════════════════════════════════════════════════════════════
   reaction_seenit.js — 秒反應・這個看過嗎
   一關一個圖案（水果、蔬菜、點心的 emoji＋中文名稱），判斷它是「新的」還是「在前面的關卡出現過了」。
   每一關陸續出現新圖案，中間夾雜著已經看過的圖案。關卡制：答錯或逾時就結束（沒有「命」），成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見）改版：
       - 不再先出現幾個圖案讓你記住：第 1 關的圖案出現時，「看過」按鈕先無法使用（只能按「新的」），從第 2 關起才考你有沒有看過；
       - 圖案改成 59 種食物 emoji（ITEMS）加上中文名稱；
       - 一次答錯就失敗，刪除三條「命」；
       - 每一關的限時多 1 秒：第 N 關 ＝ TIME0_S ＋ (N − 1) × TIME_STEP_S 秒（要記的圖案越來越多）。
   · 每一關：有 P_OLD（50%）的機率是「看過」（從前面關卡出現過的圖案裡隨機挑，同一圖案最多出現 MAX_REPEAT 次），
     其餘是「新的」（還沒出現過的圖案）；新圖案用完了就一定是「看過」。同一種答案最多連續 SAME_MAX 關。
   · 答錯時並排顯示「現在這個」與它出現過的那一關。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'seenit';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '通過關數', min: 1, max: 120 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var MAX_LEVEL = 60;                         /* 最後一關（全破） */
    var TIME0_S = 3;                            /* 第 1 關的限時（秒） */
    var TIME_STEP_S = 1;                        /* 每多一關，限時多幾秒 */
    var P_OLD = 0.5;                            /* 一關是「看過」的機率 */
    var MAX_REPEAT = 3;                         /* 同一個圖案最多出現幾次 */
    var SAME_MAX = 3;                           /* 答案（看過／新的）最多連續幾關一樣 */
    /* 圖案：[emoji 的 Unicode 碼位, 中文名稱]（用碼位寫，避免檔案編碼讓 emoji 變形） */
    var ITEMS = [
        [0x1F95D, '奇異果'], [0x1F965, '椰子'], [0x1F347, '葡萄'], [0x1F348, '哈密瓜'], [0x1F349, '西瓜'], [0x1F34A, '橘子'], [0x1F34B, '檸檬'],
        [0x1F34C, '香蕉'], [0x1F34D, '鳳梨'], [0x1F96D, '芒果'], [0x1F34E, '蘋果'], [0x1F34F, '青蘋果'], [0x1F350, '梨子'], [0x1F351, '桃子'],
        [0x1F352, '櫻桃'], [0x1F353, '草莓'], [0x1F345, '番茄'], [0x1F346, '茄子'], [0x1F33D, '玉米'], [0x1F336, '辣椒'], [0x1F344, '香菇'],
        [0x1F951, '酪梨'], [0x1F952, '小黃瓜'], [0x1F96C, '青菜'], [0x1F966, '花椰菜'], [0x1F954, '馬鈴薯'], [0x1F9C4, '大蒜'], [0x1F9C5, '洋蔥'],
        [0x1F955, '紅蘿蔔'], [0x1F330, '栗子'], [0x1F355, '披薩'], [0x1F354, '漢堡'], [0x1F35F, '薯條'], [0x1F32D, '熱狗'], [0x1F37F, '爆米花'],
        [0x1F950, '可頌'], [0x1F968, '蝴蝶脆餅'], [0x1F9C0, '起司'], [0x1F356, '肉塊'], [0x1F357, '雞腿'], [0x1F969, '牛排'], [0x1F358, '米果'],
        [0x1F359, '飯糰'], [0x1F35C, '拉麵'], [0x1F363, '壽司'], [0x1F364, '炸蝦'], [0x1F963, '麥片'], [0x1F366, '霜淇淋'], [0x1F367, '剉冰'],
        [0x1F369, '甜甜圈'], [0x1F370, '蛋糕'], [0x1F36C, '糖果'], [0x1F36D, '棒棒糖'], [0x1F361, '丸子'], [0x1F36E, '布丁'], [0x1F377, '紅酒'],
        [0x1F378, '雞尾酒'], [0x1F379, '熱帶飲料'], [0x1F37A, '啤酒']
    ];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function itemCount() { return ITEMS.length; }
    function emojiOf(id) { return String.fromCodePoint(ITEMS[id][0]); }
    function nameOf(id) { return ITEMS[id][1]; }
    /* 第 level 關的限時（毫秒）：每多一關多 TIME_STEP_S 秒 */
    function timeMs(level) { return Math.round((TIME0_S + (level - 1) * TIME_STEP_S) * 1000); }
    /* 下一關：hist 是目前為止每一關出現的圖案（依序）。回傳 { item, kind: 'new'|'old', seenAt（看過：上次出現的關，從 1 起算；新的：0）, level } */
    function nextTrial(hist, rand, kinds) {
        rand = rand || Math.random;
        var idx = hist.length, seen = {}, i;
        hist.forEach(function (it, k) { seen[it] = { last: k, n: (seen[it] ? seen[it].n : 0) + 1 }; });
        var fresh = [], olds = [];
        for (i = 0; i < ITEMS.length; i++) {
            if (!seen[i]) fresh.push(i);
            else if (seen[i].n < MAX_REPEAT) olds.push(i);
        }
        if (!olds.length && !fresh.length) for (i = 0; i < ITEMS.length; i++) olds.push(i);          /* 極端情況：全部都滿 3 次了，放寬 */
        var kind;
        if (idx === 0 || !olds.length) kind = 'new';                          /* 第 1 關一定是新的 */
        else if (!fresh.length) kind = 'old';                                  /* 新圖案用完了 */
        else {
            kind = rand() < P_OLD ? 'old' : 'new';
            var k = (kinds || []).length;
            if (k >= SAME_MAX) {                                               /* 同一種答案不能連續太多關 */
                var last = kinds[k - 1], same = true;
                for (var j = 1; j <= SAME_MAX; j++) if (kinds[k - j] !== last) { same = false; break; }
                if (same) kind = last === 'old' ? 'new' : 'old';
            }
        }
        if (kind === 'old') { var o = kit.pick(olds, rand); return { item: o, kind: 'old', seenAt: seen[o].last + 1, level: idx + 1 }; }
        return { item: kit.pick(fresh, rand), kind: 'new', seenAt: 0, level: idx + 1 };
    }
    function rating(n) {
        if (n >= 40) return '過目不忘！';
        if (n >= 25) return '高手！';
        if (n >= 14) return '不錯喔！';
        if (n >= 6) return '再接再厲！';
        return '多留意前面出現過什麼，再來一次！';
    }

    function mount(root, ctx) {
        /* V1.28 起這個看過嗎改版（不再有暖身、沒有命、emoji 圖案、每關限時 +1 秒），舊版的最佳紀錄不能比：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v128');
        var hist = [], kinds = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 8, resume: false,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: function (api) { if (api.level === 1) { hist.length = 0; kinds.length = 0; } setup(api, hist, kinds); }
        });
    }

    function setup(api, hist, kinds) {
        var stage = api.stage, level = api.level;
        var tr = nextTrial(hist, api.rand, kinds);
        hist.push(tr.item); kinds.push(tr.kind);
        api.info = tr;
        console.log('[這個看過嗎] 第 ' + level + ' 關：' + nameOf(tr.item) + '（' + (tr.kind === 'old' ? '看過，上次在第 ' + tr.seenAt + ' 關' : '新的') + '）；限時 ' + timeMs(level) + ' ms');

        var pic = h('div', { 'class': 'si-pic', text: emojiOf(tr.item) });
        var name = h('div', { 'class': 'si-name', text: nameOf(tr.item) });
        var info = h('div', { 'class': 'si-info', text: level === 1 ? '第一個圖案，一定是新的' : '這個圖案在前面的關卡出現過嗎？' });
        stage.appendChild(pic); stage.appendChild(name); stage.appendChild(info);
        var bOld = h('button', { 'class': 'btn btn--go', text: '看過' });
        var bNew = h('button', { 'class': 'btn btn--primary', text: '新的' });
        if (level === 1) bOld.disabled = true;                                 /* 第 1 關還沒有看過的圖案，只能按「新的」 */
        stage.appendChild(h('div', { 'class': 'rx-btnrow' }, [bNew, bOld]));
        api.timer(timeMs(level), function () { judge(null); });
        if (level === 1 && kit.once('seenit.hint')) kit.hintOn(stage, bNew, { mode: 'tap', delay: 500, text: '第一個圖案一定是新的' });

        function judge(sayOld) {
            if (api.over) return;
            if (sayOld === true && level === 1) return;                          /* 第 1 關的「看過」按鈕無法使用 */
            bOld.disabled = bNew.disabled = true;
            var isOld = tr.kind === 'old';
            if (sayOld === isOld) { pic.classList.add('si-pic--ok'); api.pass({ delay: 300 }); return; }
            pic.classList.add('si-pic--bad');
            var why = sayOld == null ? '時間到！' : (isOld ? '這個圖案之前出現過' : '這是新的圖案');
            info.textContent = why + (isOld ? '（第 ' + tr.seenAt + ' 關）' : '');
            api.fail({ delay: 1800, lines: [why + '：' + emojiOf(tr.item) + ' ' + nameOf(tr.item), isOld ? '它上次出現在第 ' + tr.seenAt + ' 關' : '前面的關卡沒有出現過它'] });
        }
        kit.onTap(bOld, function () { judge(true); });
        kit.onTap(bNew, function () { judge(false); });
        api.solve = function () { judge(tr.kind === 'old'); };
        api.wrong = function () { judge(level === 1 ? null : tr.kind !== 'old'); };
    }

    var G = {
        id: ID,
        name: '這個看過嗎',
        rule: '每一關出現一個食物圖案和名稱。**判斷它是「新的」，還是前面的關卡「看過」了**。新圖案和看過的圖案會混在一起出現。**第 1 關一定是新的**，只能按「新的」，從第 2 關起才考你看過沒有。**答錯或來不及就結束**，每一關的限時比上一關多 1 秒，看你能撐到第幾關。',
        mount: mount,
        score: SCORE,
        test: { itemCount: itemCount, emojiOf: emojiOf, nameOf: nameOf, timeMs: timeMs, nextTrial: nextTrial, rating: rating, ITEMS: ITEMS, MAX_REPEAT: MAX_REPEAT, SAME_MAX: SAME_MAX, MAX_LEVEL: MAX_LEVEL, P_OLD: P_OLD, TIME0_S: TIME0_S, TIME_STEP_S: TIME_STEP_S }
    };
    Reaction.register(G);
})();
