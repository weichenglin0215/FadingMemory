/* ═══════════════════════════════════════════════════════════════════
   reaction_halfchar.js — 秒反應・半邊字
   畫面上的字被遮住了一半，從下面四個字裡選出最可能的那一個。
   ───────────────────────────────────────────────────────────────────
   · 題庫 ENTRIES 是**手工審校**的，不做自動產生：每題 { a:答案, side:差異部件在哪一側, d:[3 個干擾字] }。
     side 指的是「答案跟干擾字不一樣的那個部件」在字的哪一側（left／top 取拆解的第 0 個部件，right／bottom 取第 1 個）。
   · 遮法（重點）：**遮住差異處、露出相似處**。四個選項都有的那個部件（相似處，例：湖、河、海、油的「氵」）完整露出，
     差異部件（例：胡、可、每、由）大部分遮住，只從貼著相似處的那一側露出一小段（SLIVER，占差異部件的比例）。
     所以光看露出的部分，四個字都像，要靠露出的那一小段筆畫去分辨；越後面露出的那一小段越少。
   · 題庫規則（checkData 逐題驗證）：3 個干擾字的拆解都含有那個相似部件，而且都不含答案的差異部件。
   · 遮字用 CSS clip-path: inset()，不改字型。每個字有一條「兩個部件的分界線」b（占字寬或字高的比例，
     預設依第一個部件查 BOUNDS 表，也可以在題庫裡寫 b 覆蓋）。
   · 難度（玩家說「幾乎沒有難度」，所以從四個方向一起加難，全部隨題號線性變難，第 LEVEL_RAMP 題到頂）：
        ① 露出的線索變少：差異部件露出的比例 SLIVER_START（40％）→ SLIVER_END（12％）；
        ② 時間變短：每題限時 TIME_START（6 秒）→ TIME_END（2.5 秒）；
        ③ 選項變多：4 個 → 6 個（OPT_START → OPT_END，第 OPT_RAMP 題起 6 個）。多出來的干擾字不用手工寫：
           從拆字表 DECOMP 裡自動找「結構相同（左右／上下）、相似部件同一個位置、差異部件不一樣」的字（extraPool）；
        ④ 字會歪斜：第 ROT_FROM 題之後，大字會隨機往左或往右歪（0° → ROT_MAX 24°），要先在腦中「轉正」再比對。
   · 有 LIVES 次機會，成績＝答對題數（越多越好）。答完把整個字亮出來並說明「相似的是 X，關鍵是 Y」。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'halfchar';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 halfchar 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '答對題數', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 20;
    /* SLIVER：差異部件露出的比例，第 1 題露 40%，越後面越少（到 12%）——原本是 55% → 25%，玩家覺得幾乎沒有難度 */
    var SLIVER_START = 0.40, SLIVER_END = 0.12; /* 差異部件從貼著相似處的那一側露出幾成（第 1 題最多，越後面越少）*/
    var TIME_START = 6, TIME_END = 2.5;          /* 每題限時（秒），原本 8 → 3.5 */
    /* 選項數：第 1 題 4 個，線性增加到第 OPT_RAMP 題起 6 個（四捨五入：第 4 題起 5 個、第 10 題起 6 個） */
    var OPT_START = 4, OPT_END = 6, OPT_RAMP = 12;
    /* 字歪斜的角度：第 ROT_FROM 題以前不歪，之後線性增加到第 LEVEL_RAMP 題的 ROT_MAX 度（方向隨機左或右） */
    var ROT_FROM = 6, ROT_MAX = 24;
    var LIVES = 3;
    var NEXT_MS = 1300;
    /* 最近出過的 10 題不會再出現 */
    var AVOID_RECENT = 10;                      /* 最近出過的幾題不重複 */

    /* 拆字表：每個字拆成兩個部件 [第一個, 第二個]。左右結構是 [左, 右]；上下結構是 [上, 下] */
    /* 拆字表：[第一個部件, 第二個部件]；左右結構＝[左, 右]，上下結構＝[上, 下] */
    var DECOMP = {
        '湖': ['氵', '胡'], '河': ['氵', '可'], '海': ['氵', '每'], '油': ['氵', '由'], '清': ['氵', '青'], '洗': ['氵', '先'], '港': ['氵', '巷'], '流': ['氵', '㐬'], '泡': ['氵', '包'], '汀': ['氵', '丁'],
        '請': ['言', '青'], '說': ['言', '兌'], '話': ['言', '舌'], '語': ['言', '吾'], '訂': ['言', '丁'], '詩': ['言', '寺'], '該': ['言', '亥'],
        '情': ['忄', '青'], '快': ['忄', '夬'], '怕': ['忄', '白'], '慢': ['忄', '曼'], '悔': ['忄', '每'],
        '晴': ['日', '青'], '明': ['日', '月'], '昨': ['日', '乍'], '時': ['日', '寺'],
        '媽': ['女', '馬'], '姐': ['女', '且'], '妹': ['女', '未'], '好': ['女', '子'], '嗎': ['口', '馬'], '碼': ['石', '馬'], '螞': ['虫', '馬'],
        '銀': ['金', '艮'], '鐘': ['金', '童'], '銅': ['金', '同'], '針': ['金', '十'], '很': ['彳', '艮'], '眼': ['目', '艮'], '根': ['木', '艮'],
        '持': ['扌', '寺'], '待': ['彳', '寺'],
        '飯': ['食', '反'], '餓': ['食', '我'], '餃': ['食', '交'], '飽': ['食', '包'], '版': ['片', '反'], '坂': ['土', '反'], '板': ['木', '反'],
        '糖': ['米', '唐'], '粉': ['米', '分'], '精': ['米', '青'], '糕': ['米', '羔'],
        '打': ['扌', '丁'], '找': ['扌', '戈'], '拍': ['扌', '白'], '抱': ['扌', '包'], '町': ['田', '丁'],
        '跑': ['足', '包'], '跳': ['足', '兆'], '路': ['足', '各'], '跟': ['足', '艮'],
        '吃': ['口', '乞'], '喝': ['口', '曷'], '叫': ['口', '丩'], '吸': ['口', '及'], '咬': ['口', '交'], '咳': ['口', '亥'],
        '校': ['木', '交'], '樹': ['木', '尌'], '林': ['木', '木'], '桌': ['卓', '木'], '較': ['車', '交'], '狡': ['犭', '交'], '核': ['木', '亥'], '梅': ['木', '每'],
        '你': ['亻', '尔'], '他': ['亻', '也'], '住': ['亻', '主'], '做': ['亻', '故'], '侮': ['亻', '每'],
        '孩': ['子', '亥'], '孫': ['子', '系'], '孔': ['子', '乚'], '孤': ['子', '瓜'],
        '糊': ['米', '胡'], '蝴': ['虫', '胡'], '瑚': ['王', '胡'],
        '草': ['艹', '早'], '花': ['艹', '化'], '苦': ['艹', '古'], '英': ['艹', '央'],
        '家': ['宀', '豕'], '字': ['宀', '子'], '守': ['宀', '寸'], '宅': ['宀', '乇'],
        '想': ['相', '心'], '思': ['田', '心'], '念': ['今', '心'], '息': ['自', '心'],
        '雲': ['雨', '云'], '雪': ['雨', '彐'], '電': ['雨', '电'], '霜': ['雨', '相']
    };
    /* 只當「選項裡的干擾字」用的字（不會當答案，所以不用 BOUNDS）：格式跟上面的 DECOMP 一樣，用來讓選項增加到 6 個。
       每個字都是「相似部件同一個位置、差異部件不同」的同結構字：左右結構的左右兩個部件、上下結構的上下兩個部件（上下結構的字列在 TB 裡）。 */
    var EXTRA = {
        '鬍': ['髟', '胡'], '猢': ['犭', '胡'], '睛': ['目', '青'], '靖': ['立', '青'], '蜻': ['虫', '青'], '罵': ['罒', '馬'], '瑪': ['王', '馬'],
        '痕': ['疒', '艮'], '恨': ['忄', '艮'], '狠': ['犭', '艮'], '限': ['阝', '艮'], '特': ['牛', '寺'], '侍': ['亻', '寺'], '恃': ['忄', '寺'],
        '扳': ['扌', '反'], '販': ['貝', '反'], '炮': ['火', '包'], '袍': ['衤', '包'], '咆': ['口', '包'], '郊': ['阝', '交'], '絞': ['糸', '交'], '鉸': ['金', '交'],
        '駭': ['馬', '亥'], '骸': ['骨', '亥'], '誨': ['言', '每'], '晦': ['日', '每'], '盯': ['目', '丁'], '釘': ['金', '丁'], '叮': ['口', '丁'],
        '暗': ['日', '音'], '晚': ['日', '免'], '她': ['女', '也'], '姓': ['女', '生'], '錢': ['金', '戔'], '鋼': ['金', '岡'], '館': ['食', '官'], '餅': ['食', '并'],
        '糧': ['米', '量'], '踢': ['足', '易'], '踩': ['足', '采'], '位': ['亻', '立'], '作': ['亻', '乍'], '們': ['亻', '門'], '孟': ['子', '皿'], '孜': ['子', '攵'],
        '菜': ['艹', '采'], '茶': ['艹', '余'], '荷': ['艹', '何'], '若': ['艹', '右'], '芳': ['艹', '方'],
        '安': ['宀', '女'], '完': ['宀', '元'], '定': ['宀', '疋'], '室': ['宀', '至'], '宇': ['宀', '于'],
        '恩': ['因', '心'], '怒': ['奴', '心'], '意': ['音', '心'], '忍': ['刃', '心'], '感': ['咸', '心'],
        '雷': ['雨', '田'], '零': ['雨', '令'], '露': ['雨', '路'], '需': ['雨', '而'], '霧': ['雨', '務']
    };
    for (var ek in EXTRA) DECOMP[ek] = EXTRA[ek];
    /* TB：上下結構的字（其他都是左右結構）。選干擾字時結構要跟答案一樣，露出來的那一側才會跟選項對得上 */
    var TB = {};
    '草花苦英家字守宅想思念息雲雪電霜桌菜茶荷若芳安完定室宇恩怒意忍感雷零露需霧'.split('').forEach(function (c) { TB[c] = true; });
    /* side 對應的部件索引：left/top 是第 0 個部件，right/bottom 是第 1 個 */
    var SIDE_IDX = { left: 0, top: 0, right: 1, bottom: 1 };
    /* BOUNDS：第一個部件占整個字寬（或字高）的比例＝兩部件的分界線，用來決定遮罩的切點 */
    /* 第一個部件（左或上）占整個字的寬／高幾成＝兩個部件的分界線；用 b 欄位可以逐字覆蓋 */
    var BOUNDS = {
        '氵': 0.32, '言': 0.42, '忄': 0.32, '日': 0.38, '女': 0.36, '金': 0.42, '食': 0.40, '米': 0.50, '扌': 0.36, '足': 0.48, '口': 0.40, '木': 0.40,
        '亻': 0.34, '子': 0.34, '彳': 0.34, '目': 0.44, '片': 0.44, '土': 0.40, '石': 0.46, '虫': 0.44, '車': 0.46, '犭': 0.34, '王': 0.40, '田': 0.56,
        '艹': 0.38, '宀': 0.45, '相': 0.58, '今': 0.54, '自': 0.58, '雨': 0.60, '卓': 0.55
    };
    /* 題庫 ENTRIES（手工審校）：{ a 答案, side 差異部件在字的哪一側, d 三個干擾字 }。想新增題目只要加一筆，並跑 checkData 檢查 */
    var ENTRIES = [
        /* 這一組：差異部件在右側（被遮住），相似的左半部件（例如「氵」）露出 */
        /* 露出右半（干擾字有被遮住的左半部件）*/
        { a: '湖', side: 'right', d: ['河', '海', '油'] }, { a: '清', side: 'right', d: ['洗', '港', '流'] }, { a: '請', side: 'right', d: ['說', '話', '語'] },
        { a: '情', side: 'right', d: ['快', '怕', '慢'] }, { a: '晴', side: 'right', d: ['明', '時', '昨'] }, { a: '媽', side: 'right', d: ['姐', '妹', '好'] },
        { a: '銀', side: 'right', d: ['鐘', '銅', '針'] }, { a: '時', side: 'right', d: ['明', '晴', '昨'] }, { a: '飯', side: 'right', d: ['餓', '餃', '飽'] },
        { a: '糖', side: 'right', d: ['粉', '精', '糕'] }, { a: '打', side: 'right', d: ['找', '拍', '抱'] }, { a: '跑', side: 'right', d: ['跳', '路', '跟'] },
        { a: '跳', side: 'right', d: ['跑', '路', '跟'] }, { a: '吃', side: 'right', d: ['喝', '叫', '吸'] }, { a: '喝', side: 'right', d: ['吃', '叫', '吸'] },
        { a: '校', side: 'right', d: ['樹', '林', '板'] }, { a: '你', side: 'right', d: ['他', '住', '做'] }, { a: '孩', side: 'right', d: ['孫', '孔', '孤'] },
        { a: '河', side: 'right', d: ['湖', '海', '油'] }, { a: '洗', side: 'right', d: ['河', '海', '油'] }, { a: '他', side: 'right', d: ['你', '住', '做'] },
        /* 這一組：差異部件在左側（被遮住），相似的右半部件露出 */
        /* 露出左半（干擾字有被遮住的右半部件）*/
        { a: '媽', side: 'left', d: ['嗎', '碼', '螞'] }, { a: '請', side: 'left', d: ['情', '清', '晴'] }, { a: '情', side: 'left', d: ['請', '清', '晴'] },
        { a: '清', side: 'left', d: ['請', '情', '晴'] }, { a: '晴', side: 'left', d: ['請', '情', '清'] }, { a: '銀', side: 'left', d: ['很', '眼', '根'] },
        { a: '時', side: 'left', d: ['詩', '持', '待'] }, { a: '飯', side: 'left', d: ['版', '坂', '板'] }, { a: '湖', side: 'left', d: ['糊', '蝴', '瑚'] },
        { a: '海', side: 'left', d: ['悔', '梅', '侮'] }, { a: '校', side: 'left', d: ['較', '咬', '狡'] }, { a: '跑', side: 'left', b: 0.42, d: ['抱', '飽', '泡'] },
        { a: '打', side: 'left', d: ['町', '訂', '汀'] }, { a: '孩', side: 'left', d: ['該', '咳', '核'] },
        /* 上下結構 */
        /* 上下結構 */
        { a: '草', side: 'bottom', d: ['花', '苦', '英'] }, { a: '花', side: 'bottom', d: ['草', '苦', '英'] }, { a: '苦', side: 'bottom', d: ['草', '花', '英'] },
        { a: '英', side: 'bottom', d: ['草', '花', '苦'] }, { a: '家', side: 'bottom', d: ['字', '守', '宅'] }, { a: '字', side: 'bottom', d: ['家', '守', '宅'] },
        { a: '想', side: 'top', d: ['思', '念', '息'] }, { a: '思', side: 'top', d: ['想', '念', '息'] }, { a: '念', side: 'top', d: ['想', '思', '息'] },
        { a: '息', side: 'top', d: ['想', '思', '念'] }, { a: '雲', side: 'bottom', d: ['雪', '電', '霜'] }, { a: '霜', side: 'bottom', d: ['雲', '雪', '電'] }
    ];

    /* 最佳紀錄顯示文字 */
    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 題'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這個字的分界線位置：題庫有寫 b 就用它，否則查 BOUNDS，再沒有就用 0.45 */
    function boundOf(entry) { return entry.b != null ? entry.b : (BOUNDS[DECOMP[entry.a][0]] != null ? BOUNDS[DECOMP[entry.a][0]] : 0.45); }
    /* 這題露出差異部件的比例（線性隨題號變少） */
    function revealOf(level) { return kit.ramp(level, SLIVER_START, SLIVER_END, LEVEL_RAMP); }
    /* 露出的是哪一側：差異部件的另一側（相似處那一側） */
    /* 露出的是哪一側：差異部件的另一側（相似處那一側） */
    function exposedSide(entry) { return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[entry.side]; }
    /* 算出要露出的區間 { from, to }（0～1）：相似部件整個露出，再加上差異部件貼著分界線的一小段 */
    /* 露出的區間 { from, to }（占字寬或字高的比例，0～1）：相似部件整個露出，加上差異部件貼著分界線的 SLIVER 那一段。
       差異在右／下（相似處在左／上）：[0, b + f·(1−b)]；差異在左／上（相似處在右／下）：[b − f·b, 1] */
    function visRegion(entry, level) {
        var b = boundOf(entry), f = revealOf(level);
        if (entry.side === 'right' || entry.side === 'bottom') return { from: 0, to: b + f * (1 - b) };
        return { from: b - f * b, to: 1 };
    }
    /* 把區間轉成 CSS clip-path: inset(上 右 下 左) 字串——clip-path 能「裁掉」元素的一部分不顯示 */
    /* clip-path 的 inset(上 右 下 左) */
    function clipFor(side, reg) {
        var lo = (reg.from * 100).toFixed(1) + '%', hi = ((1 - reg.to) * 100).toFixed(1) + '%';
        if (side === 'right') return 'inset(0 0 0 ' + lo + ')';
        if (side === 'left') return 'inset(0 ' + hi + ' 0 0)';
        if (side === 'bottom') return 'inset(' + lo + ' 0 0 0)';
        return 'inset(0 0 ' + hi + ' 0)';
    }
    /* 每題的限時 */
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* 這題有幾個選項（4 → 6，隨題號線性增加，四捨五入） */
    function optCount(level) { return Math.round(kit.ramp(level, OPT_START, OPT_END, OPT_RAMP)); }
    /* 這題大字要歪幾度（正的角度；方向由呼叫端隨機決定）：第 ROT_FROM 題以前 0，之後線性增加到第 LEVEL_RAMP 題的 ROT_MAX */
    function rotOf(level) { return level <= ROT_FROM ? 0 : ROT_MAX * Math.min(1, (level - ROT_FROM) / (LEVEL_RAMP - ROT_FROM)); }
    /* visiblePart＝相似的部件（完整露出）；hiddenPart＝差異的部件（大部分被遮住） */
    /* visiblePart＝相似處（整個露出）；hiddenPart＝差異處（大部分遮住） */
    function visiblePart(entry) { return DECOMP[entry.a][1 - SIDE_IDX[entry.side]]; }
    function hiddenPart(entry) { return DECOMP[entry.a][SIDE_IDX[entry.side]]; }
    /* 題庫檢查：回傳問題清單，空陣列代表全部合格（Node 測試會呼叫它） */
    /* 題庫檢查：回傳問題清單（空陣列＝全部合格）*/
    function checkData() {
        var bad = [];
        ENTRIES.forEach(function (e, i) {
            var tag = '#' + (i + 1) + e.a + '(' + e.side + ')';
            if (!DECOMP[e.a]) { bad.push(tag + ' 答案沒有拆字'); return; }
            if (SIDE_IDX[e.side] === undefined) bad.push(tag + ' side 不合法');
            /* new Set(e.d).size：Set 會去除重複，大小為 3 就代表三個干擾字都不同 */
            if (!e.d || e.d.length !== 3 || new Set(e.d).size !== 3) bad.push(tag + ' 干擾字要 3 個不重複');
            /* diff＝差異部件；same＝相似部件 */
            var diff = DECOMP[e.a] && DECOMP[e.a][SIDE_IDX[e.side]], same = DECOMP[e.a] && DECOMP[e.a][1 - SIDE_IDX[e.side]];
            (e.d || []).forEach(function (c) {
                if (c === e.a) bad.push(tag + ' 干擾字等於答案');
                if (!DECOMP[c]) { bad.push(tag + ' 干擾字 ' + c + ' 沒有拆字'); return; }
                /* 規則 1：干擾字不能含有答案的差異部件（否則干擾字也可能是正解） */
                if (DECOMP[c][0] === diff || DECOMP[c][1] === diff) bad.push(tag + ' 干擾字 ' + c + ' 也含有答案的差異部件 ' + diff);
                /* 規則 2：干擾字一定要含有那個相似部件（所以露出的部分看起來四個字都像） */
                if (DECOMP[c][0] !== same && DECOMP[c][1] !== same) bad.push(tag + ' 干擾字 ' + c + ' 沒有露出的相似部件 ' + same);
            });
        });
        return bad;
    }
    /* 這題答案的結構是不是上下結構（side 是 top／bottom） */
    function isTB(entry) { return entry.side === 'top' || entry.side === 'bottom'; }
    /* 額外的干擾字候選：拆字表裡「結構跟答案一樣、相似部件在同一個位置、差異部件跟答案不同」的字，扣掉答案與手工審校的 3 個干擾字 */
    function extraPool(entry) {
        var idx = SIDE_IDX[entry.side], vis = visiblePart(entry), hid = hiddenPart(entry);
        return Object.keys(DECOMP).filter(function (c) {
            return c !== entry.a && entry.d.indexOf(c) < 0 && !!TB[c] === isTB(entry) && DECOMP[c][1 - idx] === vis && DECOMP[c][idx] !== hid;
        });
    }
    /* 檢查額外干擾字：每一題至少找得到 OPT_END − 4 個，而且每個都符合規則（Node 測試會呼叫它）；回傳問題清單 */
    function checkPool() {
        var bad = [];
        ENTRIES.forEach(function (e, i) {
            var tag = '#' + (i + 1) + e.a + '(' + e.side + ')', pool = extraPool(e);
            if (pool.length < OPT_END - 4) bad.push(tag + ' 額外干擾字只有 ' + pool.length + ' 個，湊不到 ' + OPT_END + ' 個選項');
            var idx = SIDE_IDX[e.side];
            pool.forEach(function (c) {
                if (DECOMP[c][1 - idx] !== visiblePart(e)) bad.push(tag + ' 額外干擾字 ' + c + ' 沒有相似部件 ' + visiblePart(e));
                if (DECOMP[c][idx] === hiddenPart(e)) bad.push(tag + ' 額外干擾字 ' + c + ' 也含有答案的差異部件');
                if (!!TB[c] !== isTB(e)) bad.push(tag + ' 額外干擾字 ' + c + ' 結構（左右／上下）跟答案不同');
            });
        });
        return bad;
    }
    /* 挑一題：避開最近出過的 */
    function pickEntry(recent, rand) {
        rand = rand || Math.random;
        for (var t = 0; t < 100; t++) {
            var i = kit.randInt(0, ENTRIES.length - 1, rand);
            if (recent.indexOf(i) < 0) return i;
        }
        return kit.randInt(0, ENTRIES.length - 1, rand);
    }
    /* n 個選項（答案 + n−1 個干擾字）洗牌，並記下答案在第幾個。干擾字先用手工審校的 3 個，不夠再從額外候選（extraPool）隨機補；
       候選不夠的話選項會比 n 少（t_halfchar 檢查過每一題都補得夠）。n 沒給就是 4 個（原本的做法） */
    function makeOptions(entry, rand, n) {
        var want = Math.max(4, n || 4) - 1, ds = entry.d.slice();
        if (ds.length < want) ds = ds.concat(kit.shuffle(extraPool(entry), rand).slice(0, want - ds.length));
        var opts = kit.shuffle([entry.a].concat(ds.slice(0, want)), rand);
        return { options: opts, answer: opts.indexOf(entry.a) };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* q 目前題號；right 答對數；lives 機會；state 目前階段；qid 每題 +1；recent 最近出過的題；E 這題的題庫資料；O 這題的選項 */
            var q = (startAt || 1) - 1, right = q, lives = LIVES, newRec = false, state = 'idle', qid = 0, recent = [], cur = null, E = null, O = null;
            /* 建立畫面元素：標題、提示、大字框、時間條、四個選項、解說 */
            var head = h('div', { 'class': 'hc-head' });
            var prompt = h('div', { 'class': 'hc-prompt' });
            var charBox = h('div', { 'class': 'hc-box' });
            var big = h('div', { 'class': 'hc-char' });
            charBox.appendChild(big);
            var tb = kit.timebar();
            var opts = h('div', { 'class': 'hc-opts' });
            var tip = h('div', { 'class': 'hc-tip' });
            [head, prompt, charBox, tb.el, opts, tip].forEach(function (n) { root.appendChild(n); });

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, '機會 ' + lives])); }

            /* 出下一題 */
            function next() {
                if (my.dead) return;
                q++;
                var id = ++qid;
                var idx = pickEntry(recent);
                recent.push(idx); if (recent.length > AVOID_RECENT) recent.shift();
                /* E 是題庫的一筆；O 是這題的四個選項 */
                E = ENTRIES[idx]; O = makeOptions(E, null, optCount(q));
                /* 算出這題要露出哪個區間 */
                var reg = visRegion(E, q);
                state = 'ask';
                head.textContent = '第 ' + q + ' 題';
                prompt.textContent = '字被遮住一半（相似處露出、差異處遮住），是哪一個？';
                tip.textContent = '';
                big.textContent = E.a;
                /* 用 CSS clip-path 把大字遮住一部分（webkitClipPath 是舊版 Safari 的寫法） */
                big.style.clipPath = clipFor(exposedSide(E), reg);
                big.style.webkitClipPath = big.style.clipPath;
                charBox.className = 'hc-box';
                opts.innerHTML = '';
                /* 選項的欄數：4 個以內 2 欄（2×2），5～6 個 3 欄（3×2），兩種都是 2 列，所以占的高度一樣 */
                opts.style.gridTemplateColumns = 'repeat(' + (O.options.length <= 4 ? 2 : 3) + ', 1fr)';
                /* 建立四顆選項按鈕 */
                O.options.forEach(function (c, i) {
                    var b = h('button', { 'class': 'hc-opt', text: c });
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); judge(i); });
                    opts.appendChild(b);
                });
                /* 字級要先縮小再依字框大小放大，量到的框高度才準 */
                big.style.fontSize = '120px';          /* 先縮小，量到的字框高度才不會被大字撐開 */
                /* 字歪斜：第 ROT_FROM 題之後隨機往左或往右歪 rotOf(q) 度；歪了之後字的外接框會變大（邊長 × (cos＋sin)），
                   所以字級要先除以這個倍數，才不會被字框裁到邊角 */
                var rot = rotOf(q) * (Math.random() < 0.5 ? -1 : 1), rad = Math.abs(rot) * Math.PI / 180;
                big.style.transform = rot ? 'rotate(' + rot.toFixed(1) + 'deg)' : '';
                big.style.fontSize = Math.floor(Math.min(charBox.clientHeight, charBox.clientWidth) * 0.92 / (Math.cos(rad) + Math.sin(rad))) + 'px';
                meta();
                /* 主控台印出這題的細節（答案、露出哪一側、相似與差異部件、分界線、限時），方便驗證 */
                try { console.info('[半邊字] 第 ' + q + ' 題：答案「' + E.a + '」露出' + ({ left: '左', right: '右', top: '上', bottom: '下' })[exposedSide(E)] + '半（相似的「' + visiblePart(E) + '」整個露出，差異的「' + hiddenPart(E) + '」只露出 ' + (revealOf(q) * 100).toFixed(0) + '%，分界線 ' + boundOf(E).toFixed(2) + '）；選項 ' + O.options.join('、') + '；限時 ' + timeFor(q).toFixed(1) + ' 秒'); } catch (e) { }
                var t0 = performance.now(), lim = timeFor(q) * 1000;
                /* 倒數時間條 */
                my.loop(function (now) { if (id !== qid || state !== 'ask') return false; tb.set(1 - (now - t0) / lim); });
                /* 時間到：judge(-1) 代表沒有選 */
                my.after(lim, function () { if (id === qid && state === 'ask') judge(-1); });
            }

            /* 判定：i 是玩家選的第幾個（−1＝超時） */
            function judge(i) {
                if (state !== 'ask') return;
                state = 'reveal';
                tb.set(0);
                /* 揭曉：拿掉遮罩，整個字亮出來（同時轉正） */
                big.style.clipPath = 'none'; big.style.webkitClipPath = 'none';        /* 揭曉：整個字亮出來 */
                big.style.transform = '';
                var ok = i === O.answer;
                /* 正確選項標綠，選錯的標橘 */
                [].forEach.call(opts.children, function (b, k) { if (k === O.answer) b.classList.add('hc-opt--ok'); else if (k === i) b.classList.add('hc-opt--bad'); });
                charBox.classList.add(ok ? 'hc-box--ok' : 'hc-box--bad');
                /* 解說：「大家都有 X，關鍵是 Y，合起來就是 Z」 */
                tip.textContent = '大家都有「' + visiblePart(E) + '」，關鍵是「' + hiddenPart(E) + '」，合起來就是「' + E.a + '」';
                /* 答對 */
                if (ok) {
                    right++;
                    Sfx.play('ok');
                    if (Reaction.setBest(ID, right, function (v, b) { return v > b; })) newRec = true;
                    meta();
                    my.after(NEXT_MS, next);
                    return;
                }
                /* 答錯：扣機會 */
                lives--;
                Sfx.play('bad');
                prompt.textContent = i < 0 ? '時間到！' : '選錯了…';
                meta();
                /* 沒有機會了 → 結算 */
                if (lives <= 0) {
                    my.after(1900, function () {
                        /* kit.resumeFrom：失敗後可從前 5 題繼續 */
                        var back = kit.resumeFrom(q);
                        kit.result(root, {
                            score: right,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                            num: right + ' 題', label: right >= 20 ? '識字高手！' : (right >= 10 ? '眼力不錯！' : '再試一次，會更準！'),
                            lines: ['最後一題：「' + E.a + '」', '大家都有「' + visiblePart(E) + '」，關鍵是「' + hiddenPart(E) + '」'],
                            isNew: newRec, sfx: right >= 10 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                        });
                    });
                } else my.after(2000, next);
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { q: q, state: state, right: right, lives: lives, E: E, O: O }; },
                answerRight: function () { judge(O.answer); return state; },
                answerWrong: function () { judge((O.answer + 1) % 4); return state; },
                jump: function (n) { q = n - 1; }
            };
            /* 開場等 300 毫秒再出第一題 */
            my.after(300, next);
        }

        /* V1.34.0：從「個人最佳關卡 − 5」開始（沒玩過就是第 1 關），見 kit.enter（reaction_kit.js） */

        kit.enter(ID, round);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '半邊字',
        rule: '畫面上的**字只露出一半**，從下面的字裡**選出最可能的那一個**。露出的部分會越來越少，選項會增加到六個，字還會越來越歪，每題時間也越來越短！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { exposedSide: exposedSide, SLIVER_START: SLIVER_START, SLIVER_END: SLIVER_END, ENTRIES: ENTRIES, DECOMP: DECOMP, SIDE_IDX: SIDE_IDX, visRegion: visRegion, revealOf: revealOf, boundOf: boundOf, BOUNDS: BOUNDS, clipFor: clipFor, timeFor: timeFor, visiblePart: visiblePart, hiddenPart: hiddenPart, checkData: checkData, checkPool: checkPool, extraPool: extraPool, optCount: optCount, rotOf: rotOf, isTB: isTB, pickEntry: pickEntry, makeOptions: makeOptions, LEVEL_RAMP: LEVEL_RAMP, OPT_START: OPT_START, OPT_END: OPT_END, OPT_RAMP: OPT_RAMP, ROT_FROM: ROT_FROM, ROT_MAX: ROT_MAX, TIME_START: TIME_START, TIME_END: TIME_END, TB: TB }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
