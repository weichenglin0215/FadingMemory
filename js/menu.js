/* ═══ menu.js — 入口畫面（index.html） ═══
   · 「明明還記得...」「秒反應」兩個按鈕不再直接導覽或亂數挑選，會先彈出挑選彈窗：
       - 主軸彈窗（3×2 小彈窗）：玩家自己選要練習的主軸，還沒做出來的格子顯示「構想中」（不可點）。
       - 遊戲彈窗（V1.23.0 起「全螢幕」）：左上角有「返回」；中間是 3 欄的遊戲格子，可以用手指或滑鼠
         上下拖曳捲動（帶慣性，見 js/scroller.js）；最下面是分類頁籤（全部／最近／記憶／視覺／反應／數字／
         邏輯／手感／目測），頁籤文字是直式排列，取代以前的「上一頁／下一頁」。
     彈窗做法跟 js/share.js 的 QR Code 彈窗同一套：裝在 #stage 裡才會跟著整體縮放、第一次打開才建。
   · V1.25.0：遊戲格子的名稱下面多一排「五星評價」的平均星數（js/rating.js）；打開遊戲彈窗時，如果這位玩家在某些遊戲
     被別人超越（世界前 30 名），會自動跳出「阿嬤都比你厲害」彈窗（彈窗公版 Dlg.open，見下面 checkPopup）。
   · V1.39.0：每次都跳「阿嬤都比你厲害」太有壓力又單調，改成三種輪流：阿嬤都比你厲害／來都來了，快開一局（沒玩過、很久沒玩的）／
     從從容容、游刃有餘（最擅長的）。本機記錄玩過哪些遊戲與日期（js/plays.js）。
   · 選主軸：quiz.html?theme=<id>（js/quiz_gen.js 的 QuizGen.session() 已支援）。
   · 選遊戲：reaction.html?game=<id>（js/reaction.js 讀這個參數指定要玩哪一個）。
   · 遊戲頁左上角的「返回」會回到 index.html?games=1：進選單就直接打開遊戲列表（玩家通常是想換一款），不用再按「秒反應」。 */

/* 【新手導讀】整個檔案用 (function () { ... })(); 包起來，叫做「立即執行函式」(IIFE)：
   裡面宣告的變數（THEME_CELLS、GAME_CELLS...）只在這個範圍內有效，不會變成全域變數，
   所以不會跟其他 .js 檔案裡的同名變數撞在一起。 */
