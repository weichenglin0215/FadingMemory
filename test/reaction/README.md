# 秒反應・純函式測試

每個小遊戲檔案（`js/reaction_<id>.js`）都把判定／出題／難度曲線這些純函式放在 `G.test`，這裡的 `t_<id>.js` 在 Node 裡直接呼叫它們，不需要瀏覽器。

```
node test/reaction/run_all.js        # 全部跑一次
node test/reaction/t_coins.js        # 只跑一支
```

`load.js` 會用假的 `UI／Sfx／Stage` 載入 `reaction_core.js`、`reaction_kit.js` 和被測的遊戲檔案。沒有測試的遊戲（零秒出手、神準落下、大家來找碴、不可能任務、形形色色、色不異空、七彩陷阱）是 1.15.0 之前的舊遊戲，只能在瀏覽器裡驗證。

## 用亂數出題的測試要固定種子（不然會偶爾失敗）

出題函式（`plan`、`makeLevel`、`makeTray`、`makeQuestion`…）預設用 `Math.random`。測試如果拿隨機出的題目去做**統計**（例如「150 題裡有幾題有陷阱」「80 條繩子有幾條往上爬」），門檻再寬鬆，每跑幾十次還是會有一次運氣不好而失敗（2026-10-07 實測：`t_coins`、`t_curves`、`t_pillbox`、`t_price` 各約每 25 次失敗 1 次）。所以這類測試一律：

- 用 `load.js` 匯出的 `rng(seed)` 當亂數來源，傳給出題函式的最後一個參數（`T.plan(level, rnd)`），種子用 `seedOf(預設種子)` 取得——每次跑的題目都一樣，結果固定；
- 統計門檻訂在**平均值下方 4～5 個標準差以上**（先用幾百組種子量過平均與標準差，再在測試的註解裡寫下來），這樣換任何種子都不會因為運氣失敗；
- 失敗訊息帶上種子，用 `$env:SEED = 種子; node test/reaction/t_xxx.js`（PowerShell）就能重現；
- 改過門檻或出題程式之後，用 `node test/reaction/sweep_seeds.js t_coins.js 200` 換 200 個種子各跑一次，失敗次數要是 0（可以同時跑好幾個，`t_curves.js` 一次要約 10～30 秒，建議加第三個參數開 8 個以上同時跑）。

目前這樣處理的測試：`t_coins.js`、`t_curves.js`、`t_pillbox.js`、`t_price.js`，以及 V1.22.0 新增的 23 支（`t_isequal.js`…`t_sudokuone.js`；2026-10-10 每支都換 40 個種子各跑一次，全部 0 失敗）。

## 其他測試

`t_ruletext.js`（V1.23.0）測玩法說明的排版（`Dlg.test.lines／emParts`：一句一行、引號與括號、`\n` 手動換行、`**重點**` 成對／不成對）與全部 108 款的 `rule`（每款有 1～4 個重點、每個至少 4 個字、不超過全文 60%、排版後沒有字被吃掉、遊戲名稱不超過 5 個字、零秒出手剛好是使用者指定的三行）；`t_menu.js` 測 `js/menu.js` 的清單（108 款、名稱 ≤ 5 個字、縮圖檔存在且高 256、七個分類不重疊且加起來是全部、跟各遊戲檔案的 id／名稱一致、「最近」的規則）；`t_scroller.js` 測 `js/scroller.js` 的互動（拖曳門檻、點一下與拖曳的分辨、慣性、橡皮筋、滾輪、鍵盤、舞台縮放換算；用假的 DOM，不需要瀏覽器）。

`t_cssclass.js`（V1.24.0 建立、V1.41.0 重寫）檢查「**一款遊戲一份 CSS**」的規矩：每款 `js/reaction_<id>.js` 都有同名的 `css/games/reaction_<id>.css`（數獨系列共用 `css/sudoku_lib.css`）、css 裡的 class 與 @keyframes 以「<id>-」（遊戲全名）開頭、遊戲 js 不能用別款遊戲的 class（共用元件除外）、共用 `css/reaction_common.css` 不能出現遊戲專屬的 class、`boot.js` 有載入每一份。

