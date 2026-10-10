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
```

`cdp.mjs` 是共用的小工具：啟動看不見視窗的瀏覽器（遠端除錯埠用 0＝自動挑、結束時用 `taskkill /T` 殺整棵行程樹，不會留下孤兒行程）、送 CDP 指令、開啟某款遊戲並略過說明彈窗。
`browser_new28.js`／`browser_hints.js` 是放在頁面裡跑的檢查程式（也可以手動貼進瀏覽器主控台），`run_browser.mjs` 只是自動把它們載進去跑。
