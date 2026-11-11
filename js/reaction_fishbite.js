/* ═══════════════════════════════════════════════════════════════════
   reaction_fishbite.js — 秒反應・釣魚提竿（企劃 361）
   樣式：css/games/reaction_fishbite.css（這款專屬的 class 一律以「fishbite-」開頭；共用元件在 css/reaction_common.css）
   浮標在水面上。魚會來輕輕碰（浮標小小地晃一下），**真的咬鉤時浮標會整個沉下去**——那一刻**往上滑提竿**。
   太早提（只是輕碰、或根本還沒咬）魚就跑了；太晚提（沉下去超過窗口時間才提）魚也跑了。每關釣一條。
   ───────────────────────────────────────────────────────────────────
   · 一關的「時間表」（makeLevel）：先有 k 次「輕碰」（假沉，浮標只沉下一部分），最後一次才是「咬鉤」（浮標整個沉下去）。
     浮標沉下的深度用「比例」表示：0＝浮在原位、1＝整個沒進水裡。
       輕碰：深度比例是 0.6×hi ～ hi（hi 隨關卡從 FAKE_HI[0] 增加到 FAKE_HI[1]，永遠到不了 BITE_LINE＝0.9）；形狀有三種（V1.53）：
         ① 一沉就浮（原本的樣子）；② 沉到假沉的深度後「停住」FAKE_HOLD 秒（0～0.5 秒）才浮起來；
         ③ 兩段式：先淺淺地沉一下並停住，再沉得更深（還是假的）並停一下，才浮起來——用來騙人提竿；
       咬鉤：很快沉到 1.0，**深度 ≥ 0.9 的那段時間（窗口 WINDOW 秒）內提竿才算釣到**，窗口一過浮標又浮上來（魚吐鉤跑了）。
         咬鉤有時是「假沉變真咬」（SNEAK_P）：先像輕碰一樣沉到假沉的深度、停住 0.1～0.5 秒，然後**不浮起來**，繼續往下沉成真咬；
     所以判定只看「提竿的瞬間，浮標是不是沉在 0.9 以下」——不是看「有沒有動」，輕碰再怎麼深（最多 0.8）、停得再久也不算。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：窗口 WINDOW_S（不能小於 WINDOW_MIN，見下面）；輕碰的深度上限 FAKE_HI（越來越像咬鉤）；
     輕碰次數 FAKES；停住、兩段式、假沉變真咬的機率 HOLD_P／DOUBLE_P／SNEAK_P；水面波浪（讓浮標一直晃）的振幅 WAVE_PX。
   · V1.53 畫面：水面在畫面下方 1/3 的高度（WATER_AT）；浮標整體放大 300%（FLOAT_SCALE）；水面不再只是一圈圈白線——水面的線條本身會上下抖動，
     抖動從浮標的位置以波形往左右兩側傳出去（一維的波動方程式，makeWaves／stepWaves；浮標晃動、被魚拉下去都是波的來源 sourceAt）。
     浮標會不定時往左或往右傾斜（swayAt）；魚來拉（輕碰、咬鉤往下沉）的時候，浮標會快速往「跟平常傾斜相反」的另一邊歪、並被拉向一邊
     （pullTiltAt／driftAt，吃餌的位置不一定在浮標正下方）。輕碰和咬鉤的傾斜、水波做法完全一樣，所以仍然不是線索。
   · 提竿＝手指在畫面任何地方往上滑（拉開 SWIPE_MIN 以上、而且往上的分量夠大）；單純點一下不算。
   · 揭曉：用折線圖畫出「浮標沉下的深度」整段時間表，標出「咬鉤」和「你提竿」的位置，並用 0.5 倍慢動作重播咬鉤的那一段；
     成功就有一條魚（每一關不同種）被提出水面。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'fishbite'：選單、成績、存檔都靠它；樣式在 css/games/reaction_fishbite.css，裡面的 class 名稱一律以 fishbite- 開頭。 */
    'use strict';

    var ID = 'fishbite';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var WINDOW_S = [0.8, 0.2];                  /* 咬鉤的窗口（浮標沉在 0.9 以下的時間，秒）：第 1 關 → 到頂。不能小於 WINDOW_MIN（約 0.17 秒，由 DESC_S 與 RECOVER_S 算出；再小浮標會在沉到底之前就開始浮起來，畫面和判定對不上，所以 windowFor 會自動擋在 WINDOW_MIN） */
    var FAKE_HI = [0.66, 0.8];                  /* 輕碰的深度上限（比例）：第 1 關 → 到頂；必須 < BITE_LINE */
    var FAKES = [2, 6];                         /* 輕碰的次數：第 1 關 → 到頂（四捨五入） */
    var WAVE_PX = [6, 20];                       /* 水面波浪讓浮標上下晃的振幅（px）：第 1 關 → 到頂 */
    var BITE_LINE = 0.9;                        /* 浮標沉到這個比例以下才算「咬鉤」 */
    var FAKE_DUR = [0.28, 0.42];                /* 一次輕碰「上下移動」要多久（秒，沉下去再浮起來；不含停住的時間） */
    var FAKE_HOLD = [0, 0.5];                   /* 輕碰沉到假沉深度之後，「停住不動」多久才浮起來（秒，在這個範圍隨機；0＝一到就浮起來） */
    var HOLD_P = [0.3, 0.6];                    /* 一次輕碰會「停住」的機率：第 1 關 → 到頂 */
    var DOUBLE_P = [0, 0.3];                    /* 一次輕碰是「兩段式」（先淺淺沉一下並停住，再沉得更深）的機率：第 1 關 → 到頂；跟 HOLD_P 加起來不要超過 1 */
    var SNEAK_P = [0, 0.4];                     /* 咬鉤是「假沉變真咬」（先沉到假沉的深度停住，然後不浮起來、繼續往下沉）的機率：第 1 關 → 到頂 */
    var DESC_S = 0.14;                          /* 咬鉤時浮標從原位沉到最深要多久 */
    var RECOVER_S = 0.35;                       /* 窗口結束後浮標浮回原位要多久 */
    var FIRST_AT = [1.4, 2.4];                  /* 第一次動作（輕碰或咬鉤）的時間範圍（秒） */
    var GAP = [0.6, 2.3];                       /* 兩次動作之間隔多久（秒，從上一次結束算起） */
    var LATE_GRACE = 0.35;                      /* 窗口結束後再等多久還沒提竿就判「太慢」（秒） */
    var SWIPE_MIN = 50;                         /* 往上滑要拉開幾 px */
    var UP_K = 0.8;                             /* 往上的分量要 ≥ 水平分量 × 這個數 */
    var REPLAY_SPEED = 0.5;                     /* 揭曉重播的速度（0.5＝慢動作兩倍） */
    var REPLAY_PRE = 0.6, REPLAY_POST = 0.5;    /* 重播從咬鉤前幾秒開始、窗口結束後多幾秒 */
    /* ─ V1.53：水面與浮標的畫面 ─ */
    var WATER_AT = 2 / 3;                       /* 水面的位置：從畫面上緣往下算，佔畫面高度的幾分之幾（2/3＝水面在畫面下方 1/3 的高度；以前是 0.4） */
    var FLOAT_SCALE = 3;                        /* 浮標整體放大幾倍（3＝300%；天線、紅色的頭、白色的身體一起放大，沉下去的距離也跟著放大） */
    var SWAY_DEG = [3, 9];                      /* 浮標平常不定時往左或往右傾斜的角度範圍（度） */
    var SWAY_DUR = [0.7, 1.6];                  /* 一次傾斜（慢慢歪過去、再慢慢回正）持續幾秒 */
    var SWAY_GAP = [0.3, 1.5];                  /* 兩次傾斜之間隔多久（秒，隨機） */
    var PULL_DEG = [14, 28];                    /* 魚來拉（輕碰、咬鉤往下沉）時，浮標往「跟平常傾斜相反」的另一邊快速歪的角度範圍（度） */
    var PULL_DRIFT = [10, 30];                  /* 魚來拉的時候，浮標同時被拉向歪的那一邊的水平位移範圍（px；吃餌的位置不一定在浮標正下方） */
    var WAVE_C = 250;                           /* 水面的波往左右兩側傳的速度（px／秒）：越慢，一個畫面裡看得到的波峰越多 */
    var WAVE_DAMP = 1.0;                        /* 水面的波的阻尼（越大越快平靜、傳得越近；每秒） */
    var WAVE_MAX = 36;                          /* 浮標帶動水面的目標位置最多上下多少 px（超過的會被壓住；彈簧一晃可以再多一點） */
    var WAVE_PULL = 0.14;                       /* 浮標被魚拉下去時，浮標下的水面被帶著凹下去多少（浮標沉下的距離 px × 這個比例） */
    var SRC_HZ = 2.4, SRC_ZETA = 0.1;           /* 浮標帶動水面的那一點像彈簧：平常跟著浮標走，被魚猛拉一下就會來回晃幾下（每秒 SRC_HZ 下、衰減 SRC_ZETA，越小晃越久），一晃就一圈圈往外傳 */
    var WAVE_DX = 12;                            /* 水面波形的取樣間隔（px）：越小波形越細緻、越吃效能 */
    var DRIVE_K = 4000;                         /* 浮標拉水面的力道（越大，浮標旁的水面越貼著浮標走；太大會算不穩，要 × WAVE_STEP² < 4） */
    var WAVE_STEP = 1 / 120;                    /* 水面波的計算時間格（秒）：每個畫面會切成幾小格去算，波不會算歪 */
    var VIS = 84, FW = 36;                      /* 浮標「沒放大前」水面以上露出的高度、寬度（px；要跟 css/games/reaction_fishbite.css 裡浮標各部分的尺寸一致） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var FISH = ['吳郭魚', '香魚', '鯉魚', '鱸魚', '鯽魚', '草魚'];      /* 每一關釣到的魚（依關卡輪流） */
    var easeOut = kit.easeOutCubic, easeIO = kit.easeInOutCubic;  /* easeOut：先快後慢的緩動函式；easeIO：慢—快—慢的緩動函式（都來自共用工具箱 kit） */
    /* 浮標往回浮的時候（easeIO 曲線）從 1.0 掉到 BITE_LINE（0.9）要走完回程的多少比例：4u³ ＝ 1 − 0.9 → u ≈ 0.292。
       窗口的結束時間 tEnd 就是「深度剛好掉到 0.9」的那一刻，所以要提早這麼多開始往回浮，畫面上看到的沉沒時間和判定才一致 */
    var U_REC = Math.pow((1 - BITE_LINE) / 4, 1 / 3);
    /* 窗口最短能有多短：浮標沉到 0.9 要 U90 × DESC_S 秒、沉到底要 DESC_S 秒；窗口結束前 U_REC × RECOVER_S 秒（回浮曲線從 1.0 掉到 0.9 要的時間）就得開始往回浮。
       要「先沉到底、才開始回浮」，窗口至少要 (1 − U90) × DESC_S ＋ U_REC × RECOVER_S ＝ 0.14 × 0.464 ＋ 0.292 × 0.35 ≈ 0.167 秒；
       比這個短，畫面上浮標還沒沉到底就浮起來了，跟判定的窗口對不上。所以 windowFor 不會給出比 WINDOW_MIN 更短的窗口。 */
    var U90 = 1 - Math.pow(1 - BITE_LINE, 1 / 3);                                          /* 咬鉤沉下去的曲線（easeOut）走完多少比例時深度剛好是 0.9 */
    var WINDOW_MIN = Math.ceil(((1 - U90) * DESC_S + U_REC * RECOVER_S) * 1000) / 1000;      /* 窗口的下限（秒），約 0.168；windowFor 不會給出更短的窗口 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function windowFor(level) { return Math.max(WINDOW_MIN, Math.round(ramp(level, WINDOW_S) * 1000) / 1000); }
    function r3(x) { return Math.round(x * 1000) / 1000; }
    function pFor(level, pair) { return Math.max(0, Math.min(1, ramp(level, pair))); }          /* 機率：第 1 關 → 到頂，限制在 0～1 */  /* Math.round：四捨五入成整數 */
    function fakeHiFor(level) { return Math.round(ramp(level, FAKE_HI) * 1000) / 1000; }
    function fakesFor(level) { return Math.round(ramp(level, FAKES)); }
    function waveFor(level) { return Math.round(ramp(level, WAVE_PX) * 100) / 100; }
    function fishFor(level) { return FISH[(level - 1) % FISH.length]; }
    /* 做一次輕碰（假沉）：從第 t 秒開始，最深 hi 以內。回傳 { kind:'fake', t, dur（整段多久，含停住）, depth（最深）, shape, keys }。
       shape 'bump'＝一沉就浮（keys 是 null，用 sin² 曲線）；'hold'＝沉到 depth 後停住 FAKE_HOLD 秒再浮起來；
       'double'＝兩段式：先淺淺地沉到 d1（depth 的 0.3～0.6 倍）停住 0.15～0.5 秒，再沉得更深到 depth 停一下，才浮起來。
       keys＝[[相對時間, 深度], …] 的關鍵點，兩點之間用慢—快—慢的曲線（easeIO）接起來，所以停住的那一段是平的。 */
    function makeFake(t, hi, level, rand) {
        var m = kit.randFloat(FAKE_DUR[0], FAKE_DUR[1], rand), D = r3(kit.randFloat(0.6 * hi, hi, rand)), r = rand(), pd = pFor(level, DOUBLE_P), ph = pFor(level, HOLD_P), e = { kind: 'fake', t: r3(t), depth: D }, keys, total;
        if (r < pd) {
            var d1 = D * kit.randFloat(0.3, 0.6, rand), h1 = kit.randFloat(Math.max(0.15, FAKE_HOLD[0]), Math.max(0.15, FAKE_HOLD[1]), rand), h2 = kit.randFloat(FAKE_HOLD[0], FAKE_HOLD[1] * 0.6, rand);
            keys = [[0, 0], [0.3 * m, d1], [0.3 * m + h1, d1], [0.6 * m + h1, D], [0.6 * m + h1 + h2, D], [m + h1 + h2, 0]]; e.shape = 'double';
        } else if (r < pd + ph) {
            var h = kit.randFloat(FAKE_HOLD[0], FAKE_HOLD[1], rand);
            keys = [[0, 0], [0.45 * m, D], [0.45 * m + h, D], [m + h, 0]]; e.shape = 'hold';
        } else { keys = null; e.shape = 'bump'; }
        total = keys ? keys[keys.length - 1][0] : m;
        e.dur = r3(total);
        e.keys = keys ? keys.map(function (k) { return [r3(k[0]), r3(k[1])]; }) : null;
        if (e.keys) e.keys[e.keys.length - 1][0] = e.dur;                       /* 最後一個點的時間＝整段長度（四捨五入之後也一致） */
        return e;
    }
    /* 出一關：{
         level, events（時間表：{ kind:'fake', t, dur, depth, shape, keys } 若干個，最後一個 { kind:'bite', t（開始沉；有前導就是前導開始）, tp（真的往下沉的開始）, d0（那一刻的深度）, desc（從 d0 沉到底要多久）,
           lead（前導：{ depth, a, hold }＝先像輕碰一樣沉到 depth（a 秒）並停住 hold 秒，沒有就是 null）, t90（沉到 0.9 的時間）, tEnd（浮回 0.9 的時間）, rec（開始往回浮）, window }）,
         bite（咬鉤那一筆）, window, wave（水面波浪參數）, fish（魚的名字）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var k = fakesFor(level), hi = fakeHiFor(level), win = windowFor(level), events = [], t = kit.randFloat(FIRST_AT[0], FIRST_AT[1], rand), i;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        for (i = 0; i < k; i++) {
            var f = makeFake(t, hi, level, rand);
            events.push(f);
            t += f.dur + kit.randFloat(GAP[0], GAP[1], rand);
        }
        /* 咬鉤：有前導（假沉變真咬）就先沉到前導的深度 d0 並停住，從 tp 才真的往下沉（從 d0 沉到 1.0，速度跟沒有前導時一樣，所以 desc 隨剩下的距離變短）；
           深度到 0.9 的時間點 t90 是 easeOut 的反函數，窗口＝t90 之後 win 秒 */
        var lead = rand() < pFor(level, SNEAK_P) ? { depth: r3(kit.randFloat(0.6 * hi, hi, rand)), a: r3(kit.randFloat(FAKE_DUR[0], FAKE_DUR[1], rand) * 0.45), hold: r3(kit.randFloat(Math.max(0.1, FAKE_HOLD[0]), Math.max(0.1, FAKE_HOLD[1]), rand)) } : null;
        var d0 = lead ? lead.depth : 0, tp = t + (lead ? lead.a + lead.hold : 0), desc = lead ? Math.max(0.4 * DESC_S, DESC_S * (1 - d0)) : DESC_S;
        var u90 = lead ? 1 - Math.pow((1 - BITE_LINE) / (1 - d0), 1 / 3) : U90, t90 = tp + u90 * desc, tEnd = t90 + win;
        var bite = { kind: 'bite', t: t, tp: tp, d0: d0, desc: desc, lead: lead, t90: t90, tEnd: tEnd, rec: tEnd - U_REC * RECOVER_S, window: win };          /* 咬鉤的時間不四捨五入：畫面（depthAt）和判定（judgeSwipe）要用同一組數字 */
        events.push(bite);
        var wave = { A: waveFor(level), f1: kit.randFloat(0.55, 0.85, rand), f2: kit.randFloat(1.3, 1.9, rand), p1: kit.randFloat(0, 6.28, rand), p2: kit.randFloat(0, 6.28, rand) };
        var q = { level: level, events: events, bite: bite, window: win, wave: wave, fish: fishFor(level), fakes: k, sways: [] };
        /* V1.53 浮標平常不定時的左右傾斜：{ t, dur, deg }，隨機的時間與方向，一直排到整關結束 */
        var horizon = bite.tEnd + RECOVER_S + 1, ts = kit.randFloat(0.2, 1.0, rand);
        while (ts < horizon) {
            var sd = kit.randFloat(SWAY_DUR[0], SWAY_DUR[1], rand);
            q.sways.push({ t: Math.round(ts * 1000) / 1000, dur: Math.round(sd * 1000) / 1000, deg: Math.round(kit.randFloat(SWAY_DEG[0], SWAY_DEG[1], rand) * (rand() < 0.5 ? -1 : 1) * 100) / 100 });
            ts += sd + kit.randFloat(SWAY_GAP[0], SWAY_GAP[1], rand);
        }
        /* 魚來拉的時候（每個動作各一組 lean／drift）：往「跟這一刻平常傾斜相反」的方向快速歪（平常幾乎沒歪就隨機挑一邊），同方向被拉開一小段水平位移 */
        events.forEach(function (e) {
            var idle = swayAt(q, e.t + Math.min(0.15, (e.dur || 0.3) / 2)), sign = Math.abs(idle) > 0.5 ? (idle > 0 ? -1 : 1) : (rand() < 0.5 ? -1 : 1);
            e.lean = Math.round(sign * kit.randFloat(PULL_DEG[0], PULL_DEG[1], rand) * 100) / 100;
            e.drift = Math.round(sign * kit.randFloat(PULL_DRIFT[0], PULL_DRIFT[1], rand) * 100) / 100;
        });
        return q;
    }
    /* 第 t 秒浮標沉下的深度比例（0～1；不含波浪）。輕碰：bump 用 sin² 曲線；hold／double 照 keys 的關鍵點，兩點之間用慢—快—慢（easeIO）接起來，停住的那段是平的。
       咬鉤：有前導就先沉到 d0 並停住，從 tp 起 d0 → 1.0（easeOut，desc 秒），停在最深，rec 起往回浮（在 tEnd 剛好掉到 0.9） */
    function depthAt(q, t) {
        for (var i = 0; i < q.events.length; i++) {
            var e = q.events[i];
            if (e.kind === 'fake') {
                if (t >= e.t && t <= e.t + e.dur) {
                    if (!e.keys) { var s = Math.sin(Math.PI * (t - e.t) / e.dur); return e.depth * s * s; }
                    var x = t - e.t;
                    for (var j = 1; j < e.keys.length; j++) {
                        var a = e.keys[j - 1], b = e.keys[j];
                        if (x <= b[0]) return b[0] <= a[0] ? b[1] : a[1] + (b[1] - a[1]) * easeIO((x - a[0]) / (b[0] - a[0]));
                    }
                    return 0;
                }
            } else {
                if (t >= e.t && t < e.rec) {
                    if (t < e.tp) return t < e.t + e.lead.a ? e.d0 * easeIO((t - e.t) / e.lead.a) : e.d0;                 /* 前導：沉到假沉的深度、停住 */
                    return e.d0 + (1 - e.d0) * easeOut(Math.min(1, (t - e.tp) / e.desc));                                /* 真的往下沉、停在最深 */
                }
                if (t >= e.rec && t < e.rec + RECOVER_S) return 1 - easeIO((t - e.rec) / RECOVER_S);                       /* 往回浮；在 tEnd 剛好掉到 0.9 */
            }
        }
        return 0;
    }
    /* 水面波浪讓浮標上下晃多少 px（往下為正） */
    function waveAt(w, t) { return w.A * (0.65 * Math.sin(6.2832 * w.f1 * t + w.p1) + 0.35 * Math.sin(6.2832 * w.f2 * t + w.p2)); }
    /* 浮標平常的傾斜（度，往右歪為正）：q.sways 每一筆慢慢歪過去再慢慢回正（sin² 的形狀），重疊的就相加 */
    function swayAt(q, t) {
        var a = 0;
        for (var i = 0; i < q.sways.length; i++) {
            var s = q.sways[i];
            if (t >= s.t && t <= s.t + s.dur) { var b = Math.sin(Math.PI * (t - s.t) / s.dur); a += s.deg * b * b; }
        }
        return a;
    }
    /* 第 t 秒正在進行的動作（輕碰或咬鉤）；沒有就回傳 null。咬鉤從開始沉一直算到浮回原位 */
    function eventAt(q, t) {
        for (var i = 0; i < q.events.length; i++) {
            var e = q.events[i], end = e.kind === 'fake' ? e.t + e.dur : e.rec + RECOVER_S;
            if (t >= e.t && t <= end) return e;
        }
        return null;
    }
    /* 魚來拉時的傾斜（度）：動作進行中，往這個動作的 lean 方向歪，歪的程度 ＝ lean × √深度——一往下沉就很快歪過去，浮回來時再回正 */
    function pullTiltAt(q, t) { var e = eventAt(q, t); return e ? e.lean * Math.sqrt(depthAt(q, t)) : 0; }
    /* 魚來拉時浮標被拉向一邊的水平位移（px，往右為正），變化跟傾斜一樣 */
    function driftAt(q, t) { var e = eventAt(q, t); return e ? e.drift * Math.sqrt(depthAt(q, t)) : 0; }
    /* 浮標這一刻的總傾斜（度）：平常的傾斜 ＋ 魚拉的傾斜（兩者方向通常相反，所以被拉的時候會看到「從這邊快速翻到那邊」） */
    function tiltAt(q, t) { return swayAt(q, t) + pullTiltAt(q, t); }
    /* 浮標這一刻的姿勢：dy＝往下多少 px（沉下的深度 × 浮標露出的高度 × 放大倍率 ＋ 水面波浪晃動）、dx＝被魚拉開的水平位移、deg＝傾斜 */
    function poseAt(q, t, scale) {
        var s = scale == null ? FLOAT_SCALE : scale;
        return { dx: driftAt(q, t), dy: depthAt(q, t) * VIS * s + waveAt(q.wave, t), deg: tiltAt(q, t) };
    }
    /* 水面波的來源：浮標在水面上的上下動（水面波浪晃動），加上被魚拉下去時帶著水面凹下去一點（沉下距離 × WAVE_PULL）；限制在 ±WAVE_MAX 內 */
    function sourceAt(q, t, scale) {
        var s = scale == null ? FLOAT_SCALE : scale, v = waveAt(q.wave, t) + WAVE_PULL * depthAt(q, t) * VIS * s;
        return Math.max(-WAVE_MAX, Math.min(WAVE_MAX, v));
    }
    /* 水面的波：把水面切成每隔 WAVE_DX px 一個點（h＝這個點的水面高度 px、往下為正，v＝上下的速度），用一維的波動方程式一格一格往前算：
       每一點的加速度 ＝ 波速² × 跟左右兩邊的高度差 − 阻尼 × 速度。浮標所在的那幾個點（fi）被浮標「帶著動」，波就從那裡往左右兩側傳出去。
       最左、最右兩個點用「吸收邊界」（Mur：邊上的點照「波往外傳」的方式算），波傳到邊緣就直接出去，不會彈回來干擾。 */
    function makeWaves(width, fi) {
        var n = Math.ceil(width / WAVE_DX) + 1, h = [], v = [], w = [], i;
        for (i = 0; i < n; i++) { h.push(0); v.push(0); }
        for (i = -6; i <= 6; i++) w.push(Math.exp(-0.5 * (i / 3) * (i / 3)));      /* 浮標拉水面的力：中間最大、往兩側圓滑地變小（左右各 6 點），水面凹下去是一個平滑的碗，不是一根針 */
        return { n: n, dx: WAVE_DX, h: h, v: v, w: w, fi: fi == null ? Math.round((n - 1) / 2) : fi };
    }
    /* 浮標帶動水面的那一點（像彈簧）：st＝{ x, v }，target＝浮標想讓水面在的位置（sourceAt）；往前算 dt 秒，回傳水面這一點現在的高度。
       慢慢動的時候 x 跟著 target 走；被魚猛拉一下（target 突然變很多）就會像彈簧一樣來回晃幾下再慢慢停——這一晃一晃就是往兩側傳出去的「一圈一圈」水波 */
    function makeSource() { return { x: 0, v: 0 }; }
    function stepSource(st, dt, target) {
        var steps = Math.max(1, Math.ceil(dt / WAVE_STEP)), d = dt / steps, w = 2 * Math.PI * SRC_HZ;
        var lim = 2 * WAVE_MAX;
        for (var k = 0; k < steps; k++) {
            st.v += (w * w * (target - st.x) - 2 * SRC_ZETA * w * st.v) * d; st.x += st.v * d;
            if (st.x > lim) { st.x = lim; if (st.v > 0) st.v = 0; } else if (st.x < -lim) { st.x = -lim; if (st.v < 0) st.v = 0; }   /* 晃得再用力也不超過 ±2 × WAVE_MAX */
        }
        return st.x;
    }
    /* 往前算 dt 秒（切成不超過 WAVE_STEP 的小格）；src＝浮標想讓水面在的高度（px）。浮標附近（左右各 6 點）的水面被一股力拉向 src，
       越靠近浮標拉得越用力（wv.w）；這股力只是「拉」，波照樣可以穿過去。回傳同一個 wv */
    function stepWaves(wv, dt, src) {
        var steps = Math.max(1, Math.ceil(dt / WAVE_STEP)), d = dt / steps, c2 = WAVE_C * WAVE_C / (wv.dx * wv.dx), h = wv.h, v = wv.v, n = wv.n, i, k, lim = 2 * WAVE_MAX;
        var mur = (WAVE_C * d - wv.dx) / (WAVE_C * d + wv.dx);       /* 吸收邊界的係數 */
        for (k = 0; k < steps; k++) {
            var a1 = h[1], aN = h[n - 2], e0 = h[0], eN = h[n - 1];   /* 這一小格開始前，邊上的點與它內側鄰居的高度 */
            for (i = 1; i < n - 1; i++) {
                var jj = i - wv.fi, pull = (jj >= -6 && jj <= 6) ? DRIVE_K * wv.w[jj + 6] * (src - h[i]) : 0;   /* 浮標拉水面的力 */
                v[i] += (c2 * (h[i - 1] - 2 * h[i] + h[i + 1]) - WAVE_DAMP * v[i] + pull) * d;
            }
            for (i = 1; i < n - 1; i++) { h[i] += v[i] * d; if (h[i] > lim) h[i] = lim; else if (h[i] < -lim) h[i] = -lim; }
            h[0] = a1 + mur * (h[1] - e0); h[n - 1] = aN + mur * (h[n - 2] - eN);
        }
        return wv;
    }
    /* 在第 t 秒提竿：'ok'（浮標沉在 0.9 以下、窗口內）｜'early'（太早：輕碰中、還沒咬、或剛開始沉）｜'late'（窗口已經過了） */
    function judgeSwipe(q, t) {
        var b = q.bite;
        if (t >= b.t90 && t <= b.tEnd) return 'ok';
        return t < b.t90 ? 'early' : 'late';
    }
    /* 手指位移 → 是不是「往上滑」（y 向下，所以往上是 dy < 0） */
    function isUpSwipe(dx, dy, minDist) { return -dy >= (minDist == null ? SWIPE_MIN : minDist) && -dy >= Math.abs(dx) * UP_K; }  /* Math.abs：取絕對值（去掉負號） */
    /* 揭曉的折線圖：把 [t0, t1] 這段時間的深度取樣成 n 個點，畫在 w×h 的方塊裡（深度 0 在上、1 在下）；回傳 points 字串 */
    function chartPoints(q, t0, t1, w, h, n) {
        var pts = [];
        for (var i = 0; i <= n; i++) { var t = t0 + (t1 - t0) * i / n; pts.push((w * i / n).toFixed(1) + ',' + (h * depthAt(q, t)).toFixed(1)); }
        return pts.join(' ');
    }
    /* 重播的時間範圍：咬鉤前 REPLAY_PRE 秒 到 窗口結束後 REPLAY_POST 秒 */
    function replayRange(q) { return { t0: Math.max(0, q.bite.t - REPLAY_PRE), t1: q.bite.tEnd + RECOVER_S + REPLAY_POST }; }
    function replayMs(q) { var r = replayRange(q); return Math.round((r.t1 - r.t0) / REPLAY_SPEED * 1000); }
    function whyText(kind, q) {
        if (kind === 'early') return '太早提竿了！浮標還沒整個沉下去，魚只是在試探';
        if (kind === 'late') return '太慢了！浮標沉下去超過 ' + q.window.toFixed(4) + ' 秒，魚吐鉤跑了';
        return '釣到了！是一條' + q.fish;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '釣魚高手！';
        if (n >= 9) return '眼明手快！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '等浮標整個沉下去再提竿！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'fishbite-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關（釣到 ' + S.cleared + ' 條魚）']; },
            setup: setup
        });
    }

    /* 魚（SVG）：身體、尾巴、眼睛、花紋；顏色依魚種編號 0～5 用 CSS 變數 */
    function fishSvg(idx, parent) {
        var svg = kit.svg('svg', { 'class': 'fishbite-fishsvg', viewBox: '0 0 120 70', width: 150, height: 88 }, parent);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        kit.svg('path', { 'class': 'fishbite-tail fishbite-fc' + idx, d: 'M96,35 L118,12 Q112,35 118,58 Z' }, svg);
        kit.svg('ellipse', { 'class': 'fishbite-body fishbite-fc' + idx, cx: 52, cy: 35, rx: 46, ry: 26 }, svg);
        kit.svg('path', { 'class': 'fishbite-belly', d: 'M12,38 Q52,66 92,38 Q52,52 12,38 Z' }, svg);
        kit.svg('path', { 'class': 'fishbite-stripe', d: 'M40,12 Q46,35 40,58 M58,10 Q64,35 58,60' }, svg);
        kit.svg('circle', { 'class': 'fishbite-eye', cx: 20, cy: 29, r: 4 }, svg);
        return svg;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[釣魚提竿] 第 ' + level + ' 關：輕碰 ' + q.fakes + ' 次（深度 ' + q.events.filter(function (e) { return e.kind === 'fake'; }).map(function (e) { return e.depth.toFixed(2); }).join('、') + '）；咬鉤 ' + q.bite.t.toFixed(2) + ' 秒、窗口 ' + q.window.toFixed(2) + ' 秒（' + q.bite.t90.toFixed(2) + '～' + q.bite.tEnd.toFixed(2) + '）');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var waterY = Math.round(H * WATER_AT), S = FLOAT_SCALE, cx = Math.round(W / 2);   /* waterY：水面（沒有波浪時）離畫面上緣多遠；S：浮標放大倍率；cx：浮標中心的 x */
        var field = h('div', { 'class': 'fishbite-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note fishbite-tip', text: level === 1 ? '浮標整個沉下去，就往上滑提竿！' : '整個沉下去才提竿（往上滑）' });
        field.appendChild(tip);
        /* 浮標與釣線：先放，水再蓋在上面（沉下去的部分被水蓋住）。浮標的天線、紅頭、白身體都畫在原本的尺寸，整個用 transform 放大 S 倍、傾斜、移動 */
        var clip = h('div', { 'class': 'fishbite-clip' }); clip.style.height = H + 'px'; field.appendChild(clip);
        var line = kit.svg('svg', { 'class': 'fishbite-lines', width: W, height: H }, clip), rod = kit.svg('line', { 'class': 'fishbite-rodline', x1: W - 14, y1: -6, x2: cx, y2: waterY - VIS * S }, line);
        var fl = h('div', { 'class': 'fishbite-float' }); fl.style.cssText = 'left:0;top:0;width:' + FW + 'px;height:' + (VIS + 90) + 'px;transform-origin:0 0;';
        fl.appendChild(h('div', { 'class': 'fishbite-float__ant' })); fl.appendChild(h('div', { 'class': 'fishbite-float__top' })); fl.appendChild(h('div', { 'class': 'fishbite-float__body' }));
        clip.appendChild(fl);
        /* 水：水面以下的藍色（上緣用 clip-path 照波形剪出來）＋一條白色半透明的水面線（也跟著波動，波形從浮標往左右兩側傳） */
        var water = h('div', { 'class': 'fishbite-water' }); water.style.top = (waterY - 2 * WAVE_MAX - 4) + 'px'; field.appendChild(water);
        var wsvg = kit.svg('svg', { 'class': 'fishbite-wave', width: W, height: H }, field), wline = kit.svg('polyline', { 'class': 'fishbite-wave__line', points: '' }, wsvg);
        var wv = makeWaves(W, Math.round(cx / WAVE_DX)), src = makeSource();
        var info = h('div', { 'class': 'qz-note fishbite-info', text: '' }); info.style.top = '54px'; field.appendChild(info);
        if (level === 1 && kit.once('fishbite.hint')) kit.hintOn(stage, null, { mode: 'drag', x: W / 2, y: H * 0.86, dx: 0, dy: -130, delay: 1200, text: '浮標整個沉下去，就往上滑' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        var phase = 'wait', t0 = performance.now(), down = null, swipeAt = null, replay = null, lastNow = null;  /* performance.now()：高精度的時間（毫秒），計時用 */
        function nowS() { return (performance.now() - t0) / 1000; }
        /* 放浮標：dx＝水平位移、dy＝往下多少 px（相對於水面）、deg＝傾斜；以水面那一點（天線與身體交接處）為軸心，先放大、再傾斜、最後移到位置；釣線跟著連到天線頂端 */
        function setPose(dx, dy, deg) {
            var px = cx + dx, py = waterY + dy, a = deg * Math.PI / 180, L = VIS * S;
            fl.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) rotate(' + deg.toFixed(2) + 'deg) scale(' + S + ') translate(' + (-FW / 2) + 'px,' + (-VIS) + 'px)';
            rod.setAttribute('x2', (px + L * Math.sin(a)).toFixed(1));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            rod.setAttribute('y2', (py - L * Math.cos(a) + 4 * S).toFixed(1));
        }
        /* 畫水面：水的上緣照 wv.h 的波形剪出來，水面線畫在同一條波形上 */
        function drawSurface() {
            var base = 2 * WAVE_MAX + 4, poly = [], pts = [];
            for (var i = 0; i < wv.n; i++) {
                var x = (i * wv.dx).toFixed(1), y = wv.h[i];
                poly.push(x + 'px ' + (base + y).toFixed(1) + 'px'); pts.push(x + ',' + (waterY + y).toFixed(1));
            }
            var cp = 'polygon(' + poly.join(',') + ',' + W + 'px 100%,0 100%)';
            water.style.clipPath = cp; water.style.webkitClipPath = cp;
            wline.setAttribute('points', pts.join(' '));
        }
        /* 畫面上現在該看到的時間：等待中＝經過的時間；揭曉重播中＝重播的時間（0.5 倍慢動作）；釣到了＝null（浮標回原位、水面慢慢平靜） */
        function viewT(now) {
            if (phase === 'wait') return (now - t0) / 1000;
            if (replay) { var p = Math.min(1, (now - replay.r0) / replay.ms); return replay.rg.t0 + (replay.rg.t1 - replay.rg.t0) * p; }
            return null;
        }
        var p0 = poseAt(q, 0); setPose(p0.dx, p0.dy, p0.deg); drawSurface();
        api.my.loop(function (now) {                    /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!stage.isConnected) return false;
            var dt = lastNow == null ? 1 / 60 : Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
            var t = viewT(now);
            if (t == null) { setPose(0, 0, 0); stepWaves(wv, dt, stepSource(src, dt, 0)); }
            else { var p = poseAt(q, t); setPose(p.dx, p.dy, p.deg); stepWaves(wv, dt, stepSource(src, dt, sourceAt(q, t))); }
            drawSurface();
        });
        /* 太慢：窗口結束又過了一點時間還沒提竿 → 魚跑了（用計時器，不靠 rAF） */
        api.after(Math.round((q.bite.tEnd + LATE_GRACE) * 1000), function () { if (phase === 'wait') finish('late', null); });

        /* 提竿＝往上滑 */
        field.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (phase !== 'wait' || api.over || down) return;
            e.preventDefault(); try { field.setPointerCapture(e.pointerId); } catch (err) { }  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            var p = kit.localPt(e, field); down = { id: e.pointerId, x: p.x, y: p.y, fired: false };
        });
        function track(e) {
            if (!down || e.pointerId !== down.id || down.fired || phase !== 'wait') return;
            var p = kit.localPt(e, field);
            if (isUpSwipe(p.x - down.x, p.y - down.y)) { down.fired = true; pull(); }
        }
        field.addEventListener('pointermove', track);
        field.addEventListener('pointerup', function (e) { track(e); if (down && e.pointerId === down.id) down = null; });
        field.addEventListener('pointercancel', function (e) { if (down && e.pointerId === down.id) down = null; });

        function pull() {
            if (phase !== 'wait' || api.over) return;
            var t = nowS(), res = judgeSwipe(q, t);
            swipeAt = t; finish(res, t);
        }
        /* 結果：kind＝'ok'｜'early'｜'late' */
        function finish(kind, t) {
            if (phase !== 'wait') return;
            phase = kind === 'ok' ? 'caught' : 'replay';
            api.stopTimer();
            var why = whyText(kind, q);
            info.textContent = why;                     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (kind === 'ok') {
                /* 魚被提出水面：浮標往上跳、魚從水裡飛出來 */
                info.classList.add('fishbite-info--ok'); Sfx.play('ok');  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                var fish = h('div', { 'class': 'fishbite-fish' }); fish.style.cssText = 'left:' + (cx - 75) + 'px;top:' + (waterY - 40) + 'px;'; fishSvg((level - 1) % FISH.length, fish); field.appendChild(fish);
                api.after(30, function () { fish.classList.add('fishbite-fish--jump'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                kit.flash(stage, true, api.my);         /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
                api.pass({ delay: 2300 });              /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
                return;
            }
            info.classList.add('fishbite-info--bad');
            kit.flash(stage, false, api.my);
            showReplay(kind, t);
            var sneak = q.bite.lead ? '這次是「假沉變真咬」：先沉到 ' + q.bite.lead.depth.toFixed(2) + ' 停了 ' + q.bite.lead.hold.toFixed(2) + ' 秒，才繼續往下沉' : null;
            api.fail({ delay: replayMs(q) + 1500, lines: (sneak ? [why, sneak] : [why]).concat(['咬鉤在第 ' + q.bite.t.toFixed(4) + ' 秒，窗口 ' + q.window.toFixed(4) + ' 秒（' + q.bite.t90.toFixed(4) + '～' + q.bite.tEnd.toFixed(4) + '）' + (t != null ? '；你在第 ' + t.toFixed(4) + ' 秒提竿' : '；你沒有提竿')]) });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 揭曉：折線圖（深度整段時間表）＋咬鉤區＋你提竿的位置＋慢動作重播咬鉤那一段 */
        function showReplay(kind, t) {
            var CW = W - 24, CH = Math.max(80, Math.min(150, H - waterY - 90)), total = q.bite.tEnd + RECOVER_S + 0.6, box = h('div', { 'class': 'fishbite-chart' });
            box.style.cssText = 'left:12px;top:' + (waterY + 8) + 'px;width:' + CW + 'px;height:' + (CH + 56) + 'px;';
            var svg = kit.svg('svg', { 'class': 'fishbite-chart__svg', viewBox: '0 0 ' + CW + ' ' + (CH + 56), width: CW, height: CH + 56 }, box), X = function (s) { return (CW - 8) * s / total + 4; }, Y0 = 26;
            kit.svg('rect', { 'class': 'fishbite-chart__bg', x: 0, y: Y0 - 6, width: CW, height: CH + 12, rx: 10 }, svg);
            kit.svg('rect', { 'class': 'fishbite-chart__bite', x: X(q.bite.t90), y: Y0 - 6, width: Math.max(3, X(q.bite.tEnd) - X(q.bite.t90)), height: CH + 12 }, svg);
            kit.svg('line', { 'class': 'fishbite-chart__line90', x1: 4, x2: CW - 4, y1: Y0 + CH * BITE_LINE, y2: Y0 + CH * BITE_LINE }, svg);
            var pl = kit.svg('polyline', { 'class': 'fishbite-chart__curve', points: chartPoints(q, 0, total, CW - 8, CH, 240).split(' ').map(function (pp) { var a = pp.split(','); return (+a[0] + 4).toFixed(1) + ',' + (+a[1] + Y0).toFixed(1); }).join(' ') }, svg);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var lb = kit.svg('text', { 'class': 'fishbite-chart__lab fishbite-chart__lab--bite', x: Math.min(CW - 70, Math.max(70, X(q.bite.t90))), y: 18 }, svg); lb.textContent = '咬鉤';
            var l9 = kit.svg('text', { 'class': 'fishbite-chart__lab fishbite-chart__lab--ln', x: 8, y: Y0 + CH * BITE_LINE - 6 }, svg); l9.textContent = '沉到這條線以下才算咬鉤';
            if (t != null) {
                var sx = X(Math.min(t, total)); kit.svg('line', { 'class': 'fishbite-chart__you', x1: sx, x2: sx, y1: Y0 - 6, y2: Y0 + CH + 6 }, svg);
                var yl = kit.svg('text', { 'class': 'fishbite-chart__lab fishbite-chart__lab--you', x: Math.min(CW - 90, Math.max(90, sx)), y: Y0 + CH + 36 }, svg); yl.textContent = '你提竿 ' + t.toFixed(4) + ' 秒';
            }
            var cur = kit.svg('line', { 'class': 'fishbite-chart__cur', x1: 0, x2: 0, y1: Y0 - 6, y2: Y0 + CH + 6 }, svg);
            field.appendChild(box);
            /* 慢動作重播：浮標（連同水面的波）由主迴圈照 viewT 放，這裡只負責讓游標跟著走 */
            var rg = replayRange(q), ms = replayMs(q), r0 = performance.now();
            replay = { rg: rg, ms: ms, r0: r0 };
            api.my.loop(function (now) {
                var tv = viewT(now), x = X(Math.min(tv, total)); cur.setAttribute('x1', x); cur.setAttribute('x2', x);
                if (now - r0 >= ms) return false;
            });
        }
        /* 驗證用：自己算好時間，在咬鉤窗口裡提竿／在第一次輕碰的最深處（沒有輕碰就在剛開始時）提竿；可以重複呼叫 */
        var armed = false;
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (armed || phase !== 'wait') return; armed = true; api.after(Math.max(0, Math.round((q.bite.t90 + Math.min(0.1, q.window / 2) - nowS()) * 1000)), pull); };
        api.wrong = function () { if (armed || phase !== 'wait') return; armed = true; var e = q.events[0], at = e.kind === 'fake' ? e.t + e.dur / 2 : Math.max(0.1, e.t - 0.5); api.after(Math.max(0, Math.round((at - nowS()) * 1000)), pull); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '釣魚提竿',
        rule: '浮標浮在水面上。魚會來輕輕碰（**浮標沉一下，不要提**）：有時一沉就浮，有時沉下去停住不動，有時先沉一點、再沉得更深，但最後都會浮起來。**真的咬鉤時浮標會整個沉下去**——那一刻在畫面上**往上滑提竿**！小心：有的魚會先假裝試探、停住，然後不浮起來，直接繼續往下沉。太早提魚就跑了，沉下去太久才提魚也跑了。每關釣一條魚。越後面，假動作越多樣、輕碰沉得越深（越來越像咬鉤）、咬鉤的時間越短（' + WINDOW_S[0] + ' → ' + WINDOW_S[1] + ' 秒）、水面的波浪也越大。失敗時會用折線圖和慢動作告訴你魚是什麼時候咬鉤的。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            windowFor: windowFor, makeFake: makeFake, fakeHiFor: fakeHiFor, fakesFor: fakesFor, waveFor: waveFor, fishFor: fishFor, makeLevel: makeLevel, depthAt: depthAt, waveAt: waveAt, swayAt: swayAt, eventAt: eventAt, pullTiltAt: pullTiltAt, driftAt: driftAt, tiltAt: tiltAt, poseAt: poseAt, sourceAt: sourceAt, makeWaves: makeWaves, stepWaves: stepWaves, makeSource: makeSource, stepSource: stepSource, judgeSwipe: judgeSwipe, isUpSwipe: isUpSwipe, chartPoints: chartPoints, replayRange: replayRange, replayMs: replayMs, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, WINDOW_S: WINDOW_S, WINDOW_MIN: WINDOW_MIN, U90: U90, FAKE_HOLD: FAKE_HOLD, HOLD_P: HOLD_P, DOUBLE_P: DOUBLE_P, SNEAK_P: SNEAK_P, FAKE_HI: FAKE_HI, FAKES: FAKES, WAVE_PX: WAVE_PX, BITE_LINE: BITE_LINE, FAKE_DUR: FAKE_DUR, U_REC: U_REC, DESC_S: DESC_S, RECOVER_S: RECOVER_S, FIRST_AT: FIRST_AT, GAP: GAP, LATE_GRACE: LATE_GRACE, SWIPE_MIN: SWIPE_MIN, WATER_AT: WATER_AT, FLOAT_SCALE: FLOAT_SCALE, SWAY_DEG: SWAY_DEG, SWAY_DUR: SWAY_DUR, SWAY_GAP: SWAY_GAP, PULL_DEG: PULL_DEG, PULL_DRIFT: PULL_DRIFT, WAVE_C: WAVE_C, WAVE_DAMP: WAVE_DAMP, WAVE_MAX: WAVE_MAX, WAVE_PULL: WAVE_PULL, SRC_HZ: SRC_HZ, SRC_ZETA: SRC_ZETA, WAVE_DX: WAVE_DX, WAVE_STEP: WAVE_STEP, DRIVE_K: DRIVE_K, VIS: VIS, FW: FW, FISH: FISH, MAX_LEVEL: MAX_LEVEL, REPLAY_SPEED: REPLAY_SPEED
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