`t_triple100.js`（V1.26.0；V1.27.0 改成關卡制）測三張成百：使用者的範例牌組（唯一正解 5 組、陷阱 9 組、共 14 組）、先消陷阱就配不完、產生器 300 副牌都只有唯一分法且陷阱 ≥ 9 組、findTriples／findPartitions 對照暴力；關卡規格（第 1 關 6 張、每三關多 3 張、限時 180 秒起每關 +20 秒）、30 關每一關的牌組（張數、唯一分法、陷阱數量）、6 張牌不可能有陷阱、時間顯示。

`t_rating.js`（V1.25.0）測五星評價（`js/rating.js`：台灣時間的「今天」、每款每天一次、送評價的各種結果、平均值的 3 小時快取與失敗退避、評價彈窗的勾選／取消／送出、評完按鈕消失）與「阿嬤都比你厲害」的用戶端（`Leaderboard.overtaken` 的快取、清除、斷線、404），還有 `boot.js` 兩頁的載入順序、SQL 與網頁的時區一致；DOM 用很小的替身，不需要瀏覽器。

`t_leaderboard.js` 測的是世界排行榜（`js/leaderboard.js`、`js/leaderboard_ui.js`）：偽造位數統計、進榜判斷、暱稱清理、慣性捲動物理、快取／離線／待送佇列；並且對**全部 50 款遊戲**（遊戲清單讀 `js/boot.js`，載入器在 `test/leaderboard/all_games.cjs`）檢查：`score` 設定合法、跟 `supabase/MF_leaderboard.sql` 逐款一致（含 SQL 的自動產生區塊有沒有過期）、每款都接了送榜（`kit.result` 帶 `score`，或手動呼叫 `Leaderboard.submit(ID, …)`，不會送兩次）、送榜流程。新增遊戲忘了做排行榜這幾步，這支測試會失敗。資料庫腳本本身的測試在 `test/leaderboard/`（要另外安裝 PGlite，見 `note/世界排行榜說明.md` 第 8 節）。

## 瀏覽器端驗證（V1.22.0 起，headless Chrome／Edge，不用裝任何套件）

先把專案用本機伺服器開起來（`python -m http.server 8743`），再執行：

```
node test/reaction/run_browser.mjs new23            V1.22.0 的 23 款：各用 G.debug 玩「答對 3 關再答錯」到結算，檢查沒有 JS 錯誤、成績有送榜
node test/reaction/run_browser.mjs new copycurve    指定幾款
node test/reaction/run_browser.mjs hints            操作提示檢查（browser_hints.js 的 81 款）：模式、短文字、位置、碰一下會消失
node test/reaction/input_tests.mjs                  用 Chrome DevTools Protocol 送「真的滑鼠事件」操作 23 款（照抄曲線真的畫一遍、手電筒真的拖曳、轉盤真的點角度…）
VIEW=390x844 node test/reaction/input_tests.mjs     同上，但用手機大小的視窗（驗證舞台縮放後的座標換算）
node test/reaction/make_icons.mjs                   拍選單縮圖：img/reaction/<id>.png（高 256 像素），詳見 README「選單縮圖」
node test/reaction/menu_check.mjs                   主選單「選一個想玩的遊戲」全螢幕彈窗（V1.23.0）：版面（滿版、返回、3 欄、格子 50:85、直式頁籤）、各分類格子數、最近、滑鼠與觸控拖曳＋慣性、滾輪、點一下進遊戲、拖曳不誤點（VIEW=820x1180 換視窗大小，截圖存到 --out）
node test/reaction/stage_check.mjs                  舞台縮放（V1.23.0）：12 種視窗大小都充滿高度（或寬度）且置中、iPad 直式／橫式截圖；模擬 visualViewport 回報一半、visualViewport 與 innerHeight 都回報一半、鍵盤彈出再收起、漏發 resize 事件、縮小再放大、?debug 資訊
node test/reaction/rules_check.mjs                  全部 108 款的玩法說明彈窗（V1.23.0）：卡片放得進舞台（一顆按鈕與「?」重看的兩顆按鈕）、一句一個 <p>、重點是粗體黑字、一般文字是一般粗細、沒有水平溢出；代表性的幾款存成截圖
```

