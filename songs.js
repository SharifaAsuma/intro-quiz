/* =====================================================================
 * songs.js  ―  出題データ（曲リスト）
 * ---------------------------------------------------------------------
 * 曲を追加したいときは、このファイルだけ編集すればOKです。
 *
 * 手順:
 *   1. 音源ファイル(mp3 / m4a / wav など)を「audio」フォルダに入れる
 *   2. 下の SONGS の中に1曲分の { ... }, を追加する
 *
 * 各項目の意味:
 *   title    : 曲名（正解として表示されます）
 *   artist   : アーティスト名（選択肢・答え合わせに表示されます）
 *   file     : 音源ファイルのパス（"audio/ファイル名"）
 *   startSec : イントロの開始位置(秒)。冒頭から流すなら 0
 *              ※無音が長い曲は 1〜2 にするとテンポ良く遊べます
 *
 * 注意: 最後の } のあとのカンマ「,」を忘れないでください。
 * 4択モードで遊ぶには、最低4曲必要です（3曲以下は司会者モードのみ）。
 * ===================================================================== */

const SONGS = [
	// ↓ これは書き方の見本です。実際の曲が決まったら書き換えてください。
	//   見本のままだと音源が無いので、再生時にエラー表示になります。
	{ title: "三日月", artist: "絢香", file: "audio/三日月.mp3", startSec: 0 },
	{ title: "楓", artist: "スピッツ", file: "audio/楓.mp3", startSec: 0 },
	{ title: "ツキミソウ", artist: "Novelbright", file: "audio/Novelbright.mp3", startSec: 0 },
	{ title: "サウタージ", artist: "ポルノグラフィティ", file: "audio/ポルノグラフィティ.mp3", startSec: 0 },
	{ title: "月光", artist: "鬼束ちひろ", file: "audio/月光.mp3", startSec: 0 },
	{ title: "奏", artist: "スキマスイッチ", file: "audio/奏.mp3", startSec: 0 },
	{ title: "Pretender", artist: "Official髭男", file: "audio/Pretender.mp3", startSec: 0 },
	{ title: "Flavor of Life", artist: "宇多田ヒカル", file: "audio/Flavor of Life.mp3", startSec: 0 },
	{ title: "三日月サンセット", artist: "サカナクション", file: "audio/三日月サンセット.mp3", startSec: 0 },
	{ title: "唱", artist: "Ado", file: "audio/唱.mp3", startSec: 0 },
	{ title: "Crazy Party Night ～ぱんぷきんの逆襲～", artist: "きゃりーぱみゅぱみゅ", file: "audio/Crazy Party Night ～ぱんぷきんの逆襲～.mp3", startSec: 0 },
	{ title: "恋音と雨空", artist: "AAA", file: "audio/恋音と雨空.mp3", startSec: 0 },
];
