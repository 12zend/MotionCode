# MotionCode IDE

コードから文字PV・モーショングラフィックスを生成する、ブラウザ上の制作IDEです。React / TypeScript / Monaco / WebGL2で実装しています。

```sh
npm install
npm run dev
```

開発URL: http://127.0.0.1:5173

```sh
npm test       # コンパイラ・ランタイムのユニット／統合テスト
npm run build # 型チェックと本番ビルド
node tests/browser.mjs # 開発サーバー起動後、Chromeで実描画を検証
```

ブラウザテストはmacOSのChromeを既定で使用します。別の環境では `CHROME_PATH` にChrome/Chromiumの実行ファイルを指定してください。

## 制作の流れ

1. 左側Mediaへ画像・動画・音声・フォント・GLSLをドロップします。
2. `main.motion` にMotionScriptを書きます。変更後250msで自動コンパイルします。
3. プレビューを再生、またはシークして任意の時刻を確認します。
4. Saveで素材を埋め込んだ単一の `.motion` ファイルを保存します。初回に保存先を選び、2回目以降のCtrl/Cmd+Sは同じファイルを上書きします。Openで復元できます。

初期画面はMedia・コード・プレビューの3領域です。ツールバーのPanelsからTimeline、Properties、Console、Search、Compilerを開きます。パネル境界をドラッグしてサイズを調整できます。グレーのUIに統一し、常時表示する情報を抑えています。

Mediaをダブルクリックするとコードを挿入します。Shaderはソースを開きます。素材アイコンからエディタへドラッグすると描画コード、素材名からドラッグすると文字列参照を挿入します。選択した素材の名前変更、複製、削除、使用箇所への移動ができます。

## MotionScript

JavaScriptの変数、関数、条件分岐、ループ、配列、オブジェクトを使用できます。`group {}` が追加構文です。

```js
// t1 は開始時刻、t2 は終了時刻。区間は [t1, t2) 秒。
draw("image.png", 100, 100, 0, 1, 0, 5, "#ffffff");
text("HELLO", "Inter", 100, 200, 0, 1, 1, 4, "#ffffff");

text("MOTION", {
    font: "Inter-Bold",
    position: [ease("out", -500, 300, 0, 1), 300, 0],
    size: 180,
    scale: 1,
    rotation: 0,
    anchorPoint: [0, 0],
    opacity: 1,
    letterSpacing: 6,
    t1: 0,
    t2: 5,
    color: "#ffffff"
});

rect({ position: [100, 100, 0], width: 400, height: 100, t1: 2, t2: 7 });
circle({ position: [500, 100, 0], width: 200, height: 200, t1: 0, t2: 10 });
```

簡易引数は `draw(file, x, y, z, scale, t1, t2, color, anchorPoint = [0, 0])` と `text(content, font, x, y, z, scale, t1, t2, color, anchorPoint = [0, 0])` です。時間の省略時は `t1 = 0`、`t2 = プロジェクト終了時刻` です。描画オブジェクトに `duration` は使用しません。プロジェクト全体の長さだけはPropertiesの `duration` で設定します。画面中心が `(0, 0)`、右が+X、上が+Y、下が-Y、zが重なり順です。1920×1080では左上が `(-960, 540)`、右下が `(960, -540)` です。`mouse.x / mouse.y` も同じ中心原点です。`anchorPoint` もオブジェクト中央が `[0, 0]` です。オブジェクト中央からのピクセル座標を指定し、右が+X、上が+Y、下が-Yです。省略時は `[0, 0]`。例えば `[100, -50]` は中央から右100px・下50pxの点を回転／拡縮の基準にします。プレビューでオブジェクトを選択しPropertiesを開くと、X/Y入力と9点プリセットから変更でき、コードに反映されます。従来の `anchor` キーも同じ中央基準のピクセル指定として受け付けます。

`time`, `frame`, `fps`, `width`, `height`, `resolution`, `mouse.x`, `mouse.y`, `audio.level`, `audio.bass`, `audio.mid`, `audio.high` を利用できます。`random()` と `Math.random()` はプロジェクトseedに基づきます。

```js
ease(type, v0, v1, t0, t1, power = 2, speed = 0)
```

`in`, `out`, `inout`, `circin`, `circout`, `circinout`, `expoin`, `expoout`, `expoinout` に対応します。expo系はpowerを使用しません。speedは残り距離へのelastic振動（`1 - cos(経過秒 × speed)`、秒単位の角速度）で、`speed = 0` は素のイージングです。ここでeaseの `t0 / t1` は補間の開始／終了時刻であり、描画の存在区間とは独立です。

