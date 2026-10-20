/* ═══════════════════════════════════════════════════════════════════
   reaction_mergechar.js — 秒反應・左右合字（企劃 201）
   左邊一欄、右邊一欄，各有一些「偏旁」。先點左邊的一塊、再點右邊的一塊，把它們連成一條線：
   能合成一個字（例如 氵＋工＝江）就連出一條「綠線」並合成那個字；不能合成就連出一條「紅線」（扣一條命）。
   連出五條綠線就過關，進下一關。關卡制，有 3 條命，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 字庫 COMBO_TEXT：約 200 組「左偏旁＋右偏旁＝字」，全部是常用字、左右結構。每組三個字：左、右、合成的字。
   · 出題（規範 Q1、Q2：答案唯一）：先挑 5 組「要連的」（左偏旁各不相同、右偏旁各不相同），再加上幾塊「干擾的偏旁」
     （前期沒有，後期每欄多 1～3 塊），然後把畫面上「所有左×右的組合」都用字庫檢查一遍：
     只有那 5 組能合成字，其他全部不能 → 所以每一條綠線都是對的，不會有「連對了卻卡死」的情況。
     （字庫以外的冷僻字，不算能合成：這是字庫的限制，字庫已盡量收齊常用偏旁的組合。）
   · 難度線性：每欄的偏旁數 5 → 8 塊（第 1～3 關 5 塊、第 4 關起 6 塊、第 10 關起 7 塊、第 20 關起 8 塊）；
     每關限時 45 秒 → 26 秒（RAMP_LEVELS 關走到頂）。
   · 連線：先點左（或先點右）選取，再點另一邊就連線；選了又想換，點同一邊的另一塊即可改選。
   · 揭曉：失敗時，還沒連的那幾組用灰線連出來並標出合成的字。
   · V1.34（玩家意見：左邊的偏旁有時能跟右邊兩塊都合成字，這可以接受，但配對的當下不要就顯示答錯）：
       - 判定改成「只要左右兩塊真的能合成一個字就算對」，不一定要跟出題時設計的那一組一樣（merge() 同時查 COMBO_TEXT 與補充字庫 EXTRA_TEXT）；
       - 玩家連了另一組也是字的，不會當場判錯；要等到「剩下還沒連的偏旁，任何一組都合成不了字」（isStuck）才判失敗，
         並用 stuckLines 說明原因（哪一組是玩家自己連的字、用掉了誰、原本應該怎麼連、剩下哪幾塊配不起來）；
       - 真的不能合成字的配對（紅線）照舊扣一條命。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'mergechar';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var NEED = 5;                               /* 要連出幾條綠線才過關（企劃指定 5 條） */
    var COL_STEPS = [[1, 5], [4, 6], [10, 7], [20, 8]];     /* [從第幾關起, 每欄有幾塊偏旁] */
    var LIVES = 3;                              /* 命（連出紅線扣一條） */
    var TIME_S = [45, 26];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var MAX_LEVEL = 60;
    var TRIES = 400;                            /* 出一關最多試幾次（「一塊一塊挑」的做法幾乎第一次就成功，400 次是保險） */
    /* 字庫：每組三個字「左偏旁、右偏旁、合成的字」，用空白隔開 */
    var COMBO_TEXT = [
        '氵工江 氵可河 氵每海 氵羊洋 氵青清 氵胡湖 氵皮波 氵永泳 氵同洞 氵包泡 氵主注 氵由油 氵舌活 氵良浪 氵先洗 氵昆混 氵合洽 氵曷渴 氵木沐 氵立泣 氵少沙 氵古沽 氵也池 氵十汁 氵白泊 氵中沖 氵各洛',
        '亻木休 亻言信 亻也他 亻門們 亻可何 亻主住 亻乍作 亻十什 亻中仲 亻古估 亻士仕 亻固個 亻象像 亻呆保 亻立位 亻半伴 亻火伙 亻方仿 亻白伯 亻青倩 亻每侮 亻子仔',
        '扌丁打 扌巴把 扌包抱 扌由抽 扌非排 扌合拾 扌是提 扌白拍 扌安按 扌隹推 扌空控 扌爰援 扌舌括 扌立拉 扌采採 扌巨拒 扌辰振 扌旨指 扌斤折 扌爪抓 扌末抹 扌皮披 扌主拄 扌工扛',
        '口巴吧 口馬嗎 口乞吃 口昌唱 口未味 口及吸 口加咖 口非啡 口牙呀 口合哈 口尼呢 口包咆 口可呵 口各咯 口古咕 口十叶 口少吵',
        '日月明 日青晴 日寺時 日央映',
        '女子好 女馬媽 女也她 女未妹 女市姊 女台始 女某媒 女良娘 女且姐 女家嫁 女昏婚 女少妙 女古姑 女方妨',
        '火考烤 火共烘 火登燈 火息熄 火勺灼 火包炮 火主炷',
        '金艮銀 金同銅 金十針 金昔錯 金易錫 金少鈔',
        '言吾語 言者諸 言射謝 言十計 言青請 言舌話 言周調 言果課 言兌說 言永詠 言志誌 言己記 言午許 言司詞 言方訪 言丁訂 言斥訴',
        '糸工紅 糸合給 糸田細 糸文紋 糸氏紙 糸己紀 糸及級 糸屯純 糸責績 糸宗綜 糸泉線 糸勺約 糸吉結 糸會繪',
        '月半胖 月土肚 月要腰 月包胞 月各胳 月旨脂 月复腹 月匈胸 月方肪',
        '土也地 土成城 土者堵 土方坊 土平坪 土皮坡 土亢坑 土立垃',
        '石皮破 石馬碼 石卑碑 石更硬 石少砂 石包砲',
        '禾火秋 禾斗科 禾重種 禾多移 禾少秒 禾口和',
        '木木林 木目相 木寸村 木交校 木兆桃 木反板 木公松 木每梅 木亥核 木卯柳 木主柱 木古枯 木白柏 木各格 木土杜 木吾梧 木婁樓 木東棟 木艮根 木可柯 木同桐',
        '王里理 王求球 王見現 王皮玻 王離璃',
        '忄青情 忄夬快 忄亡忙 忄白怕 忄曼慢 忄鬼愧 忄中忡',
        '彳艮很 彳走徒 彳主往 彳皮彼',
        '礻申神 礻且祖 礻兄祝',
        '衤皮被 衤君裙',
        '目艮眼 目青睛 目民眠 目垂睡',
        '貝才財 貝占貼 貝者賭 貝共貢',
        '食反飯 食官館 食包飽 食我餓 食余餘 食交餃',
        '車交較 車專轉 車巠輕 車俞輸',
        '足艮跟 足包跑 足各路 足易踢 足夸跨 足皮跛',
        '魚羊鮮 魚包鮑',
        '馬各駱 馬主駐 馬交駁 馬也馳',
        '子系孫 子亥孩',
        '山支岐',
        '弓長張 弓單彈',
        '犭苗貓 犭句狗 犭良狼 犭且狙',
        '米分粉 米青精 米且粗 米胡糊 米立粒 米唐糖',
        '酉己配'
    ].join(' ').split(/\s+/).filter(function (s) { return s; });
    /* ═══ 「也是真的字」的補充字庫（V1.34 玩家意見）═══
       玩家說：左邊的偏旁有時候可以跟右邊的兩個偏旁都合成字（不是唯一解），這是可以接受的，但配對的當下不要就判錯。
       所以除了上面「出題用」的 COMBO_TEXT，再收一份「也能合成字、只是不拿來當答案」的 EXTRA_TEXT（同樣的格式：左、右、合成的字），
       merge() 兩份都查：玩家連出任何一組真的字，都算對（綠線）。
       出題時（makeLevel）也用兩份一起檢查，盡量不讓畫面上出現「還有別組也能合成字」的情況；字庫以外的冷僻字沒辦法完全排除，
       萬一玩家連了「另一組也是字的」，遊戲照樣算對，只在「最後剩下的偏旁配不起來」時才判失敗並說明原因（見 stuckLines）。 */
    var EXTRA_TEXT = [
        '氵丁汀 氵斤沂 氵末沫 氵及汲 氵台治 氵且沮 氵共洪 氵文汶 氵屯沌 氵責漬 氵兆洮 氵曼漫 氵余涂 氵占沾 氵兄況 氵夬決 氵民泯 氵分汾 氵唐溏 氵巠涇 氵里浬 氵亢沆 氵匈洶 氵者渚 氵央泱 氵尼泥 氵隹淮 氵半泮 氵固涸 氵吾浯',
        '亻昌倡 亻非俳 亻加伽 亻寺侍 亻家傢 亻共供 亻昔借 亻司伺 亻田佃 亻責債 亻卑俾 亻更便 亻多侈 亻寸付 亻交佼 亻兆佻 亻婁僂 亻里俚 亻鬼傀 亻申伸 亻占佔 亻官倌 亻我俄 亻專傳 亻俞偷 亻系係 亻支伎 亻長倀 亻句佝 亻分份 亻吉佶 亻亢伉',
        '扌寺持 扌反扳 扌半拌 扌斥拆 扌少抄 扌台抬 扌考拷 扌共拱 扌昔措 扌吾捂 扌吉拮 扌平抨 扌亢抗 扌斗抖 扌口扣 扌兆挑 扌婁摟 扌夬抉 扌申抻 扌民抿 扌垂捶 扌占拈 扌夸挎 扌支技 扌苗描 扌句拘 扌分扮 扌唐搪',
        '口曷喝 口交咬 口亥咳 口丁叮 口卑啤 口羊咩 口隹唯 口且咀 口共哄 口登噔 口艮哏 口吾唔 口周啁 口責嘖 口吉咭 口土吐 口平呯 口亢吭 口更哽 口多哆 口寸吋 口婁嘍 口里哩 口申呻 口垂唾 口我哦 口俞喻 口支吱 口苗喵 口分吩',
        '日乍昨 日每晦 日斤昕 日兆晁',
        '女青婧 女由妯 女爰媛 女辰娠 女昌娼 女尼妮 女勺妁 女己妃 女卑婢 女交姣 女兆姚 女里娌 女我娥 女支妓 女單嬋',
        '火某煤 火各烙 火乍炸 火巨炬 火吾焐 火文炆 火巠烴 火爰煖',
        '金丁釘 金交鉸 金包鉋 金各鉻 金古鈷 金由鈾 金先銑 金白鉑 金固錮 金巴鈀 金隹錐 金巨鉅 金尼鈮 金考銬 金登鐙 金田鈿 金屯鈍 金亢鈧 金重鍾 金口釦 金兆銚 金反鈑 金卯鉚 金婁鏤 金里鋰 金垂錘 金苗錨',
        '言亥該 言每誨 言寺詩 言可訶 言古詁 言乍詐 言非誹 言隹誰 言巨詎 言旨詣 言乞訖 言牙訝 言某謀 言且詛 言工訌 言吉詰 言成誠 言平評 言寸討 言公訟 言夬訣 言俞諭 言夸誇',
        '糸由紬 糸少紗 糸各絡 糸半絆 糸方紡 糸非緋 糸隹維 糸爰緩 糸且組 糸者緒 糸周綢 糸交絞 糸婁縷 糸申紳 糸巠經 糸分紛',
        '月巴肥 月非腓 月台胎 月兌脫 月卑脾 月重腫 月寸肘 月夸胯 月支肢 月長脹',
        '土反坂 土是堤 土隹堆 土及圾 土可坷 土夸垮 土艮垠 土己圮 土里埋 土唐塘',
        '石曷碣 石各硌 石乍砟 石平砰 石申砷 石專磚',
        '禾隹稚 禾家稼 禾央秧 禾且租 禾兌稅',
        '木工杠 木由柚 木少杪 木乍柞 木象橡 木方枋 木巴杷 木安桉 木隹椎 木斤析 木加枷 木牙枒 木市柿 木台枱 木考栲 木共栱 木登橙 木勺杓 木果棵 木己杞 木午杵 木宗棕 木吉桔 木會檜 木平枰 木亢杭 木更梗 木鬼槐 木才材 木官棺 木支枝 木句枸',
        '王胡瑚 王馬瑪 王文玫 王可珂 王良琅 王白珀 王爰瑗 王加珈 王宗琮 王夬玦 王鬼瑰 王俞瑜',
        '忄每悔 忄艮恨 忄寺恃 忄同恫 忄舌恬 忄合恰 忄各恪 忄乍怍 忄非悱 忄隹惟 忄斤忻 忄長悵 忄尼怩 忄央怏 忄台怡 忄昔惜 忄易惕 忄吾悟 忄兌悅 忄寸忖 忄俞愉',
        '彳寺待 彳巠徑 彳复復 彳方彷 彳羊徉 彳非徘',
        '礻斤祈 礻土社 礻也祂 礻司祠 礻乍祚 礻見視',
        '衤包袍 衤由袖 衤合袷 衤半袢 衤夬袂 衤里裡 衤复複',
        '目丁盯 目少眇 目登瞪 目者睹 目兆眺',
        '貝反販 貝長賬 貝各賂 貝辰賑 貝易賜 貝亥賅',
        '食胡餬 食台飴 食司飼 食曼饅',
        '車可軻 車由軸 車各輅 車斤斬',
        '足兆跳 足采踩 足良踉 足巨距 足加跏 足台跆 足登蹬 足勺趵 足宗蹤 足交跤 足俞踰',
        '魚里鯉 魚更鯁 魚青鯖 魚周鯛 魚安鮟 魚台鮐 魚同鮦',
        '馬亥駭 馬台駘 馬隹騅 馬且駔 馬句駒',
        '山同峒 山由岫 山空崆 山乞屹 山寺峙',
        '弓也弛',
        '犭交狡 犭胡猢 犭艮狠 犭包狍 犭昌猖',
        '米良粮 米占粘 米白粕 米巴粑',
        '酉各酪 酉昔醋 酉勺酌 酉每酶 酉同酮 酉分酚 酉乍酢'
    ].join(' ').split(/\s+/).filter(function (s) { return s; });
    var EXTRA_COMBOS = EXTRA_TEXT.map(function (t) { return { l: t[0], r: t[1], ch: t[2] }; });
    var COMBOS = COMBO_TEXT.map(function (t) { return { l: t[0], r: t[1], ch: t[2] }; });
    var BY_PAIR = {};
    EXTRA_COMBOS.forEach(function (c) { if (!BY_PAIR[c.l + c.r]) BY_PAIR[c.l + c.r] = c.ch; });       /* 先放補充字庫，再讓出題字庫蓋過去（兩邊同一組時以出題字庫為準） */
    COMBOS.forEach(function (c) { BY_PAIR[c.l + c.r] = c.ch; });
    var LEFTS = [];
    COMBOS.forEach(function (c) { if (LEFTS.indexOf(c.l) < 0) LEFTS.push(c.l); });
    var RIGHTS = [];
    COMBOS.forEach(function (c) { if (RIGHTS.indexOf(c.r) < 0) RIGHTS.push(c.r); });

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function colsFor(level) { var c = COL_STEPS[0][1]; COL_STEPS.forEach(function (s) { if (level >= s[0]) c = s[1]; }); return c; }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    /* 左偏旁 l 加右偏旁 r 能合成什麼字？不能就回傳 null */
    function merge(l, r) { return BY_PAIR[l + r] || null; }
    /* 畫面上這些左、右偏旁之間，所有能合成字的組合（驗證用） */
    function edgesOf(L, R) {
        var out = [];
        L.forEach(function (l) { R.forEach(function (r) { var ch = merge(l, r); if (ch) out.push({ l: l, r: r, ch: ch }); }); });
        return out;
    }
    /* 出一關：{ L（左欄由上到下的偏旁）, R（右欄）, pairs（要連的 5 組 {l,r,ch}）, decoyL, decoyR }
       做法（V1.34 改成「一塊一塊挑、每挑一塊就檢查不會湊出第二個字」，比原本「整個畫面抽好再檢查」快很多——補充字庫變大之後，
       整個畫面剛好沒有第二組字的機率很低，原本要試上千次）：
       ① 從出題字庫 COMBOS 一組一組挑 NEED 組，新挑的這一組，它的左偏旁不能跟已挑的任何右偏旁合成字、它的右偏旁也不能跟已挑的任何左偏旁合成字
          （merge 同時查補充字庫），而且左右偏旁都不能跟已挑的重複，也不能同時出現在左右兩欄；
       ② 干擾的左偏旁：不能跟 NEED 個右偏旁合成字；
       ③ 干擾的右偏旁：不能跟所有左偏旁（含干擾的）合成字。
       這樣畫面上所有「左×右」裡，能合成字的剛好只有那 NEED 組（最後還會用 edgesOf 再驗一次）。 */
    var forced = null;          /* 測試用：forceNext(q) 讓「下一關」直接用這份題目（瀏覽器驗證「卡住」這種正常出題不會出現的畫面） */
    function makeLevel(level, rand) {
        if (forced) { var f = forced; forced = null; return f; }
        rand = rand || Math.random;
        var n = colsFor(level), extra = n - NEED;
        function taken(t, usedL, usedR) { return !!(usedL[t] || usedR[t]); }
        for (var tr = 0; tr < TRIES; tr++) {
            var pairs = [], usedL = {}, usedR = {}, ok = true, i;
            for (i = 0; i < NEED && ok; i++) {
                var opts = COMBOS.filter(function (c) {
                    if (taken(c.l, usedL, usedR) || taken(c.r, usedL, usedR) || c.l === c.r) return false;
                    return pairs.every(function (p) { return !merge(c.l, p.r) && !merge(p.l, c.r); });
                });
                if (!opts.length) { ok = false; break; }
                var c = kit.pick(opts, rand);
                pairs.push(c); usedL[c.l] = true; usedR[c.r] = true;
            }
            if (!ok) continue;
            var poolL = LEFTS.filter(function (l) { return !taken(l, usedL, usedR) && pairs.every(function (p) { return !merge(l, p.r); }); });
            if (poolL.length < extra) continue;
            var decoyL = kit.sample(poolL, extra, rand);
            decoyL.forEach(function (l) { usedL[l] = true; });
            var lefts = pairs.map(function (p) { return p.l; }).concat(decoyL);
            var poolR = RIGHTS.filter(function (r) { return !taken(r, usedL, usedR) && lefts.every(function (l) { return !merge(l, r); }); });
            if (poolR.length < extra) continue;
            var decoyR = kit.sample(poolR, extra, rand);
            var L = lefts, R = pairs.map(function (p) { return p.r; }).concat(decoyR);
            var edges = edgesOf(L, R);
            if (edges.length !== NEED) continue;
            return { L: kit.shuffle(L, rand), R: kit.shuffle(R, rand), pairs: pairs, decoyL: decoyL, decoyR: decoyR };
        }
        var fb = [{ l: '氵', r: '工', ch: '江' }, { l: '亻', r: '言', ch: '信' }, { l: '扌', r: '丁', ch: '打' }, { l: '口', r: '巴', ch: '吧' }, { l: '日', r: '月', ch: '明' }];
        return { L: fb.map(function (p) { return p.l; }), R: fb.map(function (p) { return p.r; }), pairs: fb, decoyL: [], decoyR: [] };
    }
    /* 還沒連的偏旁（usedL／usedR 是已經連掉的左、右偏旁文字的集合）之間，還有沒有任何一組能合成字？沒有＝卡住了 */
    function isStuck(L, R, usedL, usedR) {
        for (var i = 0; i < L.length; i++) {
            if (usedL[L[i]]) continue;
            for (var j = 0; j < R.length; j++) if (!usedR[R[j]] && merge(L[i], R[j])) return false;
        }
        return true;
    }
    /* 卡住時的說明（顯示在結算頁）：conns＝玩家已經連對的 [{ l, r, ch }]。
       三行：① 剩下哪幾塊配不起來；② 原因——玩家連的哪幾組「是字，但不是出題設計的那一組」，用掉了誰；③ 原本的連法 */
    function stuckLines(q, conns) {
        var usedL = {}, usedR = {};
        conns.forEach(function (c) { usedL[c.l] = true; usedR[c.r] = true; });
        var restL = q.L.filter(function (t) { return !usedL[t]; }), restR = q.R.filter(function (t) { return !usedR[t]; });
        function txt(p) { return p.l + '＋' + p.r + '＝' + p.ch; }
        function isDesigned(c) { return q.pairs.some(function (p) { return p.l === c.l && p.r === c.r; }); }
        var detours = conns.filter(function (c) { return !isDesigned(c); });
        var lines = ['剩下的「' + restL.join('、') + '」和「' + restR.join('、') + '」，任何一組都合成不了字'];
        if (detours.length) lines.push('你連的「' + detours.map(txt).join('」「') + '」確實是字，但它用掉了別組需要的偏旁，後面就配不起來了');
        lines.push('出題時設計的連法：' + q.pairs.map(txt).join('　'));
        return lines;
    }
    function rating(n) {
        if (n >= 25) return '造字大師！';
        if (n >= 15) return '偏旁高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多想想偏旁能組成什麼字，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, lives: LIVES,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[左右合字] 第 ' + level + ' 關：左 ' + q.L.join('') + '，右 ' + q.R.join('') + '；要連的：' + q.pairs.map(function (p) { return p.l + '＋' + p.r + '＝' + p.ch; }).join('、') + '；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var n = q.L.length, top = 66, gap = 8, bottom = 16;
        var ph = Math.min(88, Math.floor((H - top - bottom - (n - 1) * gap) / n)), pw = 124;
        var svg = kit.svg('svg', { 'class': 'mgc-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gLines = kit.svg('g', {}, svg);
        var tip = h('div', { 'class': 'qz-note mgc-tip', text: '先點左邊一塊，再點右邊一塊' });
        var prog = h('div', { 'class': 'mgc-prog', text: '已連對 0／' + NEED });
        stage.appendChild(tip); stage.appendChild(prog);
        function mk(side, text, i) {
            var b = h('button', { 'class': 'mgc-piece mgc-piece--' + side, text: text });
            b.style.width = pw + 'px'; b.style.height = ph + 'px';
            b.style.fontSize = Math.min(58, Math.floor(ph * 0.68)) + 'px'; b.style.lineHeight = '1';         /* 欄越擠、字越小，字才不會超出方塊 */
            b.style.left = (side === 'L' ? 8 : W - pw - 8) + 'px'; b.style.top = (top + i * (ph + gap)) + 'px';
            kit.onTap(b, function () { tapPiece(side, i); });
            stage.appendChild(b);
            return b;
        }
        var LP = q.L.map(function (t, i) { return mk('L', t, i); }), RP = q.R.map(function (t, i) { return mk('R', t, i); });
        function center(side, i) { return { x: side === 'L' ? 8 + pw : W - pw - 8, y: top + i * (ph + gap) + ph / 2 }; }
        var sel = null, done = 0, locked = {}, busy = false, conns = [], usedL = {}, usedR = {};
        function setSel(s) {
            if (sel) (sel.side === 'L' ? LP : RP)[sel.i].classList.remove('mgc-piece--sel');
            sel = s;
            if (sel) (sel.side === 'L' ? LP : RP)[sel.i].classList.add('mgc-piece--sel');
        }
        function line(li, ri, cls) {
            var a = center('L', li), b = center('R', ri);
            return kit.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'mgc-line ' + cls }, gLines);
        }
        function badge(li, ri, ch, cls) {
            var a = center('L', li), b = center('R', ri);
            var t = h('div', { 'class': 'mgc-badge ' + cls, text: ch });
            t.style.left = ((a.x + b.x) / 2 - 36) + 'px'; t.style.top = ((a.y + b.y) / 2 - 36) + 'px';
            stage.appendChild(t);
            return t;
        }
        function tapPiece(side, i) {
            if (api.over || busy || locked[side + i]) return;
            Sfx.play('click');
            if (!sel || sel.side === side) { setSel(sel && sel.side === side && sel.i === i ? null : { side: side, i: i }); return; }
            var li = side === 'L' ? i : sel.i, ri = side === 'R' ? i : sel.i;
            setSel(null);
            connect(li, ri);
        }
        function connect(li, ri) {
            var ch = merge(q.L[li], q.R[ri]);
            if (ch) {
                /* V1.34：只要真的能合成字就算對（不管是不是出題設計的那一組），當場不判錯 */
                locked['L' + li] = locked['R' + ri] = true;
                usedL[q.L[li]] = true; usedR[q.R[ri]] = true; conns.push({ l: q.L[li], r: q.R[ri], ch: ch });
                LP[li].classList.add('mgc-piece--done'); RP[ri].classList.add('mgc-piece--done');
                line(li, ri, 'mgc-line--ok'); badge(li, ri, ch, 'mgc-badge--ok');
                Sfx.play('ok');
                done++; prog.textContent = '已連對 ' + done + '／' + NEED;
                if (done >= NEED) { kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); }
                else if (isStuck(q.L, q.R, usedL, usedR)) {
                    /* 剩下的偏旁任何一組都合成不了字：到這裡才宣布失敗，並說明原因（原本設計的連法用灰線標出來） */
                    busy = true; showAll(); kit.flash(stage, false, api.my);
                    tip.textContent = '剩下的偏旁配不起來了！';
                    api.fail({ delay: 3200, lines: stuckLines(q, conns) });
                }
            } else {
                busy = true;
                var ln = line(li, ri, 'mgc-line--bad');
                LP[li].classList.add('mgc-piece--bad'); RP[ri].classList.add('mgc-piece--bad');
                kit.flash(stage, false, api.my);
                var left = api.lose({ lines: ['「' + q.L[li] + '」和「' + q.R[ri] + '」不能合成字', '要連的是：' + q.pairs.map(function (p) { return p.l + '＋' + p.r + '＝' + p.ch; }).join('　')] });
                if (left <= 0) { showAll(); return; }
                api.after(700, function () { ln.remove(); LP[li].classList.remove('mgc-piece--bad'); RP[ri].classList.remove('mgc-piece--bad'); busy = false; });
            }
        }
        /* 揭曉：還沒連的組用灰線連出來並標出合成的字 */
        function showAll() {
            q.pairs.forEach(function (p) {
                var li = q.L.indexOf(p.l), ri = q.R.indexOf(p.r);
                if (locked['L' + li] || locked['R' + ri]) return;
                line(li, ri, 'mgc-line--show'); badge(li, ri, p.ch, 'mgc-badge--show');
            });
        }
        api.timer(timeMs(level), function () {
            if (api.over) return;
            showAll();
            api.fail({ delay: 2600, lines: ['時間到！', '要連的是：' + q.pairs.map(function (p) { return p.l + '＋' + p.r + '＝' + p.ch; }).join('　')] });
        });
        if (level === 1 && kit.once('mergechar.hint')) kit.hintOn(stage, LP[q.L.indexOf(q.pairs[0].l)], { mode: 'tap', delay: 700, text: '請依序點擊左右兩塊偏旁' });
        api.solve = function () {
            if (busy) return;
            q.pairs.forEach(function (p) {
                var li = q.L.indexOf(p.l), ri = q.R.indexOf(p.r);
                if (!locked['L' + li] && !api.over) connect(li, ri);
            });
        };
        api.wrong = function () {
            if (busy) return;
            /* 故意連一組不能合成的：左邊第一塊（要連的）配右邊「別組的」偏旁；一次就用掉所有命，直接進結算 */
            var p0 = q.pairs[0], p1 = q.pairs[1];
            var li = q.L.indexOf(p0.l), ri = q.R.indexOf(p1.r);
            for (var k = 0; k < LIVES + 1 && !api.over; k++) { busy = false; connect(li, ri); }
        };
    }

    var G = {
        id: ID,
        name: '左右合字',
        rule: '左右兩欄各有一些偏旁。先點左邊一塊、再點右邊一塊，把它們連起來：**只要能合成一個字就連出綠線**（不一定要跟我想的一樣），**不能合成就連出紅線**（扣一條命，共 3 條命）。**連出五條綠線就過關**；連到最後，如果剩下的偏旁都配不起來，就失敗。越後面，偏旁越多、限時越短！',
        mount: mount,
        score: SCORE,
        test: {
            COMBOS: COMBOS, EXTRA_COMBOS: EXTRA_COMBOS, BY_PAIR: BY_PAIR, LEFTS: LEFTS, RIGHTS: RIGHTS, colsFor: colsFor, timeMs: timeMs, merge: merge, edgesOf: edgesOf, makeLevel: makeLevel, forceNext: function (q) { forced = q; }, isStuck: isStuck, stuckLines: stuckLines, rating: rating, TRIES: TRIES,
            RAMP_LEVELS: RAMP_LEVELS, NEED: NEED, LIVES: LIVES, MAX_LEVEL: MAX_LEVEL, TIME_S: TIME_S
        }
    };
    Reaction.register(G);
})();
