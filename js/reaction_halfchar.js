/* ═══════════════════════════════════════════════════════════════════
   reaction_halfchar.js — 秒反應・半邊字
   樣式：css/games/reaction_halfchar.css（這款專屬的 class 一律以「halfchar-」開頭；共用元件在 css/reaction_common.css）
   一個中文字被「旋轉的白色遮片」蓋住，只能從遮片的空隙偷看它的筆畫，從下面的字裡選出最可能的那一個。
   ───────────────────────────────────────────────────────────────────
   · V1.57.0（玩家意見）改規則：原本是「用 CSS 把字的一半遮住」，現在改成**不同形狀的白色遮片繞著字的中心旋轉**（畫在 canvas 上）。
     遮片的形狀（SHAPE_FROM 是每種形狀從第幾題開始出現）：
        pizza    切出開口的比薩（V1.57.0 起是 PIZZA_CUTS 個切口、平均分布在圓盤上，總空隙平均分給每個切口，開口越小越難辨識）；
        stripes  交錯的白色條紋與空隙（轉起來有時是直條、有時是橫條）；
        checker  交錯的黑白格（白色格子擋住字，「黑色」的格子是看得到字的空隙）；
        wave     黑白相間的波紋（條紋彎成波浪，WAVE）；
        spiral   螺旋紋（白色的螺旋帶，紋路的寬度決定難度）；
        emoji    4／9／16／25／36／49 宮格的 emoji 方陣（人臉、水果、動物、交通工具、蔬果；圖案之間不留空隙，只剩圓形圖案四個角落的小縫）。
   · **題目字盡量放大**（V1.57.0 玩家意見）：字（字級）是畫面寬度的 CHAR_W（90%），畫布也跟著撐大到放得下為止——標題兼做題目提示（只占一行）、時間條與選項之間的空隙縮小、選項按鈕變矮、解說先留兩行的高度（揭曉時字框才不會被擠小）。
   · 題庫 ENTRIES 是**手工審校**的，不做自動產生：每題 { a:答案, side:差異部件在哪一側, d:[3 個干擾字] }（side 指的是「答案跟干擾字不一樣的那個部件」
     在字的哪一側：left／top 取拆解的第 0 個部件，right／bottom 取第 1 個）。題庫規則（checkData 逐題驗證）：3 個干擾字的拆解都含有那個相似部件，而且都不含答案的差異部件。
     遮片改版後，這份題庫還是用來出選項（干擾字都跟答案共用一個部件，長得很像），揭曉時也用它說明「相似的是 X，關鍵是 Y」。
   · 難度（全部隨題號線性變難，第 LEVEL_RAMP 題到頂；參數格式都是 [第 1 題, 到頂]）：
        ① **遮片的空隙 OPEN**：看得到字的部分占多少（0.5＝一半是空隙 → 0.15）；空隙露出越少越難；
        ② **旋轉的速度 SPEED**（度／秒）：要適中——太慢，空隙幾乎停在原地，慢慢等它掃過就看得全；太快，眼睛會把一連串空隙的畫面疊在一起，反而認得出來。
           所以這個參數只從「慢」加快到「最難的速度」，不會再更快；每一題的速度在這一關的基準上下隨機 SPEED_JITTER，方向（順時針或逆時針）也隨機；
        ③ **遮片五彩繽紛 COLOR_P**：每一條條紋、每一格、每一段扇形都是不同的鮮豔顏色（機率隨題號增加；emoji 方陣本來就是彩色的）；
        ④ emoji 方陣的格數 EMOJI_N（每邊 2 個＝4 宮格，到每邊 7 個＝49 宮格）；
        ⑤ 時間變短 TIME_START → TIME_END；⑥ 選項變多 OPT_START → OPT_END（多出來的干擾字從拆字表 DECOMP 自動找「結構相同、相似部件同一個位置、差異部件不一樣」的字，見 extraPool）。
   · 有 LIVES 次機會，成績＝答對題數（越多越好）。答完拿掉遮片、把整個字亮出來並說明「相似的是 X，關鍵是 Y」。
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
    var LEVEL_RAMP = 30;                            /* 難度升到頂的關卡：第 1 關線性變難，到第 30 關最難，之後維持不變 */
    var OPEN = [0.15, 0.025];                         /* 遮片的空隙（看得到字的部分）占多少：第 1 題 → 到頂。0.5＝一半是空隙，越小越難（棋盤格最多 0.5） */
    var SPEED = [40, 180];                          /* 遮片旋轉的速度（度／秒）：第 1 題 → 到頂。要適中：太慢或太快都比較好認，所以最快只加到「最難的速度」 */
    var SPEED_JITTER = 0.2;                         /* 每一題的速度，在這一關的基準上下隨機多少（0.2＝±20%） */
    var COLOR_P = [0, 0.75];                        /* 遮片變成五彩繽紛（每個部分都是不同的鮮豔顏色）的機率：第 1 題 → 到頂 */
    var EMOJI_N = [2, 7];                           /* emoji 方陣每邊有幾個圖案：第 1 題 → 到頂（2＝4 宮格、3＝9、4＝16、5＝25、6＝36、7＝49） */
    var SHAPE_FROM = { pizza: 1, stripes: 1, checker: 2, wave: 3, spiral: 4, emoji: 5 };   /* 每一種遮片從第幾題開始出現（出現之後，每題從已經出現的形狀裡隨機挑一種） */
    /* 各種遮片的紋路間距（占字大小的幾倍，每題在範圍內隨機，並非由關卡數量遞增）；間距越小，紋路越細密 */
    var PITCH = { stripes: [0.1, 0.15], checker: [0.12, 0.20], wave: [0.1, 0.15], spiral: [0.025, 0.05] };
    var WAVE_AMP = [0.1, 0.1];                      /* 波紋的振幅：間距的幾倍 */
    var WAVE_LAMBDA = [0.30, 0.5];                 /* 波紋的波長：占字大小的幾倍 */
    var PIZZA_CUTS = [3, 6];                        /* 比薩的切口有幾個：第 1 題 → 到頂（四捨五入，至少 2 個）。總空隙 OPEN 平均分給每個切口、切口平均分布在圓盤上，字不會因為轉速慢、只有一個窄窄的切口慢慢掃過去而看不清全貌 */
    var EMOJI_SPAN = 1.5;                           /* emoji 方陣整個的邊長：占字大小的幾倍（至少 1.42，才轉到哪裡都蓋得住字） */
    var TIME_START = 6, TIME_END = 20;          /* 每題限時（秒），原本 8 → 3.5 */
    /* 選項數：第 1 題 4 個，線性增加到第 OPT_RAMP 題起 6 個（四捨五入：第 4 題起 5 個、第 10 題起 6 個） */
    var OPT_START = 6, OPT_END = 6, OPT_RAMP = 12;
    var LIVES = 1;                                  /* 命數（答錯一次扣一條，用完就結束） */
    var NEXT_MS = 1300;                             /* 答完一題後停多久才出下一題（毫秒，1300 毫秒＝1.3 秒） */
    /* 最近出過的 10 題不會再出現 */
    var AVOID_RECENT = 10;                      /* 最近出過的幾題不重複 */
    var CHAR_W = 0.9;                               /* 題目字（字級）的大小是畫面寬度的幾倍：0.9＝90%（V1.57.0 玩家意見：盡量放大；畫布會撐到放得下為止，字太大放不下時縮到畫布那麼大）。原本的 CHAR_FRAC（字占畫布的 0.85）不用了 */

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
    /* 只當「選項裡的干擾字」用的字（不會當答案，所以不用寫進題庫 ENTRIES）：格式跟上面的 DECOMP 一樣，用來讓選項增加到 6 個。
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
    '草花苦英家字守宅想思念息雲雪電霜桌菜茶荷若芳安完定室宇恩怒意忍感雷零露需霧'.split('').forEach(function (c) { TB[c] = true; });  /* forEach：對陣列的每個元素各做一次 */
    /* side 對應的部件索引：left/top 是第 0 個部件，right/bottom 是第 1 個 */
    var SIDE_IDX = { left: 0, top: 0, right: 1, bottom: 1 };
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
    /* 每題的限時 */
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這題有幾個選項（4 → 6，隨題號線性增加，四捨五入） */
    function optCount(level) { return Math.round(kit.ramp(level, OPT_START, OPT_END, OPT_RAMP)); }  /* Math.round：四捨五入成整數 */

    /* ─── 遮片（V1.57.0）─── */
    function openFor(q) { return kit.ramp(q, OPEN[0], OPEN[1], LEVEL_RAMP); }          /* 這題遮片的空隙比例 */
    function speedFor(q) { return kit.ramp(q, SPEED[0], SPEED[1], LEVEL_RAMP); }       /* 這題的基準轉速（度／秒） */
    function colorPFor(q) { return kit.ramp(q, COLOR_P[0], COLOR_P[1], LEVEL_RAMP); }  /* 這題遮片變成五彩繽紛的機率 */
    function emojiNFor(q) { return kit.clamp(Math.round(kit.ramp(q, EMOJI_N[0], EMOJI_N[1], LEVEL_RAMP)), Math.min(EMOJI_N[0], EMOJI_N[1]), Math.max(EMOJI_N[0], EMOJI_N[1])); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內 */
    function pizzaCutsFor(q) { return Math.max(2, Math.round(kit.ramp(q, PIZZA_CUTS[0], PIZZA_CUTS[1], LEVEL_RAMP))); }   /* 這題比薩有幾個切口 */
    /* 這題出現的遮片形狀有哪幾種：已經「開始出現」（SHAPE_FROM ≤ 題號）的全部 */
    function shapesFor(q) { return Object.keys(SHAPE_FROM).filter(function (s) { return q >= SHAPE_FROM[s]; }); }  /* filter：留下符合條件的元素，回傳新陣列 */
    /* emoji 方陣用的圖案：人臉、水果、動物、交通工具、蔬菜（都是 emoji 圖片庫 Reaction.emojiPng 裡有的） */
    var EMOJI_CATS = {
        faces: Array.from('😀😃😄😁😆😅🤣😂🙂🙃😉😊😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🥳😎🤓'),
        fruits: Array.from('🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓🥝🍅🥥'),
        animals: Array.from('🐒🐶🐺🦊🦝🐱🦁🐯🐴🦄🦓🦌🐮🐷🐗🐏🐐🐪🦙🦒🐘🐰🦔🐻🐨🐼🦨🦘🐔🐣🐸🐵'),
        vehicles: Array.from('🚗🚘🚙🚚🚛🚜🛵🛺🚲🛴⛵🚢🚁🚟🚠🚀🛸'),
        veggies: Array.from('🥑🍆🥔🥕🌽🥒🥬🥦🧄🧅🍄🥜🌰')
    };
    /* 這題的遮片：{ shape, open, colorful, speed（度／秒）, dir（1 順時針、−1 逆時針）, theta0（一開始的角度）, pitch（紋路間距，占字大小的幾倍）, amp／lambda／phase（波紋）, n／cat／cells（emoji 方陣）} */
    function makeMask(q, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var shapes = shapesFor(q), shape = kit.pick(shapes.length ? shapes : ['pizza'], rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var m = { shape: shape, open: openFor(q), colorful: false, speed: speedFor(q) * (1 + SPEED_JITTER * (rand() * 2 - 1)), dir: rand() < 0.5 ? 1 : -1, theta0: rand() * 2 * Math.PI };
        if (shape !== 'emoji') m.colorful = rand() < colorPFor(q);
        if (PITCH[shape]) m.pitch = kit.randFloat(PITCH[shape][0], PITCH[shape][1], rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        if (shape === 'wave') { m.amp = m.pitch * kit.randFloat(WAVE_AMP[0], WAVE_AMP[1], rand); m.lambda = kit.randFloat(WAVE_LAMBDA[0], WAVE_LAMBDA[1], rand); m.phase = rand() * 2 * Math.PI; }
        if (shape === 'pizza') m.cuts = pizzaCutsFor(q);                         /* 比薩：切口的個數（總空隙平均分給每個切口） */
        if (shape === 'emoji') {
            m.n = emojiNFor(q); m.cat = kit.pick(Object.keys(EMOJI_CATS), rand); m.cells = [];
            for (var i = 0; i < m.n * m.n; i++) m.cells.push(kit.pick(EMOJI_CATS[m.cat], rand));
        }
        return m;
    }
    /* 第 tSec 秒時遮片轉到的角度（弧度） */
    function maskAngle(m, tSec) { return m.theta0 + m.dir * m.speed * Math.PI / 180 * tSec; }
    function mod(a, b) { return ((a % b) + b) % b; }
    /* 遮片在「遮片自己的座標」（原點在字的中心，單位 px）的 (x, y) 這一點，是不是不透明（會擋住字）。U＝字的大小（px）。
       畫遮片的程式（drawMask）跟它用同一組幾何，所以測試只要檢查這個函式，就知道實際露出多少。 */
    function coverAt(m, x, y, U) {
        var g, p, v;
        if (m.shape === 'pizza') {                                       /* 圓盤；m.cuts 個切口平均分布（每隔 2π÷cuts 一個），每個切口是以那個角度為中心、寬 open×2π÷cuts 的扇形，所以總空隙是 open */
            var n = m.cuts || 1, step = 2 * Math.PI / n, ph = mod(Math.atan2(y, x), step);   /* ph：在「這一個切口到下一個切口」之間轉了多少 */
            return Math.min(ph, step - ph) > m.open * Math.PI / n;                          /* 離最近的切口中心比半寬還遠＝被擋住（半寬是 open×π÷cuts） */
        }
        if (m.shape === 'stripes') { p = m.pitch * U; g = m.open * p; v = mod(y, p); return !(v <= g / 2 || v >= p - g / 2); }
        if (m.shape === 'wave') { p = m.pitch * U; g = m.open * p; v = mod(y - m.amp * U * Math.sin(2 * Math.PI * x / (m.lambda * U) + m.phase), p); return !(v <= g / 2 || v >= p - g / 2); }
        if (m.shape === 'spiral') {                                      /* 阿基米德螺線 r ＝ p×θ÷2π ＋ 常數：空隙以螺線為中心、寬 open×p */
            p = m.pitch * U; g = m.open * p;
            v = mod(Math.hypot(x, y) - p * mod(Math.atan2(y, x), 2 * Math.PI) / (2 * Math.PI), p);
            return !(v <= g / 2 || v >= p - g / 2);
        }
        if (m.shape === 'checker') {                                     /* 格子（i, j）：i＋j 是偶數的格子中間有空隙（邊長 w），其餘整格擋住 */
            var c = m.pitch * U, w = Math.min(c, c * Math.sqrt(2 * m.open)), i = Math.floor(x / c), j = Math.floor(y / c);
            if (mod(i + j, 2) !== 0) return true;
            return Math.abs(x - (i + 0.5) * c) > w / 2 || Math.abs(y - (j + 0.5) * c) > w / 2;
        }
        /* emoji 方陣：每一格大約是一個圓形（直徑＝格邊長），圓外面的四個角是縫 */
        var G = EMOJI_SPAN * U, e = G / m.n;
        if (Math.abs(x) >= G / 2 || Math.abs(y) >= G / 2) return false;
        var ci = Math.floor((x + G / 2) / e), cj = Math.floor((y + G / 2) / e);
        return Math.hypot(x + G / 2 - (ci + 0.5) * e, y + G / 2 - (cj + 0.5) * e) <= e / 2;
    }
    /* 這片遮片露出多少：在字的範圍（邊長 U 的正方形）裡取 steps×steps 個點，沒被擋住的比例（0～1） */
    function visibleFraction(m, U, steps) {
        steps = steps || 60;
        var open = 0, i, j;
        for (i = 0; i < steps; i++) for (j = 0; j < steps; j++) if (!coverAt(m, (i + 0.5) / steps * U - U / 2, (j + 0.5) / steps * U - U / 2, U)) open++;
        return open / (steps * steps);
    }
    /* 彩色遮片的顏色：第 k 個部分的色相（黃金角 137.5° 讓相鄰的部分顏色差很多） */
    function hueOf(k) { return mod(k * 137.508, 360); }
    function hsl(k, light) { return 'hsl(' + hueOf(k).toFixed(1) + ',85%,' + (light || 55) + '%)'; }
    /* 畫遮片：ctx 的原點已經在畫布中心；U＝字的大小（px）；ang＝遮片轉到的角度；pal＝{ white, edge }（白色與邊線顏色）；drawEmoji(ctx, 圖案, 中心 x, 中心 y, 邊長)：畫 emoji（沒傳就用文字 emoji）。
       每一種形狀都畫「擋住字」的部分（白色，或五彩繽紛 m.colorful），空隙就是沒畫的地方。 */
    function drawMask(ctx, m, U, ang, pal, drawEmoji) {
        var R = U * 1.0, k, i, j, p, g, a;                               /* R：遮片鋪多大（半徑）；字框的半對角線是 0.71×U，畫布的半對角線不到 U，所以轉到哪裡都鋪得滿 */
        ctx.save();
        ctx.rotate(ang);
        if (m.shape === 'pizza') {
            var n = m.cuts || 1, step = 2 * Math.PI / n, hw = m.open * Math.PI / n;          /* n 個切口平均分布，每個切口半寬 hw；兩個切口之間是一塊「比薩」 */
            for (k = 0; k < n; k++) {
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, k * step + hw, (k + 1) * step - hw); ctx.closePath();
                ctx.fillStyle = m.colorful ? hsl(k) : pal.white; ctx.fill();                  /* 五彩繽紛：每一塊顏色不同。不畫邊線：切口很窄的時候，邊線會把切口吃掉 */
            }
        } else if (m.shape === 'stripes') {
            p = m.pitch * U; g = m.open * p;
            for (k = -Math.ceil(R / p) - 1; k <= Math.ceil(R / p) + 1; k++) { ctx.fillStyle = m.colorful ? hsl(k) : pal.white; ctx.fillRect(-R, k * p + g / 2, 2 * R, p - g); }
        } else if (m.shape === 'wave') {
            p = m.pitch * U; g = m.open * p; a = m.amp * U;
            var K = Math.ceil((R + a) / p) + 1, lam = m.lambda * U;
            ctx.lineWidth = p - g; ctx.lineJoin = 'round';
            for (k = -K; k <= K; k++) {
                ctx.beginPath();
                for (var x = -R; x <= R + 4; x += 4) { var y = (k + 0.5) * p + a * Math.sin(2 * Math.PI * x / lam + m.phase); if (x === -R) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
                ctx.strokeStyle = m.colorful ? hsl(k) : pal.white; ctx.stroke();
            }
        } else if (m.shape === 'spiral') {
            p = m.pitch * U; g = m.open * p;
            ctx.lineWidth = p - g; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
            var th = -Math.PI, step = 0.1, seg = 0, rr = function (t) { return p * t / (2 * Math.PI) + p / 2; };
            ctx.beginPath(); ctx.moveTo(rr(th) * Math.cos(th), rr(th) * Math.sin(th));
            while (rr(th) < R * 1.45) {
                th += step; ctx.lineTo(rr(th) * Math.cos(th), rr(th) * Math.sin(th));
                if (m.colorful && ++seg % 5 === 0) { ctx.strokeStyle = hsl(seg / 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(rr(th) * Math.cos(th), rr(th) * Math.sin(th)); }
            }
            ctx.strokeStyle = m.colorful ? hsl(seg / 5 + 1) : pal.white; ctx.stroke();
        } else if (m.shape === 'checker') {
            var c = m.pitch * U, w = Math.min(c, c * Math.sqrt(2 * m.open)), N = Math.ceil(R / c) + 1;
            for (i = -N; i <= N; i++) for (j = -N; j <= N; j++) {
                ctx.fillStyle = m.colorful ? hsl(i * 7 + j * 13 + 100) : pal.white;
                ctx.beginPath(); ctx.rect(i * c, j * c, c, c);
                if (mod(i + j, 2) === 0) { ctx.rect(i * c + (c - w) / 2, j * c + (c - w) / 2, w, w); ctx.fill('evenodd'); } else ctx.fill();
            }
        } else {
            var Gd = EMOJI_SPAN * U, e = Gd / m.n;
            for (i = 0; i < m.n; i++) for (j = 0; j < m.n; j++) drawEmoji(ctx, m.cells[j * m.n + i], -Gd / 2 + (i + 0.5) * e, -Gd / 2 + (j + 0.5) * e, e);
        }
        ctx.restore();
    }

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
        return Object.keys(DECOMP).filter(function (c) {  /* filter：留下符合條件的元素，回傳新陣列 */
            return c !== entry.a && entry.d.indexOf(c) < 0 && !!TB[c] === isTB(entry) && DECOMP[c][1 - idx] === vis && DECOMP[c][idx] !== hid;  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
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
            var i = kit.randInt(0, ENTRIES.length - 1, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            if (recent.indexOf(i) < 0) return i;
        }
        return kit.randInt(0, ENTRIES.length - 1, rand);
    }
    /* n 個選項（答案 + n−1 個干擾字）洗牌，並記下答案在第幾個。干擾字先用手工審校的 3 個，不夠再從額外候選（extraPool）隨機補；
       候選不夠的話選項會比 n 少（t_halfchar 檢查過每一題都補得夠）。n 沒給就是 4 個（原本的做法） */
    function makeOptions(entry, rand, n) {
        var want = Math.max(4, n || 4) - 1, ds = entry.d.slice();  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        if (ds.length < want) ds = ds.concat(kit.shuffle(extraPool(entry), rand).slice(0, want - ds.length));  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var opts = kit.shuffle([entry.a].concat(ds.slice(0, want)), rand);
        return { options: opts, answer: opts.indexOf(entry.a) };
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null, EP = Reaction.emojiPng;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局。emoji 方陣要用 emoji 圖片，所以圖片載好才開始（限時遊戲要公平；載入失敗就退回文字 emoji） */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            EP.whenReady(root, function () { if (!my.dead) begin(my, startAt); });
        }
        function begin(my, startAt) {
            /* q 目前題號；right 答對數；lives 機會；state 目前階段；qid 每題 +1；recent 最近出過的題；E 這題的題庫資料；O 這題的選項；M 這題的遮片 */
            var q = (startAt || 1) - 1, right = q, lives = LIVES, newRec = false, state = 'idle', qid = 0, recent = [], cur = null, E = null, O = null, M = null;
            root.classList.add('halfchar-screen');      /* 加一個 class，讓標題與時間條的上下空隙縮小、把高度讓給題目字（樣式在 css/games/reaction_halfchar.css）；離開遊戲時拿掉 */
            my.onDispose(function () { root.classList.remove('halfchar-screen'); });
            /* 建立畫面元素：標題（兼題目提示）、大字框（裡面一塊 canvas）、時間條、選項、解說 */
            var head = h('div', { 'class': 'halfchar-head' });
            var charBox = h('div', { 'class': 'halfchar-box' });
            var cv = h('canvas', { 'class': 'halfchar-canvas' });
            charBox.appendChild(cv);                    /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            var tb = kit.timebar();
            var opts = h('div', { 'class': 'halfchar-opts' });
            var tip = h('div', { 'class': 'halfchar-tip' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
            [head, charBox, tb.el, opts, tip].forEach(function (n) { root.appendChild(n); });
            var g2 = cv.getContext('2d'), side = 300, DPR = Math.min(2, window.devicePixelRatio || 1), U = 0;
            var cs = getComputedStyle(document.documentElement), css = function (n, d) { return (cs.getPropertyValue(n) || '').trim() || d; };
            var pal = { white: css('--c-on-accent', '#ffffff'), edge: css('--c-ink-soft', '#7E6A3C'), ink: css('--c-black', '#000000'), bg: css('--c-gray-soft', '#e4e2de'), font: css('--font-note', 'serif') };

            function meta() { ctx.setMeta(kit.meta(['答對 ' + right, '機會 ' + lives])); }
            /* 畫面的 emoji：圖片庫畫得出來就貼圖，不然退回文字 emoji（跟 EP.draw 一樣：中心 (x, y)、邊長 e） */
            function drawEmoji(c2, ch, x, y, e) {
                if (EP.draw(c2, ch, x, y, e)) return;
                c2.font = Math.floor(e * 0.85) + 'px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = pal.ink; c2.fillText(ch, x, y);
            }
            /* 畫一個畫面：灰底、字，再蓋上轉到 tSec 秒時的遮片（masked 為 false＝揭曉，只畫字） */
            function draw(tSec, masked) {
                g2.setTransform(DPR, 0, 0, DPR, 0, 0);
                g2.clearRect(0, 0, side, side); g2.fillStyle = pal.bg; g2.fillRect(0, 0, side, side);
                g2.save(); g2.translate(side / 2, side / 2);
                g2.fillStyle = pal.ink; g2.font = '700 ' + U + 'px ' + pal.font; g2.textAlign = 'center'; g2.textBaseline = 'middle';
                g2.fillText(E.a, 0, U * 0.02);
                if (masked) drawMask(g2, M, U, maskAngle(M, tSec), pal, drawEmoji);
                g2.restore();
            }

            /* 出下一題 */
            function next() {
                if (my.dead) return;
                q++;
                var id = ++qid;
                var idx = pickEntry(recent);
                recent.push(idx); if (recent.length > AVOID_RECENT) recent.shift();
                /* E 是題庫的一筆；O 是這題的選項；M 是這題的遮片 */
                E = ENTRIES[idx]; O = makeOptions(E, null, optCount(q)); M = makeMask(q);
                state = 'ask';
                head.textContent = '第 ' + q + ' 題　遮片蓋住了字，是哪一個？';     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
                tip.textContent = '';
                charBox.className = 'halfchar-box';
                opts.innerHTML = '';
                /* 選項的欄數：4 個以內 2 欄（2×2），5～6 個 3 欄（3×2），兩種都是 2 列，所以占的高度一樣 */
                opts.style.gridTemplateColumns = 'repeat(' + (O.options.length <= 4 ? 2 : 3) + ', 1fr)';
                /* 建立選項按鈕 */
                O.options.forEach(function (c, i) {
                    var b = h('button', { 'class': 'halfchar-opt', text: c });
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); judge(i); });  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
                    opts.appendChild(b);
                });
                /* 畫布大小：字框裡放得下的最大正方形（要等選項放進去、版面排好才量得準）；字的大小 U ＝ 畫面寬度 × CHAR_W（90%），畫布放不下就縮到畫布那麼大 */
                side = Math.max(120, Math.floor(Math.min(charBox.clientWidth, charBox.clientHeight) - 8));
                cv.width = Math.round(side * DPR); cv.height = Math.round(side * DPR); cv.style.width = side + 'px'; cv.style.height = side + 'px';
                U = Math.floor(Math.min(CHAR_W * charBox.offsetWidth, side));
                meta();
                /* 主控台印出這題的細節（答案、遮片形狀、空隙、轉速、彩色與否、限時），方便驗證 */
                try { console.info('[半邊字] 第 ' + q + ' 題：答案「' + E.a + '」；遮片 ' + M.shape + '，空隙 ' + (M.open * 100).toFixed(0) + '%，轉速 ' + M.speed.toFixed(0) + ' 度／秒（' + (M.dir > 0 ? '順' : '逆') + '時針）' + (M.colorful ? '，五彩繽紛' : '') + (M.n ? '，' + M.n + '×' + M.n + ' 宮格（' + M.cat + '）' : '') + '；選項 ' + O.options.join('、') + '；限時 ' + timeFor(q).toFixed(1) + ' 秒'); } catch (e) { }
                var t0 = performance.now(), lim = timeFor(q) * 1000;  /* performance.now()：高精度的時間（毫秒），計時用 */
                draw(0, true);
                /* 每個畫面更新：遮片轉一點、倒數時間條 */
                my.loop(function (now) { if (id !== qid || state !== 'ask') return false; tb.set(1 - (now - t0) / lim); draw((now - t0) / 1000, true); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                /* 時間到：judge(-1) 代表沒有選 */
                my.after(lim, function () { if (id === qid && state === 'ask') judge(-1); });
            }

            /* 判定：i 是玩家選的第幾個（−1＝超時） */
            function judge(i) {
                if (state !== 'ask') return;
                state = 'reveal';
                tb.set(0);
                draw(0, false);                         /* 揭曉：拿掉遮片，整個字亮出來 */
                var ok = i === O.answer;
                /* 正確選項標綠，選錯的標橘 */
                [].forEach.call(opts.children, function (b, k) { if (k === O.answer) b.classList.add('halfchar-opt--ok'); else if (k === i) b.classList.add('halfchar-opt--bad'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                charBox.classList.add(ok ? 'halfchar-box--ok' : 'halfchar-box--bad');
                /* 解說：「大家都有 X，關鍵是 Y，合起來就是 Z」 */
                tip.textContent = '大家都有「' + visiblePart(E) + '」，關鍵是「' + hiddenPart(E) + '」，合起來就是「' + E.a + '」';
                /* 答對 */
                if (ok) {
                    right++;
                    Sfx.play('ok');                     /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                    if (Reaction.setBest(ID, right, function (v, b) { return v > b; })) newRec = true;  /* Reaction.getBest／setBest：讀／寫這款遊戲的個人最佳紀錄（存在手機的 localStorage） */
                    meta();
                    my.after(NEXT_MS, next);
                    return;
                }
                /* 答錯：扣機會 */
                lives--;
                Sfx.play('bad');
                head.textContent = '第 ' + q + ' 題　' + (i < 0 ? '時間到！' : '選錯了…');
                meta();
                /* 沒有機會了 → 結算 */
                if (lives <= 0) {
                    my.after(1900, function () {
                        /* kit.resumeFrom：失敗後可從前 5 題繼續 */
                        var back = kit.resumeFrom(q);
                        kit.result(root, {              /* kit.result：顯示結算卡片（成績、評語、再玩一次…），並自動記最佳紀錄、送世界排行榜 */
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
                state: function () { return { q: q, state: state, right: right, lives: lives, E: E, O: O, M: M, U: U, side: side }; },
                answerRight: function () { judge(O.answer); return state; },
                answerWrong: function () { judge((O.answer + 1) % O.options.length); return state; },
                jump: function (n) { q = n - 1; },
                draw: function (t, masked) { draw(t || 0, masked !== false); },
                setMask: function (m) { M = m; draw(0, true); }       /* 測試用：換成指定的遮片（看各種形狀長什麼樣子） */
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
        rule: '畫面上的字被**旋轉的白色遮片**蓋住，只能從遮片的空隙偷看，**選出最可能的那一個字**。遮片有比薩缺口、條紋、黑白格、波紋、螺旋、emoji 方陣等不同形狀，越後面空隙越小，有時還會變成五彩繽紛。選項會增加到六個，每題時間也越來越短！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: {
            ENTRIES: ENTRIES, DECOMP: DECOMP, SIDE_IDX: SIDE_IDX, timeFor: timeFor, visiblePart: visiblePart, hiddenPart: hiddenPart, checkData: checkData, checkPool: checkPool, extraPool: extraPool, optCount: optCount, isTB: isTB, pickEntry: pickEntry, makeOptions: makeOptions, TB: TB,
            openFor: openFor, speedFor: speedFor, colorPFor: colorPFor, emojiNFor: emojiNFor, shapesFor: shapesFor, makeMask: makeMask, maskAngle: maskAngle, coverAt: coverAt, visibleFraction: visibleFraction, drawMask: drawMask, hueOf: hueOf, EMOJI_CATS: EMOJI_CATS,
            pizzaCutsFor: pizzaCutsFor, PIZZA_CUTS: PIZZA_CUTS, CHAR_W: CHAR_W,
            LEVEL_RAMP: LEVEL_RAMP, OPEN: OPEN, SPEED: SPEED, SPEED_JITTER: SPEED_JITTER, COLOR_P: COLOR_P, EMOJI_N: EMOJI_N, SHAPE_FROM: SHAPE_FROM, PITCH: PITCH, EMOJI_SPAN: EMOJI_SPAN, OPT_START: OPT_START, OPT_END: OPT_END, OPT_RAMP: OPT_RAMP, TIME_START: TIME_START, TIME_END: TIME_END, LIVES: LIVES
        }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