`cdp.mjs` 是共用的小工具：啟動看不見視窗的瀏覽器（遠端除錯埠用 0＝自動挑、結束時用 `taskkill /T` 殺整棵行程樹，不會留下孤兒行程）、送 CDP 指令、開啟某款遊戲並略過說明彈窗。
`browser_new28.js`／`browser_hints.js` 是放在頁面裡跑的檢查程式（也可以手動貼進瀏覽器主控台），`run_browser.mjs` 只是自動把它們載進去跑。

## 深思篇（V1.41.0）與 CSS 重整的驗證工具

`t_sudokulib.js`（數獨引擎與六款變體）、`t_sandwich.js`、`t_takuzu.js`、`t_sumdel.js`、`t_magicsq.js`、`t_nim.js`、`t_fifteen.js`、`t_tianji.js`、`t_flipten.js`：出題器的唯一解／不用猜、必勝（取火柴與搶十五用完整搜尋，並跟 XOR 定理、井字遊戲的和局互相驗證）、田忌賽馬的貪心＝暴力搜尋、翻牌湊十的完美記憶策略＝模擬玩一遍、難度曲線、提示、答案不偏心。

```
node test/reaction/browser_think.mjs                 深思篇 14 款：用真的滑鼠事件操作（點格、點數字鍵、點火柴、點牌、點馬、翻牌…）＋G.debug 走完解開；失敗型故意走錯會結算；自由解題的款按「返回」會先結算、再按才離開；全程沒有 JS 錯誤
node test/reaction/browser_think.mjs nim takuzu     指定幾款
node test/reaction/css_fingerprint.mjs save 檔.json [id…]   樣式指紋：每款遊戲「剛開始的畫面」每個元素的計算後樣式＋位置，壓成指紋存起來（Math.random 固定種子、關掉動畫）
node test/reaction/css_fingerprint.mjs diff 甲.json 乙.json 比對兩份指紋，列出有差異的遊戲
```

## 原創篇（V1.42.0）

`t_timetable.js`、`t_piggybank.js`、`t_expiry.js`、`t_fruitstock.js`、`t_boxstack.js`、`t_shapegrid.js`、`t_babyscale.js`：出題器（唯一解、只用長方形法則就填得完、照大小排排不對、算得出來而且每條紀錄都用得到、必勝）、日期換算（大小月、閏年、跨年）、難度曲線、判定。

```
node test/reaction/browser_orig8.mjs                 原創篇 8 款：真的滑鼠操作（點格子、數字鍵、−／＋、標記鈕、清單再點格子、計算機的鍵）、各關卡版面放得下、答錯會結算、自由解題按「返回」先結算、沒有 JS 錯誤
node test/reaction/shot_level.mjs 輸出資料夾 timetable:30 expiry:30   跳到指定關卡、存整個舞台的截圖（看最難的關卡放不放得下）
node test/reaction/shot_old.mjs 輸出資料夾 pillbox:14 ghostleg:20          舊式闖關遊戲（沒有 debug.goto 的：分藥盒、撥時鐘、零錢分類、誰先到？、神準落下、鬼腳圖）從指定關卡開局、存截圖
node test/reaction/shot_state.mjs 輸出.png fifteen "400:Reaction.current.debug.goto(8)" "600:Reaction.current.debug.wrong()"   依序執行幾段 JavaScript 後存截圖（看按完之後的中間狀態）
```

`css_fingerprint.mjs` 是改 CSS 組織（拆檔、class 改名）時用的：改之前拍一份、改之後拍一份，指紋一樣＝畫面上每個元素的每個樣式都沒變（class 名稱不納入指紋，所以改名不影響）。注意：`getComputedStyle` 裡自訂屬性（`--xxx`）的順序每次不同，指紋會先排序；倒數計時條這類本來就在動的元素每次都不同，要先拍兩次基準、扣掉本來就會變動的元素再比。

