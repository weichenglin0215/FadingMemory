/* ═══════════════════════════════════════════════════════════════════
   reaction_core.js — 秒反應的共用引擎（不含任何遊戲內容）
   ───────────────────────────────────────────────────────────────────
   · 三個小遊戲各自在自己的檔案裡呼叫 Reaction.register({...})；
     本檔案只提供登記清單、最佳紀錄存取（js/reaction.js 才負責畫面／隨機挑選）。
   · 新增小遊戲：新檔案呼叫 Reaction.register，並加到 boot.js 的 reaction 清單
     （reaction_core.js 之後、reaction.js 之前）。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。 */
    'use strict';

    /* GAMES：所有小遊戲註冊進來的清單（陣列），每個元素長相是
       { id, name, rule, mount(container, ctx) }：
       · id／name：給 ?game= 參數比對、標題列顯示用。
       · rule：玩法說明文字，reaction.js 開場彈窗直接顯示。
       · mount(container, ctx)：真正開始這個遊戲的函式，container 是要把畫面畫進去
         的 DOM 元素（reaction.html 的 #screen），ctx 是給遊戲用的小工具物件
         （目前只有 ctx.setMeta(text) 可以改標題列右側文字）。
       這個檔案本身不知道、也不在乎 GAMES 裡實際有哪些遊戲——三款遊戲各自的檔案
       （reaction_speed.js／reaction_drop.js／reaction_spot.js）在自己檔案最下面
       呼叫 Reaction.register({...}) 把自己登記進來，彼此互不相依。 */
    var GAMES = [];
    var Reaction = {};

    Reaction.register = function (game) { GAMES.push(game); };
    Reaction.list = function () { return GAMES; };
    /* Reaction.current：「目前這一頁正在玩的是哪一款遊戲」（js/reaction.js 在決定要玩哪一款之後設定）。
       kit.result 靠它知道成績要送到哪一款遊戲的世界排行榜；沒設定（例如 Node 測試）就不會送。 */
    Reaction.current = null;
    /* Reaction.onLeave：玩家按左上角「返回」時，js/reaction.js 會先呼叫它——回傳 true 表示遊戲已經自己處理了（例如自由解題的遊戲
       先結算並顯示結算卡片），這次不要離開頁面；沒設定、或回傳其他值就直接離開。kit.run 的 o.leaveSettle 會設定它。 */
    Reaction.onLeave = null;
    /* V1.57.0（玩家意見：玩到一半有事、按「返回」離開，剛剛的最高紀錄就沒送上世界排行榜，不公平）：
       Reaction.pendingBest：{ id, val }——這一頁剛刷新了個人最佳、但還沒有「結算」（結算彈窗 kit.result 會清掉它、順便送排行榜）。
         闖關遊戲每過一關就 setBest 一次，所以玩到一半它就有值；按「返回」時 js/reaction.js 會問 kit.settleOnLeave：有機會進前 30 名就先結算（跳出恭喜彈窗、寫入紀錄）再離開。
       Reaction.leaveScore：遊戲自己登記的函式，回傳「這一局目前的成績」（沒有成績回傳 null）——給「結算前不會先 setBest」的遊戲用（只在結算時才記最佳的那種）。
       Reaction.leaveCard：因為按「返回」而跳出的結算卡片（遊戲晚一步才跳出自己的結算時，kit.result 看到它還在就不再疊第二張）。 */
    Reaction.pendingBest = null;
    Reaction.leaveScore = null;
    Reaction.leaveCard = null;

    /* 最佳紀錄用 localStorage 存，key 用 'fm.reaction.best.' + 遊戲 id 區分
       （例如 'fm.reaction.best.drop'），每款遊戲各自獨立不會互相覆蓋。 */
    Reaction.bestKey = function (id) { return 'fm.reaction.best.' + id; };
    Reaction.getBest = function (id) { return UI.store.get(Reaction.bestKey(id), null); };  /* UI.store.get／set：讀寫 localStorage（關掉瀏覽器也會記住的資料） */
    /* better(新值, 舊最佳) → true 表示新值更好；回傳這次是否刷新了紀錄。
       刻意把「新紀錄要怎麼比較」交給呼叫端傳進來的 better 函式，而不是寫死
       「數字越大越好」：因為「神準落下」是分數越高越好，但如果之後哪款遊戲是
       「時間越短越好」，這個共用函式完全不用改，呼叫端自己傳一個反過來比較的
       函式就行了。 */
    Reaction.setBest = function (id, val, better) {
        var b = Reaction.getBest(id);                   /* Reaction.getBest／setBest：讀／寫這款遊戲的個人最佳紀錄（存在手機的 localStorage） */
        var isNew = b == null || better(val, b);
        if (isNew) {
            UI.store.set(Reaction.bestKey(id), val);
            /* V1.35.0：做個記號「這個最佳紀錄是現行版本寫的（單位正確）」——只有帶記號的才會同步到帳號（見 js/identity.js），
               也不會再被下面的 migrateBest 當成舊單位的紀錄去換算。 */
            UI.store.set(Reaction.bestKey(id) + '.sync', true);
            Reaction.pendingBest = { id: id, val: val };      /* 還沒結算送排行榜（kit.result 會清掉；按「返回」時 kit.settleOnLeave 會看這個） */
            if (global.Identity && global.Identity.noteBest) global.Identity.noteBest(id);
        }
        return isNew;
    };

    /* 遊戲的「成績單位或精度改版」時用：把舊版存下來的最佳紀錄換算成新版的數字，而且只換算一次。
       例如零秒出手原本存的是「毫秒整數」（123），現在改存「秒、小數 4 位」（0.1237），
       如果不換算，舊的 123 會被當成 123 秒，畫面上會出現怪怪的「最佳差 123.0000 秒」。
       做法：用一個旗標（舊 key 後面加 .v2）記住「已經換算過」，之後再呼叫就什麼都不做。
       convert(舊值) 回傳新值；舊值不存在（沒玩過）就只立旗標。
       tag：旗標的後綴，預設 '.v2'。同一款遊戲的紀錄又改了第二次（例如掛畫從「五回合平均」改成「單回合」，
       舊紀錄不能比，要清掉：convert 回傳 null），就換一個新的 tag（例如 '.single'），不然舊旗標已經立了，第二次換算會被跳過。 */
    Reaction.migrateBest = function (id, convert, tag) {
        var flag = Reaction.bestKey(id) + (tag || '.v2');
        if (UI.store.get(flag, false)) return;
        /* V1.35.0：最佳紀錄是從帳號同步下來的（或已確認是現行單位，見 setBest 的 .sync 記號）：它本來就是新單位，
           不能再換算一次（否則會把「同步來的好成績」換成亂七八糟的數字，或被「清掉舊紀錄」的遷移刪掉）。 */
        if (UI.store.get(Reaction.bestKey(id) + '.sync', false)) { UI.store.set(flag, true); return; }
        var b = Reaction.getBest(id);
        if (b != null) UI.store.set(Reaction.bestKey(id), convert(b));
        UI.store.set(flag, true);
    };

    global.Reaction = Reaction;
})(window);
