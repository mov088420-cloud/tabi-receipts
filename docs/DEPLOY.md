# 無料のGitHub Pagesへの公開

公開済みURL：[https://mov088420-cloud.github.io/tabi-receipts/](https://mov088420-cloud.github.io/tabi-receipts/)

ソース：[https://github.com/mov088420-cloud/tabi-receipts](https://github.com/mov088420-cloud/tabi-receipts)

以下は再公開または別リポジトリへの公開手順です。実データは端末のIndexedDBにあり、ビルド成果物には含まれません。

1. GitHubに新しい公開リポジトリを作成します。無料枠でのPages利用には公開リポジトリを基本とします。実データ・バックアップ・CSV・実レシート写真をリポジトリに入れないでください。
2. このフォルダのソース、`pnpm-lock.yaml`、`.github/workflows/pages.yml`、`public`（生成される`ocr`フォルダは除く）、架空のテスト素材をアップロードします。`node_modules`、`dist`、`test-results`、`private`、`.backup`、CSVは含めません。Gitを使う場合、コミット前にステージされたファイルを必ず確認してください。`.gitignore`は補助であり、個人情報検査の代わりではありません。
3. リポジトリの **Settings → Pages → Build and deployment → Source → GitHub Actions** を選びます。
4. **Actions → Verify and deploy GitHub Pages → Run workflow** を実行します。依存取得・単体テスト・ビルド・静的監査・ブラウザ試験が成功した後に公開されます。デプロイは手動実行です。
5. deploymentに表示されたHTTPS URLを開きます。通常は `https://アカウント.github.io/リポジトリ名/` です。末尾の `/` を付けます。
6. 「オフライン準備完了」まで待ちます。画像を読み込む前でも全OCR資産をキャッシュします。初回約54MiB、更新時は一時的に新旧キャッシュ分の空き容量が必要です。

ビルドの相対パス `./` によりリポジトリ名を固定していません。独自の静的ホストにも `dist` の内容を配信できます。HTMLだけでなく `ocr`、`assets`、`icons`、`sw.js`、manifestをすべて含めてください。HTMLとJSを別々の世代にしないよう、ビルド成果物を一式で公開します。

2026-11-06にGitHub Actionsで単体試験・ブラウザ試験・ビルド・配信が成功しました。[実行記録](https://github.com/mov088420-cloud/tabi-receipts/actions/runs/42237295434)。workflowは参照時に確認した公式ActionのコミットSHAに固定しています。更新時は公式リポジトリの履歴と差分を確認します。GitHub公式の仕様は [カスタムworkflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) を参照してください。

## iPhone・iPadのホーム画面

1. HTTPS URLをSafariで開きます。
2. 共有メニューから **ホーム画面に追加** を選びます（OSによってメニュー位置/名称が異なります）。
3. 追加したアイコンで起動し、オフライン準備完了まで待ちます。
4. まず架空レシートで撮影/画像選択、保存、バックアップを試します。
5. 機内モードにし、Wi-Fiもオフにして、アプリを閉じて開き直します。OCR、一覧、保存が動くか確認します。

Safariタブとホーム画面アプリは保存領域が異なる場合があります。最初にホーム画面アプリを作成し、その中で記録を始めてください。既存データがある場合はバックアップで移行します。Mac/Windowsは通常のブラウザタブでも使えます。インストールUIの有無はブラウザに依存します。

## 更新

更新前にバックアップし、ソースの変更とテストを確認してworkflowを再実行します。アプリは新しいファイルをすべて取得してから更新を待機します。「更新あり」が表示された場合は、編集内容を保存して同一アプリのタブ/ウインドウをすべて閉じ、起動し直します。強制的な途中更新は行いません。IndexedDBはキャッシュ更新と別管理です。

## 同じGitHubアカウントの別サイトについて

`account.github.io/app-a/` と `account.github.io/app-b/` は同一オリジンです。パスはIndexedDBの安全境界ではありません。信頼できない別アプリを同じ配信元に公開しないでください。必要ならこのアプリ専用のGitHubアカウントのPages等、オリジン自体を分けます。独自ドメインの購入は必須ではありません。