## 動作篇（V1.45.0）

`t_skyshot.js`（砲打飛機）、`t_forestpeek.js`（草叢找動物）、`t_rocketland.js`（火箭回收）：航道的尺寸比例（上 0.2、下 1.0、線性）與排在上方 2/3、重新進場速度 ±20%、等待 0.5～1.5 秒、砲彈掃掠碰撞（不會穿過扁飛機、取最下面那一架）、黑煙／火花／爆炸；難度隨分數（間隔、同時幾隻、露臉時間、速度）、大小隨時間變小、前 20 秒草會晃、路線不出畫面、點擊判定；火箭寬 1/10 → 標靶寬、燃料 30 → 60 秒、油門慢慢加、天花板、落地判定（完全在標靶裡＋夠慢）、燃料條顏色，並用**自動駕駛**（`G.test.autopilot`）模擬 30 關 × 12 個種子：第 1～29 關幾乎都降落得了、第 30 關至少 3/12，不按一定墜毀。

## 泡泡掃射、分類點擊（V1.46.0）

`t_bubblespray.js`（泡泡掃射）、`t_emojisort.js`（分類點擊）：（V1.53 起 Ball Blast 玩法）一層一個顏色（紅 → 橘 → 黃…）、每層一分為二且更小、越重重力與飄移越大、每層要打中 32／16／8／4／2／1／1 次、打中少 1 次、一顆紅球剛好 127 顆（256 發）、第 0／5／10 秒出現、落地彈回最上緣且不出界、重的彈得快、砲彈掃掠碰撞（取最先碰到的、快砲彈也不會穿過小球）、擊破第 2／4／6 顆紅球變 2／3／4 發並排（間隙 BULLET_GAP）、砲塔尺寸 TURRET_SCALE；五種分類不重複不跨類、方格 2×2 → 10×10 → 10×15 共 22 關、種類數 1＋1 → 3＋2、每一關每種都出現、題目只寫要點的種類、限時夠點完。

## emoji 圖片庫擴大（V1.52.0）

`t_emojipng.js`：`這個看過嗎`、`菜籃總價` 的食物與 `kit.PERSON_EMOJI` 人像全部在圖集裡，`seenit`、`basket`、`halfcrowd`、`sneakmove` 都用 `Reaction.emojiPng` 貼圖、等圖集載好才開始。要新增 emoji 時改遊戲的清單，再跑 `node test/reaction/make_emoji_png.mjs --write`（要在 Windows 上跑，才會是 Segoe UI Emoji 的圖案）。

## 釣魚提竿的新畫面（V1.53）

`t_fishfloat.js`：水面在畫面由上往下 2/3（下方 1/3 高度）、浮標放大 3 倍；浮標平常不定時的左右傾斜（角度、時間、間隔都在範圍內、間隔不固定、左右都有）；魚來拉（輕碰、咬鉤往下沉）時快速往「跟平常傾斜相反」的方向歪並被拉向一邊（沉到 40% 就歪了 60% 以上、翻到另一邊）；水面的波（一維波動方程式）：左右對稱、以波速往兩側傳、越遠越小但整個畫面都傳得到、吸收邊界不會彈回來、浮標不動之後慢慢平靜、用力晃 60 秒與卡頓都穩定；浮標帶動水面的彈簧（猛拉一下會晃幾下）；程式與 css 的接線。`t_fishbite.js`（出題與判定）V1.53 起多了「窗口下限 WINDOW_MIN（約 0.168 秒，窗口再短浮標會在沉到底前就浮起來）」與「假沉的變化」的檢查：輕碰的三種形狀（一沉就浮／停住 0～0.5 秒／兩段式先淺後深）、停住時深度是平的、咬鉤有時是「假沉變真咬」（先沉到假沉深度停住、不浮起來、繼續沉；深度連續、t90 之前不到 0.9、提竿一律太早）。新畫面（水波、傾斜）的檢查獨立放在 `t_fishfloat.js`。