(function () {
    /* 'use strict' 是「嚴格模式」：打錯變數名稱、用了不安全的寫法時，瀏覽器會直接報錯，
       而不是默默讓程式帶著錯誤繼續跑，比較容易找到 bug。 */
    'use strict';

    /* UI.h 是 js/ui.js 提供的「建立 HTML 元素」小工具，h('div', {class:'x'}, [子元素...]) 等於
       document.createElement('div') 再設定屬性、塞入子元素。把它存成短短的 h，後面寫起來比較省事。 */
    var h = UI.h;

    /* var 是宣告變數；[ ... ] 是「陣列」(一排資料)，{ ... } 是「物件」(有名字的資料欄位：id、name)。 */
    /* 主軸六格（3×2）的位置＝陣列順序（左上→右上，再左下→右下）；null＝「構想中」佔位格 */
    var THEME_CELLS = [
        { id: 'birthday', name: '生日' },
        { id: 'travel', name: '旅遊' },
        { id: 'health', name: '看病' },
        { id: 'dining', name: '聚餐' },
        null,
        null
    ];

    /* ═══ 小遊戲清單 ═══
       想新增一款遊戲，只要在 GAME_CELLS 裡加一行 { id, name, cat, img }，選單就會自動多一格，不用改下面任何程式。
         · id   要跟 js/reaction_<id>.js 裡 Reaction.register({ id: ... }) 的 id 一樣，點下去才會跳到 reaction.html?game=<id>；
         · name 格子下方的名稱，★最多 5 個字（格子寬度只放得下 5 個字；test/reaction/t_menu.js 會檢查）；
                要跟遊戲檔案裡的 name、資料庫 MF_games 的名稱一致；
         · cat  屬於哪一個分類頁籤（下面 GAME_TABS 裡 id 為 memory／visual／… 的那幾個），一款遊戲只放一個分類；
         · img  縮圖路徑（img/reaction/<id>.png，由 node test/reaction/make_icons.mjs 自動拍）；
                檔案不存在時會自動改顯示「印章」（名字第一個字，見 gameCell）。
       順序＝「全部」頁籤裡出現的順序，也是各分類頁籤裡的順序。 */
    /* 分類頁籤（由左到右）。all＝全部、recent＝最近玩過的（依玩的先後，不看 cat）；其餘七個是遊戲分類：
         記憶＝先記住再回想；視覺＝用眼睛觀察、找不同、辨識；反應＝抓時機、拚手速；數字＝計算、數感；
         邏輯＝推理、解謎；手感＝拖曳、畫線、控制力道的操作；目測＝不給數字、憑感覺估量（重量、面積、距離、數量）。 */
    var GAME_TABS = [
        { id: 'all', name: '全部' },
        { id: 'recent', name: '最近' },
        { id: 'memory', name: '記憶' },
        { id: 'visual', name: '視覺' },
        { id: 'reaction', name: '反應' },
        { id: 'number', name: '數字' },
        { id: 'logic', name: '邏輯' },
        { id: 'hand', name: '手感' },
        { id: 'guess', name: '目測' }
    ];
    var GAME_CELLS = [
        { id: 'rainbow', name: '七彩陷阱', cat: 'reaction', img: 'img/reaction/rainbow.png' },
        { id: 'speed', name: '零秒出手', cat: 'reaction', img: 'img/reaction/speed.png' },
        { id: 'impossible', name: '不可能任務', cat: 'reaction', img: 'img/reaction/impossible.png' },
        { id: 'shapes', name: '形形色色', cat: 'visual', img: 'img/reaction/shapes.png' },
        { id: 'racefirst', name: '誰先衝線', cat: 'visual', img: 'img/reaction/racefirst.png' },
        { id: 'shapegrid', name: '形色不相鄰', cat: 'logic', img: 'img/reaction/shapegrid.png' },
        { id: 'hexcolor', name: '六角著色', cat: 'logic', img: 'img/reaction/hexcolor.png' },
        { id: 'spot', name: '大家來找碴', cat: 'visual', img: 'img/reaction/spot.png' },
        { id: 'huesort', name: '色票排隊', cat: 'visual', img: 'img/reaction/huesort.png' },
        { id: 'kinetic', name: '動態視力', cat: 'visual', img: 'img/reaction/kinetic.png' },
        { id: 'groupphoto', name: '大合照', cat: 'reaction', img: 'img/reaction/groupphoto.png' },
        { id: 'fishbite', name: '釣魚提竿', cat: 'reaction', img: 'img/reaction/fishbite.png' },
        { id: 'matchcolor', name: '色不異空', cat: 'visual', img: 'img/reaction/matchcolor.png' },
        { id: 'colorrecall', name: '記色調色', cat: 'visual', img: 'img/reaction/colorrecall.png' },
        { id: 'mixcolor', name: '混出什麼色', cat: 'visual', img: 'img/reaction/mixcolor.png' },
        { id: 'tissue', name: '抽光衛生紙', cat: 'hand', img: 'img/reaction/tissue.png' },
        { id: 'scallion', name: '切蔥花', cat: 'hand', img: 'img/reaction/scallion.png' },
        { id: 'pour', name: '倒到八分滿', cat: 'guess', img: 'img/reaction/pour.png' },
        { id: 'milktea', name: '奶茶調色', cat: 'guess', img: 'img/reaction/milktea.png' },
        { id: 'layerdrink', name: '照樣調一杯', cat: 'memory', img: 'img/reaction/layerdrink.png' },
        { id: 'coinsort', name: '零錢入筒', cat: 'reaction', img: 'img/reaction/coinsort.png' },
        { id: 'coins', name: '零錢分類', cat: 'number', img: 'img/reaction/coins.png' },
        { id: 'pendulum', name: '六點鐘方向', cat: 'reaction', img: 'img/reaction/pendulum.png' },
        { id: 'landolt', name: 'E視力檢查', cat: 'visual', img: 'img/reaction/landolt.png' },
        { id: 'fadee', name: '淡到看不見', cat: 'visual', img: 'img/reaction/fadee.png' },
        { id: 'drop', name: '神準落下', cat: 'reaction', img: 'img/reaction/drop.png' },
        { id: 'cups', name: '球在哪杯', cat: 'visual', img: 'img/reaction/cups.png' },
        { id: 'chicks', name: '找回小雞', cat: 'memory', img: 'img/reaction/chicks.png' },
        { id: 'illusion', name: '錯覺大師', cat: 'visual', img: 'img/reaction/illusion.png' },
        { id: 'diff', name: '哪裡怪怪的', cat: 'visual', img: 'img/reaction/diff.png' },
        { id: 'candy', name: '幾顆糖', cat: 'guess', img: 'img/reaction/candy.png' },
        { id: 'bread', name: '秤麵包重量', cat: 'guess', img: 'img/reaction/bread.png' },
        { id: 'numline', name: '數線落點', cat: 'number', img: 'img/reaction/numline.png' },
        { id: 'curves', name: '誰先到？', cat: 'guess', img: 'img/reaction/curves.png' },
        { id: 'rps', name: '猜拳必贏', cat: 'reaction', img: 'img/reaction/rps.png' },
        { id: 'balloon', name: '吹氣球', cat: 'hand', img: 'img/reaction/balloon.png' },
        { id: 'skyshot', name: '砲打飛機', cat: 'reaction', img: 'img/reaction/skyshot.png' },
        { id: 'forestpeek', name: '草叢找動物', cat: 'reaction', img: 'img/reaction/forestpeek.png' },
        { id: 'rocketland', name: '火箭回收', cat: 'hand', img: 'img/reaction/rocketland.png' },
        { id: 'bubblespray', name: '泡泡掃射', cat: 'reaction', img: 'img/reaction/bubblespray.png' },
        { id: 'emojisort', name: 'emoji選', cat: 'visual', img: 'img/reaction/emojisort.png' },
        { id: 'price', name: '價格陷阱', cat: 'number', img: 'img/reaction/price.png' },
        { id: 'heartbeat', name: '心跳複製', cat: 'reaction', img: 'img/reaction/heartbeat.png' },
        { id: 'sticks', name: '落下棍子', cat: 'reaction', img: 'img/reaction/sticks.png' },
        { id: 'schulte', name: '數字方陣', cat: 'visual', img: 'img/reaction/schulte.png' },
        { id: 'timestable', name: '乘法表抓錯', cat: 'number', img: 'img/reaction/timestable.png' },
        { id: 'same', name: '相同嗎？', cat: 'memory', img: 'img/reaction/same.png' },
        { id: 'backnum', name: '倒背數字', cat: 'memory', img: 'img/reaction/backnum.png' },
        { id: 'setclock', name: '撥時鐘', cat: 'hand', img: 'img/reaction/setclock.png' },
        { id: 'timeafter', name: '幾點幾分後', cat: 'number', img: 'img/reaction/timeafter.png' },
        { id: 'tearcal', name: '撕日曆', cat: 'number', img: 'img/reaction/tearcal.png' },
        { id: 'weekday', name: '推星期幾', cat: 'number', img: 'img/reaction/weekday.png' },
        { id: 'expiry', name: '保存期限', cat: 'number', img: 'img/reaction/expiry.png' },
        { id: 'pillbox', name: '分藥盒', cat: 'memory', img: 'img/reaction/pillbox.png' },
        { id: 'fridge', name: '冰箱歸位', cat: 'logic', img: 'img/reaction/fridge.png' },
        { id: 'hangpic', name: '掛畫', cat: 'hand', img: 'img/reaction/hangpic.png' },
        { id: 'stamp', name: '心在正中央', cat: 'hand', img: 'img/reaction/stamp.png' },
        { id: 'mirror', name: '左右顛倒', cat: 'hand', img: 'img/reaction/mirror.png' },
        { id: 'witness', name: '目擊證人', cat: 'memory', img: 'img/reaction/witness.png' },
        { id: 'halfchar', name: '半邊字', cat: 'visual', img: 'img/reaction/halfchar.png' },
        { id: 'glyphspin', name: '鏡中旋轉字', cat: 'visual', img: 'img/reaction/glyphspin.png' },
        { id: 'clearer', name: '越看越清楚', cat: 'visual', img: 'img/reaction/clearer.png' },
        { id: 'alignchar', name: '對準才看到', cat: 'visual', img: 'img/reaction/alignchar.png' },
        { id: 'flashlight', name: '手電筒猜圖', cat: 'visual', img: 'img/reaction/flashlight.png' },
        { id: 'seenchars', name: '看過的字', cat: 'memory', img: 'img/reaction/seenchars.png' },
        { id: 'doorslit', name: '門縫偷看', cat: 'visual', img: 'img/reaction/doorslit.png' },
        { id: 'stars', name: '找星座', cat: 'visual', img: 'img/reaction/stars.png' },
        { id: 'mergechar', name: '左右合字', cat: 'logic', img: 'img/reaction/mergechar.png' },
        { id: 'followme', name: '照著走', cat: 'memory', img: 'img/reaction/followme.png' },
        { id: 'bounce', name: '球會跑去哪', cat: 'guess', img: 'img/reaction/bounce.png' },
        { id: 'cake', name: '分蛋糕', cat: 'guess', img: 'img/reaction/cake.png' },
        { id: 'seven', name: '逢七過', cat: 'number', img: 'img/reaction/seven.png' },
        { id: 'teacher', name: '老師說', cat: 'reaction', img: 'img/reaction/teacher.png' },
        { id: 'flags', name: '舉旗子', cat: 'reaction', img: 'img/reaction/flags.png' },
        { id: 'cardslap', name: '心臟病', cat: 'reaction', img: 'img/reaction/cardslap.png' },
        { id: 'pipes', name: '接水管', cat: 'logic', img: 'img/reaction/pipes.png' },
        { id: 'carpet', name: '鋪地毯', cat: 'logic', img: 'img/reaction/carpet.png' },
        { id: 'wirelink', name: '接電線', cat: 'logic', img: 'img/reaction/wirelink.png' },
        { id: 'checkers', name: '跳棋跳最遠', cat: 'logic', img: 'img/reaction/checkers.png' },
        { id: 'lightsout', name: '關燈', cat: 'logic', img: 'img/reaction/lightsout.png' },
        { id: 'lights', name: '點燈記憶', cat: 'memory', img: 'img/reaction/lights.png' },
        { id: 'pattern', name: '解鎖圖案', cat: 'memory', img: 'img/reaction/pattern.png' },
        { id: 'ghostleg', name: '鬼腳圖', cat: 'guess', img: 'img/reaction/ghostleg.png' },
        { id: 'ghostleg2', name: '鬼腳圖減一', cat: 'guess', img: 'img/reaction/ghostleg2.png' },
        { id: 'euler', name: '能一筆畫嗎', cat: 'logic', img: 'img/reaction/euler.png' },
        { id: 'seq', name: '猜下一個', cat: 'logic', img: 'img/reaction/seq.png' },
        { id: 'polyrhythm', name: '左右不同拍', cat: 'reaction', img: 'img/reaction/polyrhythm.png' },
        { id: 'area', name: '面積一樣大', cat: 'guess', img: 'img/reaction/area.png' },
        { id: 'halfvol', name: '容量一半', cat: 'guess', img: 'img/reaction/halfvol.png' },
        { id: 'blindcircle', name: '盲畫一個圓', cat: 'hand', img: 'img/reaction/blindcircle.png' },
        { id: 'samelen', name: '畫一樣長', cat: 'hand', img: 'img/reaction/samelen.png' },
        { id: 'rightangle', name: '畫成直角', cat: 'hand', img: 'img/reaction/rightangle.png' },
        { id: 'mathcheck', name: '算式對不對', cat: 'number', img: 'img/reaction/mathcheck.png' },
        { id: 'fracduel', name: '分數大對決', cat: 'number', img: 'img/reaction/fracduel.png' },
        { id: 'primetrap', name: '質數陷阱', cat: 'number', img: 'img/reaction/primetrap.png' },
        { id: 'sum100', name: '兩張成百', cat: 'number', img: 'img/reaction/sum100.png' },
        { id: 'triple100', name: '三張成百', cat: 'number', img: 'img/reaction/triple100.png' },
        { id: 'maxexpr', name: '拼出最大數', cat: 'number', img: 'img/reaction/maxexpr.png' },
        { id: 'oddsock', name: '落單的襪子', cat: 'visual', img: 'img/reaction/oddsock.png' },
        { id: 'twinsock', name: '雙胞胎襪子', cat: 'visual', img: 'img/reaction/twinsock.png' },
        { id: 'basket', name: '菜籃總價', cat: 'number', img: 'img/reaction/basket.png' },
        { id: 'passersby', name: '路人走過', cat: 'memory', img: 'img/reaction/passersby.png' },
        { id: 'seenit', name: '這個看過嗎', cat: 'memory', img: 'img/reaction/seenit.png' },
        { id: 'whofirst', name: '誰先亮', cat: 'visual', img: 'img/reaction/whofirst.png' },
        { id: 'watchoff', name: '哪支錶不準', cat: 'visual', img: 'img/reaction/watchoff.png' },
        { id: 'handsmeet', name: '兩針重疊', cat: 'reaction', img: 'img/reaction/handsmeet.png' },
        { id: 'stackup', name: '重心疊疊樂', cat: 'hand', img: 'img/reaction/stackup.png' },
        { id: 'bridge', name: '搭一座橋', cat: 'reaction', img: 'img/reaction/bridge.png' },
        { id: 'halfcrowd', name: '一半的人', cat: 'guess', img: 'img/reaction/halfcrowd.png' },
        { id: 'sneakmove', name: '誰在偷偷動', cat: 'visual', img: 'img/reaction/sneakmove.png' },
        { id: 'catroad', name: '貓咪走山路', cat: 'hand', img: 'img/reaction/catroad.png' },
        { id: 'copycurve', name: '照抄曲線', cat: 'hand', img: 'img/reaction/copycurve.png' },
        { id: 'isequal', name: '等不等於', cat: 'number', img: 'img/reaction/isequal.png' },
        { id: 'orderops', name: '先乘除', cat: 'number', img: 'img/reaction/orderops.png' },
        { id: 'remainder', name: '求餘數', cat: 'number', img: 'img/reaction/remainder.png' },
        { id: 'hiddendigit', name: '遮住的數字', cat: 'number', img: 'img/reaction/hiddendigit.png' },
        { id: 'wrongline', name: '哪一行算錯', cat: 'number', img: 'img/reaction/wrongline.png' },
        { id: 'fillop', name: '挑加減乘除', cat: 'number', img: 'img/reaction/fillop.png' },
        { id: 'farpair', name: '哪對離最遠', cat: 'guess', img: 'img/reaction/farpair.png' },
        { id: 'dicechange', name: '骰子少一點', cat: 'memory', img: 'img/reaction/dicechange.png' },
        { id: 'whosaid', name: '誰說的', cat: 'memory', img: 'img/reaction/whosaid.png' },
        { id: 'tapback', name: '倒著點', cat: 'memory', img: 'img/reaction/tapback.png' },
        { id: 'nthshape', name: '第幾個出現', cat: 'memory', img: 'img/reaction/nthshape.png' },
        { id: 'spingap', name: '穿過旋轉縫', cat: 'reaction', img: 'img/reaction/spingap.png' },
        { id: 'sudokuone', name: '數獨猜一格', cat: 'logic', img: 'img/reaction/sudokuone.png' },
        { id: 'sudoku4', name: '數獨4', cat: 'logic', img: 'img/reaction/sudoku4.png' },
        { id: 'sudoku6e', name: '數獨6入門', cat: 'logic', img: 'img/reaction/sudoku6e.png' },
        { id: 'sudoku6m', name: '數獨6中階', cat: 'logic', img: 'img/reaction/sudoku6m.png' },
        { id: 'sudoku9e', name: '數獨9入門', cat: 'logic', img: 'img/reaction/sudoku9e.png' },
        { id: 'sudoku9m', name: '數獨9中階', cat: 'logic', img: 'img/reaction/sudoku9m.png' },
        { id: 'sudoku9h', name: '數獨9高階', cat: 'logic', img: 'img/reaction/sudoku9h.png' },
        { id: 'sandwich', name: '夾心數獨', cat: 'logic', img: 'img/reaction/sandwich.png' },
        { id: 'chequeamt', name: '支票金額', cat: 'number', img: 'img/reaction/chequeamt.png' },
        { id: 'spinpick', name: '轉盤停哪格', cat: 'guess', img: 'img/reaction/spinpick.png' },
        { id: 'boxstack', name: '疊箱子', cat: 'logic', img: 'img/reaction/boxstack.png' },
        { id: 'mahjong3', name: '缺哪一張', cat: 'logic', img: 'img/reaction/mahjong3.png' },
        { id: 'reversi', name: '翻最多棋', cat: 'logic', img: 'img/reaction/reversi.png' },
        { id: 'gomoku', name: '堵住五子', cat: 'logic', img: 'img/reaction/gomoku.png' },
        { id: 'swapeven', name: '換一張就平', cat: 'number', img: 'img/reaction/swapeven.png' },
        { id: 'gearmark', name: '齒輪對記號', cat: 'hand', img: 'img/reaction/gearmark.png' },
        { id: 'seesaw', name: '蹺蹺板比重', cat: 'logic', img: 'img/reaction/seesaw.png' },
        { id: 'findsquare', name: '找正方形', cat: 'visual', img: 'img/reaction/findsquare.png' },
        { id: 'gaspump', name: '加到五百', cat: 'number', img: 'img/reaction/gaspump.png' },
        { id: 'rotary', name: '轉盤電話', cat: 'memory', img: 'img/reaction/rotary.png' },
        { id: 'menuslice', name: '切菜單上的', cat: 'reaction', img: 'img/reaction/menuslice.png' },
        { id: 'inkword', name: '字的顏色', cat: 'memory', img: 'img/reaction/inkword.png' },
        { id: 'calendar', name: '記行事曆', cat: 'memory', img: 'img/reaction/calendar.png' },
        { id: 'slicechar', name: '切字', cat: 'reaction', img: 'img/reaction/slicechar.png' },
        { id: 'ordercut', name: '照號切水果', cat: 'reaction', img: 'img/reaction/ordercut.png' },
        { id: 'butterfly', name: '蝴蝶不對稱', cat: 'visual', img: 'img/reaction/butterfly.png' },
        { id: 'danmaku', name: '彈幕找字', cat: 'visual', img: 'img/reaction/danmaku.png' },
        { id: 'windblow', name: '大風吹', cat: 'memory', img: 'img/reaction/windblow.png' },
        { id: 'pearls', name: '吸珍珠', cat: 'reaction', img: 'img/reaction/pearls.png' },
        { id: 'fishtoy', name: '釣魚玩具', cat: 'reaction', img: 'img/reaction/fishtoy.png' },
        { id: 'countbills', name: '數鈔票', cat: 'number', img: 'img/reaction/countbills.png' },
        { id: 'pinwheel', name: '轉風車', cat: 'hand', img: 'img/reaction/pinwheel.png' },
        { id: 'dishes', name: '洗盤子', cat: 'visual', img: 'img/reaction/dishes.png' },
        { id: 'beans', name: '挑豆子', cat: 'visual', img: 'img/reaction/beans.png' },
        { id: 'minus7', name: '一路減七', cat: 'number', img: 'img/reaction/minus7.png' },
        { id: 'sushi', name: '迴轉壽司', cat: 'number', img: 'img/reaction/sushi.png' },
        { id: 'change', name: '找錢', cat: 'number', img: 'img/reaction/change.png' },
        { id: 'discount', name: '打了幾折', cat: 'number', img: 'img/reaction/discount.png' },
        { id: 'timepair', name: '時間連連看', cat: 'logic', img: 'img/reaction/timepair.png' },
        { id: 'eyebrow', name: '畫眉毛', cat: 'hand', img: 'img/reaction/eyebrow.png' },
        { id: 'dough', name: '擀水餃皮', cat: 'hand', img: 'img/reaction/dough.png' },
        { id: 'takuzu', name: '黑白不連三', cat: 'logic', img: 'img/reaction/takuzu.png' },
        { id: 'sumdel', name: '刪數湊和', cat: 'number', img: 'img/reaction/sumdel.png' },
        { id: 'magicsq', name: '魔方陣', cat: 'number', img: 'img/reaction/magicsq.png' },
        { id: 'nim', name: '取火柴', cat: 'logic', img: 'img/reaction/nim.png' },
        { id: 'fifteen', name: '搶十五', cat: 'number', img: 'img/reaction/fifteen.png' },
        { id: 'tianji', name: '田忌賽馬', cat: 'number', img: 'img/reaction/tianji.png' },
        { id: 'flipten', name: '翻牌湊十', cat: 'memory', img: 'img/reaction/flipten.png' },
        { id: 'piggybank', name: '撲滿有多少', cat: 'number', img: 'img/reaction/piggybank.png' },
        { id: 'fruitstock', name: '水果進出貨', cat: 'number', img: 'img/reaction/fruitstock.png' },
        { id: 'babyscale', name: '抱著量體重', cat: 'number', img: 'img/reaction/babyscale.png' },
        { id: 'timetable', name: '時刻表補字', cat: 'number', img: 'img/reaction/timetable.png' },
        { id: 'twobags', name: '兩袋一樣重', cat: 'guess', img: 'img/reaction/twobags.png' },
        { id: 'fastblink', name: '誰閃得快', cat: 'visual', img: 'img/reaction/fastblink.png' },
        { id: 'oneway', name: '單行道', cat: 'logic', img: 'img/reaction/oneway.png' },
        { id: 'dualtask', name: '一心二用', cat: 'reaction', img: 'img/reaction/dualtask.png' },
        { id: 'paint', name: '刷油漆', cat: 'hand', img: 'img/reaction/paint.png' },
        { id: 'scratch', name: '刮刮樂推理', cat: 'logic', img: 'img/reaction/scratch.png' },
        { id: 'inout', name: '圈內圈外', cat: 'visual', img: 'img/reaction/inout.png' },
        { id: 'swipecopy', name: '反著滑', cat: 'reaction', img: 'img/reaction/swipecopy.png' },
        { id: 'knockcount', name: '敲幾下', cat: 'memory', img: 'img/reaction/knockcount.png' },
        { id: 'homerun', name: '全壘打', cat: 'reaction', img: 'img/reaction/homerun.png' },
        { id: 'invoice', name: '對發票', cat: 'number', img: 'img/reaction/invoice.png' }

    ];
    /* 用 id 快速找到那一款（recent 頁籤只存 id，顯示時要靠它換回完整資料） */
    var gameById = {};
    GAME_CELLS.forEach(function (c) { gameById[c.id] = c; });  /* forEach：對陣列的每個元素各做一次 */

    /* function 是「函式」：把一段會重複使用的程式取個名字。soonCell 負責做出一個「構想中」的灰色格子。 */
    /* 「構想中」佔位格（主軸彈窗用）：cls 參數是 'theme'，拼出對應的 class 名稱（theme-cell--soon），
       disabled 屬性讓這個按鈕看起來能按、但實際點不了也不會有 hover/active 效果。 */
    function soonCell(cls) {
        return h('button', { 'class': cls + '-cell ' + cls + '-cell--soon', attrs: { disabled: 'disabled' } }, [
            h('span', { 'class': cls + '-cell__soon', text: '構想中' })
        ]);
    }

    /* 點彈窗的暗色背景就關閉彈窗：hidden = true 是 HTML 的「隱藏」屬性。（主軸彈窗用；遊戲彈窗是全螢幕，用「返回」關） */
    function closeOnBg(dlg) {
        dlg.addEventListener('click', function () { dlg.hidden = true; });
    }

    /* 先宣告變數、稍後 UI.ready 裡才指定值；Built 旗標讓彈窗「第一次打開才建立」，之後重複使用，省效能。 */
    var themeDlg, gameDlg;
    var themeBuilt = false;
    var gameMenu = null;         /* buildGameDlg() 建好之後的控制物件 { show, hide }；null＝還沒建 */

    /* 玩家選了一個主軸後做的事： */
    function pickTheme(id) {
        /* 從這裡進測試模式＝新的一局：題目在 quiz.html 一進去就全部重新產生（見 js/quiz_gen.js） */
        /* UI.store 是 localStorage 的小包裝（瀏覽器關掉也會記住的資料）。這裡先做個記號，
           告訴 quiz 頁「這是全新的一局」，題目要重新產生。 */
        UI.store.set('fm.quiz.fresh', true);            /* UI.store.get／set：讀寫 localStorage（關掉瀏覽器也會記住的資料） */
        /* 改變 location.href 就會跳到另一個網頁；? 後面是「查詢參數」，另一頁用它得知要玩哪個主軸。 */
        location.href = 'quiz.html?theme=' + id;
    }

    /* 建立「選主軸」彈窗的內容。THEME_CELLS.map(...) 的意思是：把清單裡每一項轉成一個按鈕，回傳新陣列。 */
    function buildThemeDlg() {
        themeBuilt = true;
        var cells = THEME_CELLS.map(function (c) {      /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            if (!c) return soonCell('theme');
            /* on: { click: ... } 是綁定「點擊事件」。e.stopPropagation() 表示事件到此為止，
               不要往上傳給外層的背景（不然點按鈕時背景的「點了就關閉」也會一起觸發）。 */
            return h('button', {
                'class': 'theme-cell', type: 'button',
                on: { click: function (e) { e.stopPropagation(); pickTheme(c.id); } }
            }, [h('span', { 'class': 'theme-cell__name', text: c.name })]);
        });
        var card = h('div', { 'class': 'theme-dlg__card', on: { click: function (e) { e.stopPropagation(); } } }, [
            h('div', { 'class': 'theme-dlg__title', text: '選一個想練習的主題' }),
            h('div', { 'class': 'theme-grid' }, cells)
        ]);
        themeDlg.appendChild(card);                     /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        closeOnBg(themeDlg);
    }

    /* ═══ 記住玩家的選擇（都存在 localStorage，關掉瀏覽器也記得）═══
       · LAST_GAME_KEY：上一次點的是哪一款 → 打開「全部」時自動捲到那一款，格子外圍會有一圈藍框；
       · RECENT_KEY：最近玩過的遊戲 id（最新的在最前面，最多 RECENT_MAX 款）→「最近」頁籤的內容；
       · TAB_KEY：上次停在哪個頁籤 → 下次打開還是那一頁。 */
    var LAST_GAME_KEY = 'fm.menu.lastGame';
    var RECENT_KEY = 'fm.menu.recent';
    var TAB_KEY = 'fm.menu.tab';
    var RECENT_MAX = 12;

    /* 最近玩過的 id 清單：去掉已經不存在的遊戲、重複的；從來沒存過「最近」但有「上次玩的」就用它當第一筆 */
    function recentIds() {
        var raw = UI.store.get(RECENT_KEY, null);
        var out = [];
        if (Array.isArray(raw)) {
            raw.forEach(function (id) { if (gameById[id] && out.indexOf(id) < 0) out.push(id); });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        } else {
            var last = UI.store.get(LAST_GAME_KEY, null);
            if (gameById[last]) out.push(last);
        }
        return out.slice(0, RECENT_MAX);
    }

    /* 玩家點了一款遊戲：記下來（上次玩的、最近玩過），再跳到那款遊戲 */
    function pickGame(id) {
        UI.store.set(LAST_GAME_KEY, id);
        var list = recentIds().filter(function (x) { return x !== id; });  /* filter：留下符合條件的元素，回傳新陣列 */
        list.unshift(id);
        UI.store.set(RECENT_KEY, list.slice(0, RECENT_MAX));
        location.href = 'reaction.html?game=' + id;
    }

    /* 某個頁籤要顯示哪些遊戲（回傳 GAME_CELLS 裡的項目陣列）：
       全部＝每一款；最近＝recentIds() 的順序；其他＝cat 相同的那幾款（順序同「全部」）。 */
    function tabGames(tab) {
        if (tab === 'all') return GAME_CELLS.slice();   /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        if (tab === 'recent') return recentIds().map(function (id) { return gameById[id]; });
        return GAME_CELLS.filter(function (c) { return c.cat === tab; });
    }

    /* 搜尋遊戲（V1.43.0，頁籤列最右邊的「搜尋」）：關鍵字只要是遊戲名稱的「一部分」就算符合。
       · 全形半形、大小寫不分（NFKC 正規化再轉小寫）；關鍵字用空白隔開＝每一段都要符合（順序不拘）；
       · 也比對遊戲 id（打 sudoku 找得到數獨），但名稱優先：名稱符合的排在前面，其餘維持選單順序；
       · 關鍵字是空的＝不篩選，回傳全部。 */
    function normSearch(s) {
        s = String(s == null ? '' : s);
        if (s.normalize) s = s.normalize('NFKC');
        return s.toLowerCase();
    }
    function searchGames(q) {
        var words = normSearch(q).split(/\s+/).filter(Boolean);
        if (!words.length) return GAME_CELLS.slice();
        var byName = [], byId = [];
        GAME_CELLS.forEach(function (c) {
            var name = normSearch(c.name), id = c.id.toLowerCase();
            if (words.every(function (w) { return name.indexOf(w) >= 0; })) byName.push(c);  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
            else if (words.every(function (w) { return name.indexOf(w) >= 0 || id.indexOf(w) >= 0; })) byId.push(c);
        });
        return byName.concat(byId);
    }

    /* 這個頁籤 id 是不是合法的（存檔裡的值可能是舊版留下的、或被改壞） */
    function isTab(id) {
        return GAME_TABS.some(function (t) { return t.id === id; });  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
    }

    /* ═══ 五星評價的平均星數（V1.25.0，js/rating.js）═══
       每一格名稱下面的一排星星。平均值存在手機裡（Rating.loadStats：3 小時才重抓一次，一次拿回全部遊戲），
       所以格子一做出來就先畫快取裡的值；網路抓到新的再 paintRates() 全部重畫一次。
       rateEls：選單格子裡的星星（id → 元素）。「阿嬤都比你厲害」彈窗的格子每次都重做，做的時候就畫好，不放進來。 */
    var rateEls = {};
    function paintRates() {
        if (!window.Rating) return;
        var data = Rating.stats();
        Object.keys(rateEls).forEach(function (id) { Rating.paint(rateEls[id], id, data); });
    }

    /* 這個函式負責做出一格遊戲按鈕（縮圖＋名字＋平均星數）。 */
    /* 一格遊戲：上面是縮圖（寬度撐滿格子，高度照比例），下面一行遊戲名稱（最多 5 個字），再下面一排平均星數。
       縮圖載入失敗（還沒有圖檔）→ 把 <img> 藏起來，改顯示彩色底＋名字第一個字的「印章」，
       圖檔補齊之後會自動正常顯示，不用再改程式。 */
    function gameCell(c) {
        var idx = GAME_CELLS.indexOf(c);
        var img = h('img', { attrs: { src: c.img, alt: '', draggable: 'false', decoding: 'async' } });
        var seal = h('span', { 'class': 'game-cell__seal', text: c.name.charAt(0) });
        var kids = [h('span', { 'class': 'game-cell__pic' }, [seal, img]), h('span', { 'class': 'game-cell__name', text: c.name })];
        if (window.Rating) kids.push(h('span', { 'class': 'game-cell__rate' }, [Rating.bar(c.id)]));
        var cell = h('button', {
            'class': 'game-cell game-cell--tone' + (idx % 4), type: 'button',
            attrs: { 'data-id': c.id, 'aria-label': c.name },
            on: { click: function (e) { e.stopPropagation(); pickGame(c.id); } }
        }, kids);
        /* load / error 是圖片的事件：載入成功就藏起印章；載入失敗（沒有圖檔）就藏起圖片，只顯示印章。 */
        img.addEventListener('load', function () { seal.hidden = true; });
        img.addEventListener('error', function () { img.hidden = true; });
        return cell;
    }

    /* ═══ 打開「選一個想玩的遊戲」時輪流跳出的推薦彈窗（V1.25.0 起「阿嬤都比你厲害」；V1.39.0 起三種輪流）═══
       以前每次打開（包括從遊戲「返回」）只要被超越就跳「阿嬤都比你厲害」，玩家覺得壓力大又單調；現在三種輪流：
         · grandma 「阿嬤都比你厲害」：在世界排行榜被別人超越的遊戲（Leaderboard.overtaken → 資料庫 MF_get_overtaken；
           有人在他創下（或刷新）紀錄「之後」才排到他前面，兩人都在前 30 名；他創紀錄時就已經比他好的人不算），格子加 💔 與目前名次；
         · comeon  「來都來了，快開一局」：沒玩過的遊戲、或很久（FMPlays.STALE_DAYS 天）沒玩的遊戲（js/plays.js 的本機紀錄，不連網）；
         · master  「從從容容、游刃有餘」：最擅長的遊戲（世界名次最前面的，不夠用玩最多局的補；名次來自 MF_get_my_ranks，沒登入就只看局數）。
       輪流規則：從「上一次跳出的那種」的下一種開始（沒有紀錄就從 comeon 開始，對新玩家比較友善），沒有資料的種類（例如沒被超越、
       還沒玩過幾局）就跳過換下一種，三種都沒有就不跳。上一次跳出哪一種存在 localStorage（fm.menu.popup）。
       三種版面完全一樣（3 欄最多 2 排共 6 款；每一格跟選單的格子一樣：縮圖、名稱、平均星數，外加右上角的表情與縮圖下緣的標籤），點格子直接進那款遊戲。
       · 阿嬤那種需要連網（只有登入的玩家才會連，結果存 60 秒，頁面一打開就先在背景抓好）；打開選單之後 POPUP_WAIT_MS 內還沒決定要跳什麼
         （網路很慢）就這次不跳，免得玩家已經在滑選單時突然被打斷。 */
    var GRANDMA_MAX = 6;
    var POPUP_MAX = 6;
    var POPUP_WAIT_MS = 4000;
    var GRANDMA_WAIT_MS = POPUP_WAIT_MS;     /* 舊名稱（V1.25.0），保留給舊的呼叫與測試 */
    var POPUP_DELAY_MS = 350;        /* 選單先出現一下下再跳彈窗，玩家才看得出是「選單上又跳出來的通知」 */
    var POPUP_KEY = 'fm.menu.popup'; /* 上一次跳出的是哪一種 */
    var POPUP_ORDER = ['comeon', 'grandma', 'master'];
    var POPUP_META = {
        grandma: { cls: 'dlg--grandma', title: '阿嬤都比你厲害', sub: '有人超越你了，點一款搶回來！' },
        comeon: { cls: 'dlg--grandma dlg--comeon', title: '來都來了，快開一局', sub: '你還沒玩過或好久沒玩了！' },
        master: { cls: 'dlg--grandma dlg--master', title: '從從容容、游刃有餘', sub: '這幾款是你的拿手好戲，再來一局！' }
    };
    var popupCtl = null;             /* 開著的彈窗（Dlg.open 的控制物件）；null＝沒開 */
    var popupToken = 0;              /* 每次打開／關閉選單都 +1：網路回來時如果號碼不一樣，代表選單已經關掉或重開過，不要再跳 */

    /* 資料庫回傳的清單 → 要顯示的格子：只留選單裡有的遊戲、不重複、名次至少第 2、最多 GRANDMA_MAX 款、順序不變（純函式，t_menu.js 測試） */
    function grandmaItems(list) {
        var out = [], seen = {};
        (Array.isArray(list) ? list : []).forEach(function (x) {
            if (out.length >= GRANDMA_MAX || !x || !gameById[x.game_id] || seen[x.game_id] || !(x.rank >= 2)) return;
            seen[x.game_id] = true;
            out.push({ cell: gameById[x.game_id], rank: x.rank });
        });
        return out;
    }

    /* 選單裡所有遊戲的 id（給 js/plays.js 的推薦函式用） */
    function allIds() { return GAME_CELLS.map(function (c) { return c.id; }); }

    /* 「來都來了」的格子：[{ cell, kind: 'new'｜'stale', days }]（沒玩過的優先、很久沒玩的補，見 FMPlays.suggestFresh）；
       plays／opts 可以傳進來（測試用），預設讀本機紀錄 */
    function comeonItems(plays, opts) {
        if (!window.FMPlays) return [];
        opts = opts || {};
        return FMPlays.suggestFresh(allIds(), plays || FMPlays.all(), { n: POPUP_MAX, today: opts.today, rand: opts.rand })
            .filter(function (x) { return gameById[x.id]; })
            .map(function (x) { return { cell: gameById[x.id], kind: x.kind, days: x.days }; });
    }

    /* 「從從容容」的格子：[{ cell, rank（沒有名次是 null）, n }]（見 FMPlays.suggestMaster）；ranks：[{ game_id, rank }] */
    function masterItems(ranks, plays) {
        if (!window.FMPlays) return [];
        return FMPlays.suggestMaster(allIds(), plays || FMPlays.all(), ranks, { n: POPUP_MAX })
            .filter(function (x) { return gameById[x.id]; })
            .map(function (x) { return { cell: gameById[x.id], rank: x.rank, n: x.n }; });
    }

    /* 這次要依序試哪幾種：從「上一次跳出的那種」的下一種開始，繞一圈（沒有紀錄或不認得就從第一種 comeon 開始）。純函式 */
    function popupOrder(last) {
        var i = POPUP_ORDER.indexOf(last), out = [];
        for (var k = 1; k <= POPUP_ORDER.length; k++) out.push(POPUP_ORDER[(i + k) % POPUP_ORDER.length]);
        return out;
    }

    /* 縮圖下緣的標籤：名次（第 N 名，大字）或一小段文字（沒玩過／N 天沒玩／玩過 N 局） */
    function rankBadge(rank) {
        return h('span', { 'class': 'game-cell__rank', attrs: { 'aria-hidden': 'true' } }, [
            h('small', { text: '第' }), h('b', { text: String(rank) }), h('small', { text: '名' })
        ]);
    }
    function tagBadge(text) {
        return h('span', { 'class': 'game-cell__rank game-cell__rank--tag', attrs: { 'aria-hidden': 'true' } }, [h('b', { text: text })]);
    }

    /* 一格：跟選單的格子同一個做法（gameCell），再疊上右上角的表情與縮圖下緣的標籤。
       grandma：💔＋第 N 名（黑字白框）；comeon：🆕沒玩過／💤 N 天沒玩；master：👑（第 1 名）／😎＋第 N 名，沒有名次的顯示玩過幾局 */
    function popupCell(kind, it) {
        var cell = gameCell(it.cell), emoji, badge, say;
        if (kind === 'grandma') {
            emoji = '💔'; badge = rankBadge(it.rank); say = '你目前是世界第 ' + it.rank + ' 名';
        } else if (kind === 'comeon') {
            var isNew = it.kind === 'new';
            emoji = isNew ? '🆕' : '💤';
            badge = tagBadge(isNew ? '沒玩過' : it.days + '天沒玩'); say = isNew ? '你還沒玩過' : '你已經 ' + it.days + ' 天沒玩了';
        } else {
            emoji = it.rank === 1 ? '👑' : '😎';
            badge = it.rank ? rankBadge(it.rank) : tagBadge('玩過' + it.n + '局'); say = it.rank ? '你是世界第 ' + it.rank + ' 名' : '你玩過 ' + it.n + ' 局';
        }
        cell.setAttribute('aria-label', it.cell.name + '，' + say);  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
        var pic = cell.querySelector('.game-cell__pic');  /* querySelector：用 CSS 選擇器在網頁裡找元素 */
        pic.appendChild(h('span', { 'class': 'game-cell__heart', text: emoji, attrs: { 'aria-hidden': 'true' } }));
        pic.appendChild(badge);
        return cell;
    }

    function closePopup() {
        popupToken++;
        if (popupCtl) popupCtl.close();
    }

    function showPopup(kind, items) {
        var m = POPUP_META[kind];
        UI.store.set(POPUP_KEY, kind);
        popupCtl = Dlg.open({
            cls: m.cls, title: m.title, sub: m.sub,
            children: [h('div', { 'class': 'gm-grid' }, items.map(function (it) { return popupCell(kind, it); }))],
            buttons: [{ text: '關閉', kind: 'line', cls: 'btn--sm' }],
            onClose: function () { popupCtl = null; }
        });
    }

    /* 等 promise，最多等 ms 毫秒（逾時、失敗都當作「沒有資料」回傳 []） */
    function within(p, ms) {
        return new Promise(function (resolve) {
            var done = false;
            var t = window.setTimeout(function () { if (!done) { done = true; resolve([]); } }, Math.max(0, ms));  /* setTimeout(函式, 毫秒)：過一段時間後執行一次函式 */
            p.then(function (v) { if (!done) { done = true; window.clearTimeout(t); resolve(v); } },
                function () { if (!done) { done = true; window.clearTimeout(t); resolve([]); } });
        });
    }

    /* 某一種彈窗要放哪些格子（Promise，一定 resolve；空陣列＝這一種這次不跳） */
    function popupItems(kind, ms) {
        if (kind === 'grandma') {
            if (!window.Leaderboard || !Leaderboard.overtaken) return Promise.resolve([]);
            return within(Leaderboard.overtaken().then(grandmaItems), ms);
        }
        if (kind === 'comeon') return Promise.resolve(comeonItems());
        if (kind === 'master') {
            var lb = window.Leaderboard;
            if (!lb || !lb.myRanks) return Promise.resolve(masterItems(null));
            /* 名次變動很慢：有上次存的就直接用，同時在背景更新（下次用）；沒有存過才等網路 */
            var cached = lb.cachedMyRanks && lb.cachedMyRanks();
            if (cached) { lb.myRanks(); return Promise.resolve(masterItems(cached)); }
            return within(lb.myRanks().then(function (r) { return masterItems(r); }), ms);
        }
        return Promise.resolve([]);
    }

    /* 選單打開時呼叫：依輪流順序找出這次要跳的那一種，有的話跳出彈窗 */
    function checkPopup() {
        if (!window.Dlg) return;
        closePopup();
        var token = popupToken, t0 = Date.now(), kinds = popupOrder(UI.store.get(POPUP_KEY, null));  /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
        (function tryAt(i) {
            if (i >= kinds.length || token !== popupToken || gameDlg.hidden) return;
            popupItems(kinds[i], POPUP_WAIT_MS - (Date.now() - t0)).then(function (items) {
                if (token !== popupToken || gameDlg.hidden) return;
                if (!items.length) { tryAt(i + 1); return; }
                if (Date.now() - t0 > POPUP_WAIT_MS) return;
                UI.wait(POPUP_DELAY_MS).then(function () {
                    if (token === popupToken && !gameDlg.hidden) showPopup(kinds[i], items);
                });
            });
        })(0);
    }

    /* 舞台目前的縮放倍率（手機上通常小於 1）：getBoundingClientRect 量到的是「螢幕像素」，要除以它才是舞台裡的像素 */
    function stageScale() {
        var r = window.Stage && Stage.rect && Stage.rect();
        return (r && r.scale) || 1;
    }

    /* 網址有 ?games=1（遊戲頁左上角的「返回」帶回來的）→ 進選單就直接打開遊戲列表。
       列表關掉之後把這個參數拿掉：不然在選單上重新整理，列表又會自己跳出來。 */
    function wantsGameList() { return /[?&]games=1(&|#|$)/.test(location.search); }
    function dropGamesParam() {
        try {
            var u = new URL(location.href);
            if (!u.searchParams.has('games')) return;
            u.searchParams.delete('games');
            history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (e) { }
    }

    /* 建立「選遊戲」全螢幕彈窗：標題列（返回）、可捲動的遊戲格子、分類頁籤。回傳 { show, hide }。 */
    function buildGameDlg() {
        var cellEls = {};            /* 已經做好的格子（id → 按鈕），切換頁籤時重複使用，不用重做 */
        var tabEls = {};             /* 頁籤按鈕（id → 按鈕） */
        var curTab = 'all';
        var query = '';              /* 搜尋關鍵字（V1.43.0）；不是空的＝目前在「搜尋」狀態，格子只留符合的遊戲，分類頁籤都不亮 */
        var searchCtl = null;        /* 開著的搜尋彈窗；null＝沒開 */

        function hide() { gameDlg.hidden = true; closePopup(); query = ''; closeSearch(); dropGamesParam(); }

        /* 標題列：左上「返回」（樣式跟遊戲畫面的標題列同一套 .bar__back），標題置中 */
        var back = h('button', {
            'class': 'bar__back', type: 'button', attrs: { 'aria-label': '返回主選單' },
            html: UI.icon('back') + '<span>返回</span>', on: { click: hide }
        });
        var bar = h('div', { 'class': 'game-bar' }, [back, h('div', { 'class': 'game-bar__title', text: '選一個想玩的遊戲' })]);

        /* 遊戲格子：grid 是 3 欄的格線；list 是整個很長的內容（捲動時整個上下平移）；viewport 是看得見的窗口；thumb 是右邊的小滑桿 */
        var grid = h('div', { 'class': 'game-grid' });
        var list = h('div', { 'class': 'game-list' }, [grid]);
        var thumb = h('div', { 'class': 'game-thumb' });
        var viewport = h('div', { 'class': 'game-viewport' }, [list, thumb]);
        /* threshold: 8 → 手指／滑鼠要移動超過 8 個像素才算「拖曳」；沒超過就是「點一下」，按鈕照常收到點擊 */
        var scroller = Scroller.make(viewport, list, thumb, { threshold: 8 });

        /* 分類頁籤：文字直式排列，目前選中的那個填色 */
        var tabs = h('div', { 'class': 'game-tabs', attrs: { role: 'tablist' } });
        GAME_TABS.forEach(function (t) {
            var b = h('button', {
                'class': 'game-tab', type: 'button', text: t.name, attrs: { role: 'tab', 'aria-selected': 'false', 'data-tab': t.id },
                on: { click: function (e) { e.stopPropagation(); setTab(t.id); } }
            });
            tabEls[t.id] = b;
            tabs.appendChild(b);
        });
        /* 「搜尋」：排在 目測 的右邊。它不是分類（沒有放進 GAME_TABS、class 也不是 .game-tab），按下去跳出輸入關鍵字的彈窗；
           有關鍵字的時候它填藍色。 */
        var searchBtn = h('button', {
            'class': 'game-tab-search', type: 'button', attrs: { 'aria-label': '搜尋遊戲', 'aria-pressed': 'false', 'data-tab': 'search' },
            html: UI.icon('search') + '<span class="game-tab-search__t">搜尋</span>',
            on: { click: function (e) { e.stopPropagation(); if (searchCtl) closeSearch(); else openSearch(); } }
        });
        tabs.appendChild(searchBtn);

        /* render()：依照目前的頁籤（或搜尋關鍵字），把該顯示的格子放進 grid（清空再放，格子元素本身是重複使用的） */
        function render() {
            var searching = query !== '';
            var items = searching ? searchGames(query) : tabGames(curTab);
            var last = UI.store.get(LAST_GAME_KEY, null);
            grid.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            if (!items.length) {
                grid.appendChild(h('div', { 'class': 'game-empty' }, searching ? [
                    h('div', { 'class': 'game-empty__t', text: '找不到「' + query + '」' }),
                    h('div', { 'class': 'game-empty__s', text: '換個字試試，只打名稱的一部分就可以' })
                ] : [
                    h('div', { 'class': 'game-empty__t', text: '還沒有玩過的遊戲' }),
                    h('div', { 'class': 'game-empty__s', text: '到「全部」挑一款開始玩吧' })
                ]));
            }
            items.forEach(function (c) {
                var el = cellEls[c.id];
                if (!el) {
                    el = cellEls[c.id] = gameCell(c);
                    var bar = el.querySelector('.rate-bar');
                    if (bar) rateEls[c.id] = bar;
                }
                el.classList.toggle('game-cell--last', c.id === last);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                grid.appendChild(el);
            });
            GAME_TABS.forEach(function (t) {
                var on = !searching && t.id === curTab;
                tabEls[t.id].classList.toggle('is-on', on);
                tabEls[t.id].setAttribute('aria-selected', on ? 'true' : 'false');
            });
            searchBtn.classList.toggle('is-on', searching);
            searchBtn.setAttribute('aria-pressed', searching ? 'true' : 'false');
            scroller.refresh();
        }

        /* 換頁籤：記住這次選的、重畫、捲回最上面（搜尋中換頁籤＝離開搜尋，關鍵字清掉） */
        function setTab(id) {
            curTab = id;
            query = '';
            closeSearch();
            UI.store.set(TAB_KEY, id);
            render();
            scroller.scrollTo(0);
        }

        /* ═══ 搜尋彈窗（V1.43.0）═══
           彈窗貼在畫面最上面（標題列下面）、背景不壓暗也不擋手指：玩家一邊打字，下面的格子就一邊只留下符合的遊戲。
           彈窗開著的時候把格子往下推一個彈窗的高度（viewport.style.marginTop），符合的遊戲才不會被彈窗蓋住。
           「完成」（或 Enter）關掉彈窗，篩選留著（頁籤列的「搜尋」填藍色）；「清除」清空關鍵字。
           注音／拼音輸入還在組字的時候（isComposing）不篩選，等組好字再篩，不然打到一半會看到「找不到」。 */
        function closeSearch() { if (searchCtl) searchCtl.close(); }

        function openSearch() {
            if (!window.Dlg || searchCtl) return;
            var input = h('input', {
                'class': 'dlg-input search-input',
                attrs: {
                    type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
                    placeholder: '輸入遊戲名稱，例如：數獨', 'aria-label': '搜尋遊戲名稱'
                }
            });
            input.value = query;
            var count = h('div', { 'class': 'search-count' });
            function paintCount() {
                count.textContent = query === '' ? '共 ' + GAME_CELLS.length + ' 款，打幾個字就會留下符合的' : '找到 ' + searchGames(query).length + ' 款';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            }
            function apply() {
                var q = input.value.trim();
                if (q === query) return;
                query = q;
                render();
                paintCount();
                scroller.scrollTo(0);
            }
            input.addEventListener('input', function (e) { if (!e.isComposing) apply(); });
            input.addEventListener('compositionend', apply);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();                 /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
                    e.stopPropagation();                 /* Esc 只關搜尋彈窗，不要連整個遊戲選單一起關掉 */
                    if (!e.isComposing) closeSearch();
                }
            });
            paintCount();
            var ctl = searchCtl = Dlg.open({
                cls: 'dlg--search',
                children: [input, count],
                btnRow: true,
                buttons: [
                    { text: '清除', kind: 'line', cls: 'btn--sm', keep: true, onClick: function () { input.value = ''; apply(); input.focus(); } },
                    { text: '完成', kind: 'primary', cls: 'btn--sm' }
                ],
                onClose: function () {
                    searchCtl = null;
                    viewport.style.marginTop = '';
                    render();
                }
            });
            viewport.style.marginTop = (ctl.card.offsetTop + ctl.card.offsetHeight + 8) + 'px';
            scroller.refresh();
            input.focus();
            if (query) input.select();
        }

        /* 「全部」頁籤：把上次玩的那一款捲到畫面中間（它的格子外圍有藍框），不用每次都從最上面一路滑 */
        function scrollToLast() {
            var el = cellEls[UI.store.get(LAST_GAME_KEY, null)];
            if (!el || el.parentNode !== grid) return;
            var sc = stageScale();
            var top = (el.getBoundingClientRect().top - list.getBoundingClientRect().top) / sc;  /* getBoundingClientRect：取得元素在螢幕上的位置與大小（算點擊位置、版面用） */
            scroller.scrollTo(top - (viewport.clientHeight - el.offsetHeight) / 2);
        }

        gameDlg.appendChild(bar);
        gameDlg.appendChild(viewport);
        gameDlg.appendChild(tabs);
        /* 鍵盤 Esc 也可以關閉（電腦上方便） */
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !gameDlg.hidden) hide(); });

        return {
            hide: hide,
            show: function () {
                var saved = UI.store.get(TAB_KEY, 'all');
                curTab = isTab(saved) ? saved : 'all';
                if (curTab === 'recent' && !recentIds().length) curTab = 'all';      /* 還沒玩過任何遊戲就別停在空的「最近」 */
                gameDlg.hidden = false;                                              /* 先顯示出來，下面量尺寸才量得到 */
                render();
                paintRates();
                scroller.scrollTo(0);
                if (curTab === 'all') scrollToLast();
                if (window.Rating) Rating.loadStats().then(paintRates);              /* 快取過期才會真的連網 */
                checkPopup();
            }
        };
    }

    /* 給 Node 測試用（test/reaction/t_menu.js）的資料與純函式；另外 js/menu_nav.js（左上角漢堡選單的「成績」彈窗）
       也在瀏覽器裡用 GAME_CELLS／gameById／recentIds／pickGame（點「玩」直接進那款遊戲，跟點選單格子是同一個動作） */
    window.FMMenu = {
        GAME_CELLS: GAME_CELLS, GAME_TABS: GAME_TABS, THEME_CELLS: THEME_CELLS, tabGames: tabGames, searchGames: searchGames, RECENT_MAX: RECENT_MAX,
        gameById: gameById, recentIds: recentIds, pickGame: pickGame,
        grandmaItems: grandmaItems, GRANDMA_MAX: GRANDMA_MAX,
        comeonItems: comeonItems, masterItems: masterItems, popupOrder: popupOrder, POPUP_ORDER: POPUP_ORDER, POPUP_META: POPUP_META, POPUP_MAX: POPUP_MAX, POPUP_WAIT_MS: POPUP_WAIT_MS,
        keys: { last: LAST_GAME_KEY, recent: RECENT_KEY, tab: TAB_KEY, popup: POPUP_KEY }
    };

    /* UI.ready()：等網頁 DOM 都準備好了才執行裡面的程式（這時才找得到 getElementById 要找的元素）。 */
    /* UI.ready()：整個檔案真正開始跑的進入點，等 DOM 準備好才動手找元素、綁事件
       （見 js/ui.js 的說明）。Stage.init() 一定要在這裡呼叫一次，整個頁面的
       縮放置中才會開始運作。 */
    UI.ready(function () {
        Stage.init();
        document.getElementById('menu-logo').innerHTML = UI.art('home', 'menu__art');
        document.getElementById('icon-test').innerHTML = UI.icon('list');
        document.getElementById('icon-reaction').innerHTML = UI.icon('bolt');
        document.getElementById('icon-world').innerHTML = UI.icon('cube');
        /* getElementById 用 id 找到 HTML 裡的元素，再替它放進圖示。 */

        themeDlg = document.getElementById('theme-dlg');
        gameDlg = document.getElementById('game-dlg');
        /* 第一次（還沒有「玩過哪些遊戲」的紀錄）：用本機的最佳紀錄、最近玩過的補一份起始紀錄，推薦彈窗才不會把玩過的當成沒玩過 */
        if (window.FMPlays) FMPlays.bootstrap(allIds());

        /* 替兩個大按鈕綁定點擊：第一次點才建立彈窗，之後只是把 hidden 設成 false 讓它顯示出來。 */
        document.getElementById('mode-test').addEventListener('click', function () {
            if (!themeBuilt) buildThemeDlg();
            themeDlg.hidden = false;
        });
        document.getElementById('mode-reaction').addEventListener('click', function () {
            if (!gameMenu) gameMenu = buildGameDlg();
            gameMenu.show();
        });
        /* 從遊戲頁按「返回」回來：直接打開遊戲列表，讓玩家挑下一款 */
        if (wantsGameList()) {
            gameMenu = buildGameDlg();
            gameMenu.show();
        }

        /* 頁面打開一下子之後，先在背景把「平均星數」與「阿嬤都比你厲害」要用的資料抓好（都有快取，沒過期就不連網），
           玩家按「秒反應」的時候通常已經拿到了，不用等。 */
        UI.wait(600).then(function () {
            if (window.Rating) Rating.loadStats().then(paintRates);
            if (window.Leaderboard && Leaderboard.overtaken) Leaderboard.overtaken();
        });

        /* window.FM_VERSION 是 js/boot.js 讀完 version.json 後存起來的版本資訊，這裡拿來顯示在選單底部。 */
        var v = window.FM_VERSION;
        var el = document.getElementById('menu-version');
        if (v && el) {
            var shown = /^local-/.test(v.version) ? '本機版' : '版本 ' + v.version;
            el.textContent = v.updated ? '已更新到最新 ' + shown : shown;
        }
    });
})();
