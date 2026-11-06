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

開発時は `pnpm assets && pnpm dev`。CSPは本番用に厳格なため、Viteの開発用インラインスクリプト/HMRが制限されることがあります。確認には `build` + `preview` を推奨します。開発サーバーは公開用ではありません。アプリの実運用にサーバープログラム、APIキー、有料API、Apple Developer Program、Xcodeは不要です。

## 使い方

1. 設定で本人・妻の表示名と、ブランド・下4桁・別名を登録。Apple Payの仮想番号は別の登録として追加します。
2. ホームの「撮影する」「画像を選ぶ」、または下部の「読み取り」を選びます。最大20枚・1枚25MB・合計150MBです。
3. 向き・明暗補正を選び「読み取り開始」。画像は1枚ずつ処理します。
4. 原本とOCR候補を比較。通貨・合計・支払者・商品明細を修正し、照合にチェックして保存します。画像保存は初期状態でオフです。
5. ホームで支払者別・通貨別集計を確認。一覧では日付・店舗・金額・支払者の並べ替え、検索、日付・支払者・通貨の絞り込みができます。
6. 設定からCSVを出力、または暗号化バックアップを作成します。

店名・住所は候補で、低信頼/未確認項目には「要確認」を表示します。信頼度の数字は画像全体のOCR値で、項目ごとの正解率ではありません。小計・税・割引・サービス料・チップが揃い、税込/税別が指定されたときだけ合計を検算します。該当しない料金は確認後に `0` を入力してください。空欄を勝手に0として扱いません。異なる通貨の合算・為替換算はしません。

## Phase 1の結果と採用判断

最初に撮影入力・端末内OCR・認識全文表示だけを実装し、Mac Chromeで架空画像を認識しました。1000×916の画像で約0.9秒・OCR信頼度89%、店名・日付・17.99・4242の認識に成功しました。その結果を受けてTesseract.js 7.0.0を暫定採用し、管理機能を実装しました。

統合後は同一配信元のキャッシュからオフラインOCRを実行し約0.3秒、長い1000×3076画像は約1.1秒・94%でした。いずれもこのMacでの少数の合成画像の観測値です。実レシート全般の精度・iPhone速度の保証や統計的なベンチマークではありません。**iPhone実機の合格前に「実用OCR精度を確認済み」とは扱いません。**

## 機能と制限

| 項目 | 状態 |
|---|---|
| カメラ/写真ライブラリ/複数画像 | 実装。実際のiPhoneカメラ連携は要実機確認 |
| 端末内英語OCR、進捗、中止、再試行、手入力 | 実装 |
| 90度単位の回転、最大400万画素/長辺6000pxへの縮小、明暗補正 | 実装 |
| 店舗・住所・日付・時刻・明細・金額・カード・取引番号の候補抽出 | 実装。ルールベースで全書式対応ではない |
| 複数カード/仮想番号・支払者判定・手動変更・別の利用者 | 実装 |
| IndexedDB保存、一覧、検索、編集、削除、通貨別集計 | 実装 |
| 一覧CSV/明細CSV、数式インジェクション対策 | 実装 |
| 暗号化バックアップ、検証後の一括復元、画像削除、全削除 | 実装 |
| Manifest、アイコン、Service Worker、全OCR資産の同一配信元キャッシュ | 実装 |
| GitHub Pages用workflow/手順 | 公開済み。GitHub Actionsで自動試験・配信に成功 |
| iPhone/iPad Safari、Windows、ホーム画面インストール | 未検証 |
| 台形補正、自動傾き検出、日本語OCR、PDF/HEIC変換 | 未実装。HEICはブラウザで開ける場合のみOCR可能、原本保存はJPEG/PNG/WebP限定 |
| Google OAuth / Sheets APIの直接同期 | 初期版では未実装（仕様どおり） |

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
- [セキュリティ設計と検証結果](docs/SECURITY.md)
- [自動試験・OCR測定の記録](docs/TEST-RESULTS.md)
- [iPhone実機試験と採用の最終判断](docs/DEVICE-TESTS.md)
- [構成・データ形式・将来の同期](docs/ARCHITECTURE.md)
- [依存関係とライセンス](docs/dependencies.json)、[配布ライセンス表記](public/THIRD-PARTY-NOTICES.txt)
- [依存パッケージ監査の結果](docs/dependency-audit.json)

## 参照した公式資料

- [Tesseract.jsのローカル配置設定](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [Tesseract.jsのメモリ・速度に関する説明](https://github.com/naptha/tesseract.js/blob/master/docs/performance.md)
- [GitHub Pagesのカスタムworkflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [WebKitのストレージ方針](https://webkit.org/blog/14403/updates-to-storage-policy/)