## GLSLとグループ

```js
group {
    text("HELLO", { font: "Inter-Bold", position: [200, 300, 0], t1: 0, t2: 5 });
    shader("glitch.frag", { amount: 0.8, speed: 2.0 });
    shader("chromatic.frag", 0.4);
}
// この文字には上のエフェクトはかかりません。
text("CLEAN", { position: [200, 600, 0], t1: 0, t2: 5 });
```

`glitch(0.8, 2)` のようにShaderのファイル名（拡張子なし）を関数として呼び出すこともできます。

各グループをオフスクリーンへ描画し、複数のShader Passを順番に処理して親へ合成します。標準のブレンドは `normal`, `add`, `screen`, `multiply`, `overlay`, `difference` です。描画オプションの `blend` に指定します。

```glsl
@range(0, 2)
uniform float intensity;

void main(image) {
    vec2 uv = u_pixel / u_resolution + vec2(0.5);
    vec3 source = texture2D(image, uv).rgb;
    return source * intensity;
}
```

`void main(image)`、`texture2D(image, uv)`、`texture2D(image, u, v)`、`return vec3` をGLSL ES 3.00へ変換します。入力映像のアルファを維持します。`u_resolution`, `u_time`, `u_pixel`, `u_mouse`, `u_image` を提供します。`u_resolution` はプロジェクト解像度です。GLSLの `u_pixel` / `u_mouse` も画面中央が `(0, 0)`、上が+Y、下が-Yのピクセル座標です。テクスチャのUVには `u_pixel / u_resolution + vec2(0.5)` で変換できます。プレビュー品質を下げても公開座標の単位は変わりません。

MediaでShaderを選び、Panels → Propertiesを開くと、`float`, `int`, `bool`, `vec2/3/4` のuniformから入力UIを生成します。UIの値はコード指定を上書きするプロジェクト設定として保存します。停止中でも即時反映されます。

## 保存・エクスポート・音声

- 保存先のファイルハンドルもIndexedDBに保持し、再読み込み後に再利用します。必要な場合はブラウザが書き込み許可を確認します。File System Access API非対応ブラウザでは通常のダウンロードになり、同じファイルへの上書きはできません。
- IndexedDBへ自動保存します。`.motion` はversion付きJSONで、素材バイト列をData URLとして埋め込みます。
- UUIDと素材名を別管理します。Renameで参照リテラルを更新し、旧名の別名も保持します。
- PNG / WebPで現在フレームを保存できます。WebMはプレビューと同じCanvasのリアルタイム録画です。現在の解像度設定を使用します。
- `audio("music.mp3", 1, 0)` で音声を再生します。Play操作によりWeb Audioを開始し、周波数帯域を解析します。
- 動画はHTMLVideoElementからWebGLテクスチャへ転送します。MOVなどのデコード可否はブラウザのコーデック対応に依存します。

## ショートカット

- Cmd/Ctrl+S: 初回は保存先を選択、以降は同じ `.motion` ファイルへ上書き
- Cmd/Ctrl+Shift+S: 別名で保存（次回以降はこちらのファイルを使用）
- Cmd/Ctrl+Enter: コンパイル
- Space: 再生／一時停止（エディタ・入力欄以外）
- F: プレビュー全画面（エディタ・入力欄以外）
- Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z: エディタ、または素材・プロジェクト変更のUndo/Redo

## 実装境界

- コンパイラはAcornによる字句解析・拡張AST・意味解析・Motion IR・JavaScript生成を分離しています。CompilerパネルでIRと生成コードを確認できます。
- 実行はWorker内で行い、無限ループは2秒でWorkerを終了します。修正後に自動復帰します。WorkerはUI停止を防ぐ境界であり、任意のJavaScriptを安全に実行するセキュリティサンドボックスではありません。信頼できるコードを使用してください。
- 同一ソースとアセット名表のコンパイル結果を再利用します。Shaderだけの変更ではJavaScript解析を再利用し、GPUプログラムは変更されたShaderだけ更新します。一般的なAST部分差分コンパイルは今後の拡張です。
- 文字はフォントサイズに合わせたCanvas2DテクスチャをWebGLで合成しています。SDF/MSDF、大きく拡大した際の再ラスタライズ、アウトライン以外の高度な文字効果は今後の拡張です。
- WebMは現時点で映像のみ・リアルタイム録画です。音声mux、フレーム保証のオフライン書き出し、MP4、動画の完全なフレーム精度は未実装です。
- イベント、複数Scene、マスク、3D、パーティクル、アニメーショングラフは拡張対象です。基本グループは論理階層とShader分離を提供します。

詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。
