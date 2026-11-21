# Unimate JP (`unimate-jp.com`)

オリジナル無料ブラウザゲーム・ポートフォリオ・開発ブログを 1 つのリポジトリで統合管理し、Cloudflare Workers Static Assets へ自動デプロイするモノレポです。

## 公開URL構造

```text
https://unimate-jp.com/
├── /                         総合トップページ（ゲーム・目的別ガイド・ブログ・FAQ・更新履歴）
├── /games/                   ゲームポータル（一覧・詳細データ表・攻略ガイド）
│   ├── mousoutero/           授業中妄想クライシス
│   ├── zonbi/                SHELTER MUSOU — 3Dゾンビ無双防衛
│   └── flashanzan/           無限フラッシュ暗算
├── /portfolio/               制作ポートフォリオ（ケーススタディ・技術構成）
├── /blog/                    個人開発・技術ブログ（全8記事＋カテゴリ絞り込み）
├── /about/                   運営者情報
├── /privacy/                 プライバシーポリシー（AdSense・Cookie・localStorage対応）
├── /contact/                 お問い合わせ
├── /common/js/result-ad.js   全ゲーム共通のリザルト画面専用・安全広告スクリプト
├── /robots.txt
├── /sitemap.xml
└── /ads.txt                  （ADSENSE_CLIENT_ID 設定時に自動生成）
```

## ローカル開発コマンド

```bash
# 初回インストール（全ワークスペース一括）
npm install

# サイト本体の開発サーバー起動
npm run dev:site

# 個別ゲームの開発サーバー起動
npm run dev:mousoutero
npm run dev:zonbi
npm run dev:flashanzan

# 全ゲームのユニットテスト実行
npm test

# 本番用の一括ビルド（dist/ にサイト本体 + games/* を統合出力）
npm run build

# ビルド成果物の自動検証（リンク整合・サイトマップ・広告配置・プレースホルダー検証）
npm run verify

# ビルド済み dist/ を本番と同じURL構造でローカル確認
# ※ localhost では各ゲームのリザルト画面に 320×100 の点線広告プレビューが表示されます
npm run preview
```

---

## デプロイ構成（Xserver ドメイン × Cloudflare Workers Static Assets）

- `wrangler.jsonc` により `./dist` を Workers Static Assets として配信し、`custom_domain: true` で `unimate-jp.com` を割り当てています。
- GitHub の `main` ブランチへプッシュすると、Cloudflare Workers Builds が以下を自動実行して本番反映します：
  1. ビルドコマンド: `npm run build`
  2. デプロイコマンド: `npx wrangler deploy`
- `www.unimate-jp.com` へのアクセスは Cloudflare のリダイレクトルールで `https://unimate-jp.com/`（301）へ転送設定済みです。

---

## Google AdSense の導入・安全設計

### 既存3ゲームのリザルト画面広告（`/common/js/result-ad.js`）
プレイヤーの誤タップとポリシー違反を防ぐため、全ゲームに共通スクリプトで以下の安全仕様を組み込んでいます：

- **プレイ中の広告ゼロ**: 仮想スティックやテンキーが出るプレイ画面には一切配置せず、リザルト／ゲームオーバー画面の最上部のみに配置。
- **ボタンから150px以上離隔**: 広告枠の直下にランク・スコア・戦績サマリーを挟み、シェア／リトライボタンまで 250px〜350px 以上の間隔を確保。
- **600ms 表示遅延＋CLSゼロ**: 最初から `320×100`（＋ラベル 16px）の領域を確保してレイアウトズレを防ぎつつ、リザルト表示から 600ms 間は非表示・クリック不可（`visibility: hidden; pointer-events: none`）。
- **1ページ滞在1回のみロード**: リトライして再度リザルトを開いても `adsbygoogle.push({})` を再実行しません。
- **審査前は完全非表示**: 環境変数 `ADSENSE_RESULT_SLOT_ID` が未設定のあいだは `hidden` 属性が維持され、本番ページに空枠は一切表示されません（ローカル `localhost` または `?adpreview=1` 時のみ点線プレビュー表示）。

### 審査申請前〜合格後の手順
1. **審査前の確認**:
   - `site/contact/index.html` のメールアドレス（現在 `contact@unimate-jp.com`）を、実際に受信できるメールアドレスまたは Google フォーム URL へ差し替える。
   - Google Search Console に `https://unimate-jp.com/` を登録し、サイトマップ `https://unimate-jp.com/sitemap.xml` を送信する。
2. **AdSense 審査コードの有効化（審査申請時）**:
   - Cloudflare ダッシュボード → **Workers & Pages** → `unimate-jp` → **設定 → ビルド → ビルド変数とシークレット** に `ADSENSE_CLIENT_ID=ca-pub-xxxxxxxxxxxxxxxx` を追加して再デプロイすると、全HTMLの `<head>` へ AdSense タグが挿入され、`https://unimate-jp.com/ads.txt` も自動生成されます。
3. **リザルト画面バナーの有効化（審査合格後）**:
   - AdSense 管理画面でゲームリザルト用のディスプレイ広告ユニット（**サイズ固定 320×100 推奨**）を作成し、発行されたスロットIDを Cloudflare 側のビルド変数 `ADSENSE_RESULT_SLOT_ID=<数字のみ>` に設定して再デプロイすると、全ゲームのリザルト画面で広告が自動で有効になります。
   - ※ゲームページで誤タップを防ぐため、AdSense 管理画面の「自動広告（Auto Ads）」は無効にするか `/games/*` を除外設定にすることをおすすめします。

---

## コンテンツの追加方法

### 新しいゲームを追加するとき
1. `games/<ゲーム名>/` に Vite プロジェクトを作成（`vite.config.ts` に `base: './'` を設定）。
2. リザルト画面へ広告枠を含める場合は、`<head>` に `<script defer src="/common/js/result-ad.js"></script>` を入れ、リザルトカード最上部に `<div class="result-ad" data-result-ad="<ゲーム名>" hidden></div>` を配置します。
3. `npm install`（ルートでワークスペース反映）し、`npm run build && npm run verify` で `dist/games/<ゲーム名>/` への統合と整合性を確認します。
4. `site/games/index.html`（および `site/index.html`, `site/portfolio/index.html`, `site/public/sitemap.xml`）に紹介カードとリンクを追加してプッシュすれば自動公開されます。

### ブログ記事を追加するとき
1. `site/blog/posts/<記事スラッグ>/index.html` を作成（既存記事をコピーして編集すると簡単です）。
   - `site/vite.config.ts` が自動で HTML を検出するため、ビルド設定の編集は不要です。
2. `site/blog/index.html` と `site/public/sitemap.xml`、`scripts/build-all.mjs` の `requiredOutputs` に記事パスを追加してプッシュします。
