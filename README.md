# Unimate JP (`unimate-jp.com`)

オリジナル無料ブラウザゲーム・ポートフォリオ・開発ブログを 1 つのリポジトリで統合管理し、Cloudflare Pages へ自動デプロイするモノレポです。

## 公開URL構造

```text
https://unimate-jp.com/
├── /                         総合トップページ
├── /games/                   ゲームポータル（一覧・遊び方・攻略ガイド）
│   ├── mousoutero/           授業中妄想クライシス
│   ├── zonbi/                SHELTER MUSOU — 3Dゾンビ無双防衛
│   └── flashanzan/           無限フラッシュ暗算
├── /portfolio/               制作ポートフォリオ
├── /blog/                    個人開発・技術ブログ
├── /about/                   運営者情報
├── /privacy/                 プライバシーポリシー（AdSense・Cookie・localStorage対応）
├── /contact/                 お問い合わせ
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

# ビルド済み dist/ を本番と同じURL構造でローカル確認
npm run preview
```

---

## デプロイ＆独自ドメイン公開手順（Xserver × Cloudflare Pages）

### 1. GitHub にリポジトリを作成してプッシュ

1. GitHub で新しいリポジトリを作成します（例：`unimate-jp`、Public / Private どちらでも可）。
2. このディレクトリ（`unimate-jp/`）で以下を実行します：

```bash
git remote add origin https://github.com/<あなたのユーザー名>/unimate-jp.git
git branch -M main
git push -u origin main
```

### 2. Cloudflare Pages と GitHub リポジトリを接続

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にログイン（未作成なら無料アカウントを作成）。
2. 左メニュー **Workers & Pages** → **作成（Create）** → **Pages** → **Git に接続** を選択。
3. 作成した `unimate-jp` リポジトリを選択し、ビルド設定を以下にします：
   - **フレームワーク プリセット**: `なし (None)`
   - **ビルド コマンド**: `npm run build`
   - **ビルド出力ディレクトリ**: `dist`
   - （Node バージョンは `.node-version` により自動で `22` が使われます）
4. **保存してデプロイ** をクリックすると、`https://<project>.pages.dev/` で公開されます。

### 3. Xserver ドメイン（`unimate-jp.com`）を Cloudflare に接続

Cloudflare Pages で `www` なしのルートドメイン（`unimate-jp.com`）を使うには、**Xserver 側のネームサーバーを Cloudflare に向ける方法**が最も簡単・確実です。

1. Cloudflare ダッシュボードのホームで **ドメインを追加** をクリックし、`unimate-jp.com` を入力 → **Free プラン** を選択。
2. Cloudflare が指定する **2つのネームサーバー**（例：`xxxx.ns.cloudflare.com` / `yyyy.ns.cloudflare.com`）を控えます。
   - ※もし Xserver 側で `@unimate-jp.com` のメール機能を利用している場合は、Cloudflare 側の DNS 画面に既存の `MX` / `TXT (SPF等)` レコードが引き継がれていることを確認してください。
3. **XServer アカウント管理画面** → **ドメイン管理** → `unimate-jp.com` の **ネームサーバー設定** を開きます。
4. 「**その他のネームサーバーを使う**」を選択し、手順2で控えた Cloudflare のネームサーバー2つを入力して保存します。
5. 反映を待ちます（通常数分〜数時間、最大24時間）。Cloudflare 側でステータスが「アクティブ」になれば完了です。

### 4. Cloudflare Pages にカスタムドメインを設定

1. Cloudflare ダッシュボード → **Workers & Pages** → `unimate-jp` プロジェクト → **カスタムドメイン** タブを開く。
2. **カスタムドメインを設定** をクリックし、`unimate-jp.com` を入力 → **ドメインをアクティブ化**（DNSレコードとSSL証明書が自動設定されます）。
3. `www.unimate-jp.com` でもアクセスさせたい場合は、同様に `www.unimate-jp.com` も追加するか、Cloudflare の **ルール → リダイレクトルール** で `www.unimate-jp.com/*` → `https://unimate-jp.com/${1}`（301）へ転送設定するとURLが統一されて SEO 的にも最適です。

---

## 将来の Google AdSense 導入手順

### 審査前に確認すること
- `site/contact/index.html` のメールアドレス（現在 `contact@unimate-jp.com`）を、実際に受信できるメールアドレスまたは Google フォーム URL へ更新する。
- `site/about/index.html` の運営者表記を必要に応じて更新する。
- Google Search Console に `https://unimate-jp.com/` を登録し、サイトマップ `https://unimate-jp.com/sitemap.xml` を送信する。

### AdSense 審査タグ＆`ads.txt` の一括有効化
このリポジトリの `scripts/build-all.mjs` は、環境変数 `ADSENSE_CLIENT_ID` を読み取って自動で全HTMLへタグ挿入＆`ads.txt` 生成を行います。

1. Cloudflare Pages の対象プロジェクト → **設定 → 環境変数** に以下を追加（Production）：
   - 変数名: `ADSENSE_CLIENT_ID`
   - 値: `ca-pub-xxxxxxxxxxxxxxxx`（Google AdSense 管理画面で発行されたパブリッシャーID）
   - （Google Analytics 4 を使う場合は `GA_MEASUREMENT_ID=G-XXXXXXXXXX` も同様に指定可能）
2. Cloudflare Pages で再デプロイすると、以下が自動反映されます：
   - サイト内および全ゲームのHTML `<head>` に AdSense スクリプトを自動挿入
   - `https://unimate-jp.com/ads.txt` を自動生成

---

## コンテンツの追加方法

### 新しいゲームを追加するとき
1. `games/<ゲーム名>/` に Vite プロジェクトを作成（`vite.config.ts` に `base: './'` を設定）。
2. `npm install`（ルートでワークスペース反映）し、`npm run build` で自動的に `dist/games/<ゲーム名>/` へビルドされます。
3. `site/games/index.html`（および必要に応じて `site/index.html`, `site/portfolio/index.html`, `site/public/sitemap.xml`）に紹介カードとリンクを追加してプッシュすれば自動公開されます。

### ブログ記事を追加するとき
1. `site/blog/posts/<記事スラッグ>/index.html` を作成（既存記事をコピーして編集すると簡単です）。
   - `site/vite.config.ts` が自動で HTML を検出するため、設定ファイルの編集は不要です。
2. `site/blog/index.html` と `site/public/sitemap.xml` に記事リンクを追加してプッシュします。

---

## （任意）旧 GitHub Pages URL からのリダイレクト

旧 URL（`https://gemukaihatsu1729.github.io/mousoutero/` や `/zonbi/`）をすでに SNS 等で共有している場合、旧リポジトリ側の `index.html` を次のようなリダイレクト専用ページに差し替えると、既存の訪問者を新ドメインへ自動誘導できます。

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=https://unimate-jp.com/games/mousoutero/" />
    <link rel="canonical" href="https://unimate-jp.com/games/mousoutero/" />
    <title>移転しました | Unimate JP</title>
  </head>
  <body>
    <p>移転しました。<a href="https://unimate-jp.com/games/mousoutero/">https://unimate-jp.com/games/mousoutero/</a> へ移動します。</p>
  </body>
</html>
```
