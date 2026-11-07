# 旅のレシート帳 / Tabi Receipts

iPhone優先の、ブラウザ内OCR・ローカル保存型レシート管理PWAです。React + TypeScript + Vite + Tesseract.js。既存レシートアプリのコードは使用していません。

**状態：動作する初期版。MacのChromeで自動試験済み。iPhone/iPad Safari・Windows実機、実際に撮影したレシートの精度は未検証です。旅行で使う前に [実機チェックリスト](docs/DEVICE-TESTS.md) を実施してください。[公開アプリ](https://mov088420-cloud.github.io/tabi-receipts/) から利用できます。**

## 起動

Node.js 24以上とpnpm 11.25.0を使います。

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

表示される `http://127.0.0.1:4173/` を開きます。`file://` でHTMLを直接開いてもPWAは動きません。初回はOCR用約54MiBを同じ配信元から取得します。「オフライン準備完了」後に通信を切っても再起動・OCRできます。

開発時は `pnpm assets && pnpm dev`。CSPは本番用に厳格なため、Viteの開発用インラインスクリプト/HMRが制限されることがあります。確認には `build` + `preview` を推奨します。開発サーバーは公開用ではありません。端末内での利用にサーバープログラム、APIキー、有料API、Apple Developer Program、Xcodeは不要です。任意のGoogle自動保存には、利用者自身のGoogle Apps Scriptの初回設定と連携キーが必要です。

## 使い方

1. 設定で本人・妻の表示名と、ブランド・下4桁・別名を登録。Apple Payの仮想番号は別の登録として追加します。
2. ホームの「撮影する」「画像を選ぶ」、または下部の「読み取り」を選びます。最大20枚・1枚25MB・合計150MBです。
3. 長いレシートは「長いレシート（複数枚で1件）」を選び、上から順に撮影します。「続きの写真を撮る」で追加できます（1件6枚まで）。写真のつなぎ目は2〜3行重ねます。別々のレシートなら「1枚ずつ別のレシート」のまま使います。
4. 写真ごとに回転・背景の切り取り・明暗補正を調整して「読み取り開始」。小さな傾きは標準で補正します。複数写真は1枚ずつOCRし、つなぎ目の重複を確認してから1件にまとめます。
5. 原本とOCR候補を比較。通貨・合計・支払者・商品明細を修正し、照合にチェックして保存します。画像保存は初期状態でオフです。
6. ホームで支払者別・通貨別集計を確認。一覧では日付・店舗・金額・支払者の並べ替え、検索、日付・支払者・通貨の絞り込みができます。
7. 設定からCSVを出力、または暗号化バックアップを作成します。保存直後にもCSV保存ボタンが表示されます。
8. Googleへ自動保存する場合は、設定の「Googleスプレッドシートに自動保存」を接続します。[初回の設定手順](docs/GOOGLE-SHEETS.md)を参照してください。接続前は送信しません。

写真は元の画像のまま、保存を選択した場合だけ端末に残します。複数写真もGoogleとCSVでは1件のレシートとして出力し、撮影日時列には先頭写真の日時（確認画面で修正可能）を記録します。各写真の日時は端末と暗号化バックアップに保持します。写真そのものはGoogleに送信しません。

「認識したテキスト（一時表示）」には、画像から読めた文字が表示されます。文字を直して「空欄へ再反映」を押すと、入力済みの欄を維持して再解析します。商品明細は0件の場合だけ取り込み、既存明細へ自動追加しません。異なる通貨・カード情報を混ぜず、全文は保存・Google送信しません。

店名・住所は候補で、低信頼/未確認項目には「要確認」を表示します。信頼度の数字は画像全体のOCR値で、項目ごとの正解率ではありません。小計・税・割引・サービス料・チップが揃い、税込/税別が指定されたときだけ合計を検算します。該当しない料金は確認後に `0` を入力してください。空欄を勝手に0として扱いません。異なる通貨の合算・為替換算はしません。

## Phase 1の結果と採用判断

最初に撮影入力・端末内OCR・認識全文表示だけを実装し、Mac Chromeで架空画像を認識しました。1000×916の画像で約0.9秒・OCR信頼度89%、店名・日付・17.99・4242の認識に成功しました。その結果を受けてTesseract.js 7.0.0を暫定採用し、管理機能を実装しました。

統合後は同一配信元のキャッシュからオフラインOCRを実行し約0.3秒、長い1000×3076画像は約1.1秒・94%でした。いずれもこのMacでの少数の合成画像の観測値です。実レシート全般の精度・iPhone速度の保証や統計的なベンチマークではありません。**iPhone実機の合格前に「実用OCR精度を確認済み」とは扱いません。**

## 機能と制限

| 項目 | 状態 |
|---|---|
| カメラ/写真ライブラリ/複数画像 | 実装。実際のiPhoneカメラ連携は要実機確認 |
| 端末内英語OCR、進捗、中止、再試行、手入力 | 実装 |
| 複数写真を1件に登録、順番変更、重複行の確認、原本の切り替え | 実装。1件6枚まで。写真ごとの合計金額は合算しない |
| 90度単位の回転、小さな傾き補正、背景の切り取り、明暗補正、読み取り方法選択 | 実装。OCR用Canvasは最大400万画素/長辺6000px |
| 店舗・住所・日付・時刻・明細・金額・カード・取引番号の候補抽出 | 実装。改行された合計・料金、列見出し付き明細、月名日付等に対応。ルールベースで全書式対応ではない |
| 複数カード/仮想番号・支払者判定・手動変更・別の利用者 | 実装 |
| IndexedDB保存、一覧、検索、編集、削除、通貨別集計 | 実装 |
| 一覧CSV/明細CSV、数式インジェクション対策 | 実装 |
| 暗号化バックアップ、検証後の一括復元、画像削除、全削除 | 実装 |
| Manifest、アイコン、Service Worker、全OCR資産の同一配信元キャッシュ | 実装 |
| GitHub Pages用workflow/手順 | 公開済み。GitHub Actionsで自動試験・配信に成功 |
| iPhone/iPad Safari、Windows、ホーム画面インストール | 未検証 |
| 台形補正、自動トリミング、日本語OCR、PDF/HEIC変換 | 未実装。HEICはブラウザで開ける場合のみOCR可能、原本保存はJPEG/PNG/WebP限定 |
| 撮影日時・取り込み日時 | 実装。JPEGのEXIF撮影日時を優先。取得できないカメラ画像は取り込み時刻を目安として明示。ライブラリ画像は撮影日時を推測しない |
| Googleへの自動保存 | 任意のApps Script連携を実装。固定の表へ片方向保存、保留・再送・重複抑止。モック試験・Mac Chromeでの実Google保存を確認。iPhoneの通信は要実機確認 |
| Google OAuth / Sheets APIの直接同期 | 未実装。今回の自動保存は利用者所有のApps Scriptを使う追加構成 |

抽出は主に英語・小数2桁金額のレシート向けです。JPYの整数保存・CSV・集計には対応しますが、整数のみの金額印字や複雑な複数行明細は手入力が必要な場合があります。2桁年やMM/DD/YYYY、非常に長い/細かい印字も要確認。13～19桁の長い番号はカード番号漏えい防止のため自由記入欄でも拒否するので、長い取引IDは短縮してください。

## テスト

```bash
pnpm test
pnpm build
pnpm audit:static
pnpm exec playwright install chromium
pnpm test:e2e
```

既存Chromeを使う場合は `CHROME_PATH` に実行ファイルを指定できます。テストは専用の一時ブラウザプロファイルを使用し、通常のブラウザのデータは操作しません。使用画像はすべて架空で、`pnpm fixtures` で再生成できます。生成時のフォント差により認識値が変わるため、CIでは同梱PNGを使用します。

## 詳細

- [GitHub Pagesへの公開・ホーム画面への追加](docs/DEPLOY.md)
- [CSV・バックアップと復元](docs/BACKUP.md)
- [Googleスプレッドシート自動保存の初回設定](docs/GOOGLE-SHEETS.md)
- [セキュリティ設計と検証結果](docs/SECURITY.md)
- [自動試験・OCR測定の記録](docs/TEST-RESULTS.md)
- [iPhone実機試験と採用の最終判断](docs/DEVICE-TESTS.md)
- [構成・データ形式・将来の同期](docs/ARCHITECTURE.md)
- [依存関係とライセンス](docs/dependencies.json)、[配布ライセンス表記](public/THIRD-PARTY-NOTICES.txt)
- [依存パッケージ監査の結果](docs/dependency-audit.json)

## 参照した公式資料

- [Tesseract.jsのローカル配置設定](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [Tesseractの認識品質改善（切り取り・余白・傾き・ページ分割）](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
- [Tesseract.jsのメモリ・速度に関する説明](https://github.com/naptha/tesseract.js/blob/master/docs/performance.md)
- [GitHub Pagesのカスタムworkflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [WebKitのストレージ方針](https://webkit.org/blog/14403/updates-to-storage-policy/)
