# ZAPELM (Zap Element)

任意のウェブサイト上で「不要な DOM 要素 (ポップアップ・広告・通知など)」を簡単に選択し、
自動で非表示または削除できる Firefox 拡張機能である。

![zapelm](https://raw.githubusercontent.com/niumlaque/i/28f3860536490bb42b5f55b38ed1d8c756280b34/i/931c6894-1326-4315-ba5f-ade4c5cef734.gif "zapelm")

## 概要

ZAPELM は雑多なページから不要な要素を手早く取り除くための拡張機能である。

`Alt + Shift + Z` でピッカーを起動し、ハイライトされた要素を非表示にするか削除するか選ぶだけで、ドメイン単位のセレクタルールが保存される。

次回以降は同じサイトを開くたびにルールが自動で走り、後から挿入された要素にも対応しつつ設定はすべてローカルで完結する。

## 背景

私は Firefox を Private Window で利用することが多い。

Private Window で Google へアクセスするとこいつらは毎回 Google のログインを要求してくるし、  
他のサイトでも「xxx からの通知を受け取りませんか？」「Firefox 拡張機能を追加しませんか？」「Cookie を許可してください」といった確認が高頻度で現れる。

ページを開くたび同じ問いかけに応じるのは時間を奪われる感覚が強く、閲覧の流れが中断されてしまう。
この煩わしさを取り除くためにこの拡張機能を作成した。

## 主な機能

-   要素ピッカー
    -   ショートカット Alt + Shift + Z で起動。
    -   ホバーした要素をハイライトし、クリックで登録。
-   ルール保存
    -   ドメイン単位で CSS セレクタを保存。
    -   動作モード: hide または remove
    -   適用タイミング: 常時 / 遅延監視 (MutationObserver)
-   自動適用
    -   サイト訪問時にルールを読み込み。
    -   動的に挿入された要素にも対応。
-   一時解除
    -   ショートカット Alt + Shift + X で有効 / 無効を切り替え。
-   管理 UI
    -   サイトごとのルール一覧を表示。
    -   ルールの追加・編集・削除が可能。
    -   JSON 形式でのインポート / エクスポートをサポート。

## インストール (GitHub リリース版)

1. [GitHub Releases](https://github.com/niumlaque/zapelm/releases) を開き、最新の `zapelm-<VERSION>.zip` アセットをダウンロードする。
2. ZIP を展開し、署名済みの `.xpi` ファイル (例: `zapelm-<VERSION>.xpi`) を取り出す。
3. Firefox で `about:addons` を開く。
4. 歯車アイコンから「ファイルからアドオンをインストール…」を選び、展開した `.xpi` を指定してダイアログの指示に従う。
5. インストール後、拡張機能ツールバーのメニューから ZAPELM アイコンをピン留めしておくとアクセスしやすい。

## 使い方

1. 対象ページを開く。
2. Alt + Shift + Z を押してピッカーを起動する。
3. 消したい要素をクリックする。
4. 表示されるダイアログで「非表示」または「削除」を選択する。
5. 次回以降、そのサイトでは自動で同じ要素が処理される。
6. 一時的に無効化したい場合は Alt + Shift + X を押す。

## 開発者向け情報

### 開発環境

Docker + DevContainer 上で開発できる。

### コマンド一覧

| コマンド          | 説明                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| npm run typecheck | TypeScript の型チェックのみを実行                                        |
| npm run build     | TypeScript をビルド (esbuild バンドル) し、静的アセットを `dist/` へ配置 |
| npm run lint      | ESLint による構文チェック                                                |

### ビルド方法

このリポジトリではビルドを Docker コンテナ内で行う。

ホスト環境から次のスクリプトを実行すると依存関係のインストールと `npm run build` が実行され、  
成果物が `artifacts/zapelm-extension.zip` に出力される。

```
$ ./scripts/build-extension.sh
```

### 動作確認方法

1. `npm run build` を実行して `dist/` に成果物を生成する。
2. Firefox で `about:debugging#/runtime/this-firefox` を開く。
3. 「一時的なアドオンを読み込む…」を選択し、`manifest.json` を指定する。
    - 現在は Firefox Manifest V2 で動作しており、将来的に V3 への移行を予定している。
4. 拡張機能が読み込まれるとブラウザ右上にアイコンが表示される。

### XPI パッケージの作成

`manifest.json` と `dist/` を含む ZIP を作成し、[Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/) へアップロードすると未公開 (unlisted) 署名済み XPI を取得できる。

### デバッグログの利用

ポップアップ上部のトグルをオンにすると Applied hide rules / Matched elements for removal / Re-removing tracked element などのログが対象ページのコンテンツコンソールに出力され、オフにすると停止する。

### 注意点

-   対象要素がページ読み込み後に挿入される場合は、「When to apply」を「Monitor and apply to new elements」に切り替えること。  
    「Apply on page load」のままだと初期 DOM に存在する要素にしか適用されない。

### セキュリティ原則

-   収集データなし (完全ローカル動作)
-   外部サーバ通信なし
-   ユーザーの設定はブラウザストレージにのみ保存

### Manifest バージョンについて

-   現時点では Firefox の Manifest V2 API を利用している。
-   Firefox の MV3 対応が安定した段階で service worker ベースへ移行する計画である。
