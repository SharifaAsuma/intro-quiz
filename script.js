/* =====================================================================
 * script.js  ―  イントロクイズの動作ぜんぶ
 * ---------------------------------------------------------------------
 * 目次
 *   1. 設定値（ここを変えると難易度や点数が変わる）
 *   2. 状態（いま何問目か、点数はいくつか、など）
 *   3. 画面の部品を取得
 *   4. 便利関数（シャッフル、画面切替など）
 *   5. 曲データの管理（songs.js の曲 ＋ その場で追加した曲）
 *   6. スタート画面の処理
 *   7. クイズの進行（出題 → 再生 → 回答 → 次へ）
 *   8. 音の再生制御（イントロを指定秒数だけ流す）
 *   9. 結果画面
 *  10. 起動処理
 * ===================================================================== */

"use strict"; // 書き間違いをエラーにしてくれる設定


/* ---------------------------------------------------------------------
 * 1. 設定値
 * ------------------------------------------------------------------- */

// イントロを聴ける長さ（秒）。「もう少し長く聴く」で次の段階へ進む
const STAGE_SECONDS = [1, 3, 5, 10];

// 何段階目で正解したかによる得点（早く当てるほど高得点）
const STAGE_POINTS = [10, 7, 5, 3];

// 4択モードの選択肢の数
const CHOICE_COUNT = 4;

// 答え合わせのとき、曲を流す秒数
const REVEAL_SECONDS = 8;

// 参加者の最大人数（司会者モード）
const MAX_PLAYERS = 8;


/* ---------------------------------------------------------------------
 * 2. 状態（アプリが覚えておく情報）
 * ------------------------------------------------------------------- */
const state = {
	mode: "choice",     // "choice"(4択) か "host"(司会者)
	questions: [],      // 今回出題する曲の配列
	index: 0,           // いま何問目か（0始まり）
	score: 0,           // 合計点
	stage: 0,           // いま何段階目のイントロ長か（STAGE_SECONDS の添字）
	answered: false,    // この問題はもう回答済みか
	results: [],        // 結果一覧 [{ song, correct, point }]
	players: [],        // 参加者 [{ name: "太郎", score: 0 }, ...]（司会者モード用）
};

// その場で追加した曲（ページを閉じると消える）
const addedSongs = [];

// 再生制御用のタイマー類
let stopTimerId = null;   // 「◯秒たったら止める」タイマー
let rafId = null;         // バーのアニメーション用


/* ---------------------------------------------------------------------
 * 3. 画面の部品を取得（HTMLの id と対応している）
 * ------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const screens = {
	start: $("screen-start"),
	quiz: $("screen-quiz"),
	result: $("screen-result"),
};

const player = $("player"); // <audio> 要素


/* ---------------------------------------------------------------------
 * 4. 便利関数
 * ------------------------------------------------------------------- */

// 画面を切り替える（"start" / "quiz" / "result"）
function showScreen(name) {
	Object.values(screens).forEach((el) => el.classList.remove("is-active"));
	screens[name].classList.add("is-active");
	window.scrollTo(0, 0);
}

// 配列をランダムに並べ替える（Fisher–Yates法）。元の配列は変えない
function shuffle(array) {
	const a = [...array];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

// 要素を作って文字を入れる（textContent を使うので、曲名に記号が入っても安全）
function el(tag, className, text) {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
}


/* ---------------------------------------------------------------------
 * 5. 曲データの管理
 * ------------------------------------------------------------------- */

// 使える曲ぜんぶ ＝ songs.js の曲 ＋ その場で追加した曲
function getAllSongs() {
	// songs.js が読み込めていない場合に備えて typeof で確認
	const base = typeof SONGS !== "undefined" ? SONGS : [];
	return [...base, ...addedSongs];
}

// 「登録中の曲」の一覧を画面に描き直す
function renderSongList() {
	const list = $("song-list");
	list.textContent = ""; // 一旦空にする
	const songs = getAllSongs();
	$("song-count").textContent = `(${songs.length}曲)`;

	songs.forEach((song) => {
		const li = el("li");
		const info = el("span");
		info.append(el("span", "", song.title), el("br"), el("span", "sub", song.artist || "（アーティスト不明）"));
		li.append(info);

		// その場で追加した曲だけ「削除」ボタンを付ける
		if (song.isAdded) {
			const del = el("button", "", "削除");
			del.addEventListener("click", () => {
				URL.revokeObjectURL(song.file); // 一時URLを解放
				addedSongs.splice(addedSongs.indexOf(song), 1);
				refreshStartScreen();
			});
			li.append(del);
		}
		list.append(li);
	});
}

// 「曲をその場で追加する」ボタンの処理
function handleAddSong() {
	const title = $("add-title").value.trim();
	const artist = $("add-artist").value.trim();
	const start = parseFloat($("add-start").value) || 0;
	const file = $("add-file").files[0];
	const msg = $("add-message");

	// 入力チェック
	if (!title) { msg.textContent = "曲名を入力してください。"; return; }
	if (!file) { msg.textContent = "音源ファイルを選んでください。"; return; }

	addedSongs.push({
		title,
		artist,
		file: URL.createObjectURL(file), // ブラウザ内だけで使える一時URL
		startSec: Math.max(0, start),
		isAdded: true,
		fileName: file.name,             // songs.js 用の記述づくりに使う
	});

	// フォームを空に戻す
	$("add-title").value = "";
	$("add-artist").value = "";
	$("add-start").value = "0";
	$("add-file").value = "";
	msg.textContent = `「${title}」を追加しました。`;
	refreshStartScreen();
}

// 「songs.js 用の記述をコピー」ボタンの処理
async function handleCopySnippet() {
	const msg = $("add-message");
	if (addedSongs.length === 0) { msg.textContent = "追加した曲がありません。"; return; }

	// songs.js にそのまま貼れる形の文章を作る
	const text = addedSongs.map((s) =>
		`  { title: ${JSON.stringify(s.title)}, artist: ${JSON.stringify(s.artist)}, ` +
		`file: ${JSON.stringify("audio/" + s.fileName)}, startSec: ${s.startSec} },`
	).join("\n");

	try {
		await navigator.clipboard.writeText(text);
		msg.textContent = "コピーしました。songs.js の SONGS の中に貼り付けてください（音源は audio フォルダへ）。";
	} catch (e) {
		// コピーが使えない環境では、表示してそこからコピーしてもらう
		window.prompt("これをコピーして songs.js に貼り付けてください", text);
	}
}


/* ---------------------------------------------------------------------
 * 6. スタート画面の処理
 * ------------------------------------------------------------------- */

// 選択中のモードを返す
function getSelectedMode() {
	return document.querySelector('input[name="mode"]:checked').value;
}

// 曲数やモードに合わせて、出題数の選択肢とスタートボタンの状態を更新
function refreshStartScreen() {
	const total = getAllSongs().length;
	const mode = getSelectedMode();
	const select = $("select-count");
	const startBtn = $("btn-start");
	const msg = $("start-message");

	// 出題数の候補: 3, 5, 10 のうち曲数以内のもの ＋ 「全曲」
	const options = [3, 5, 10].filter((n) => n < total);
	if (total > 0) options.push(total);

	const previous = select.value; // 以前の選択を覚えておく
	select.textContent = "";
	options.forEach((n) => {
		const opt = el("option", "", n === total ? `全${n}問` : `${n}問`);
		opt.value = n;
		select.append(opt);
	});
	if (options.map(String).includes(previous)) select.value = previous;

	// 司会者モードのときだけ、参加者の入力欄を表示する
	$("player-area").hidden = mode !== "host";

	// スタートできるかチェック
	if (mode === "choice" && total < CHOICE_COUNT) {
		msg.textContent = `4択モードには${CHOICE_COUNT}曲以上必要です（いま${total}曲）。曲を追加するか、司会者モードを選んでください。`;
		startBtn.disabled = true;
	} else if (total < 1) {
		msg.textContent = "曲が登録されていません。songs.js に曲を追加してください。";
		startBtn.disabled = true;
	} else if (mode === "host" && state.players.length < 1) {
		msg.textContent = "参加者を1人以上追加してください。";
		startBtn.disabled = true;
	} else {
		msg.textContent = "";
		startBtn.disabled = false;
	}

	renderPlayerList(); // 参加者の一覧も描き直す

	renderSongList();
}


/* ---------------------------------------------------------------------
 * 7. クイズの進行
 * ------------------------------------------------------------------- */

// 「スタート」を押したとき
function startQuiz() {
	const count = parseInt($("select-count").value, 10);

	state.mode = getSelectedMode();
	state.questions = shuffle(getAllSongs()).slice(0, count); // ランダムに count 曲選ぶ
	state.index = 0;
	state.score = 0;
	state.players.forEach((p) => (p.score = 0)); // 参加者全員の点数を0に戻す
	state.results = [];

	showScreen("quiz");
	loadQuestion();
}

// 1問ぶんの画面を準備する
function loadQuestion() {
	const song = state.questions[state.index];
	state.stage = 0;
	state.answered = false;

	stopAudio();
	setBarWidth(0);

	// 上部の表示（何問目か・点数）
	$("quiz-progress").textContent = `第${state.index + 1}問 / ${state.questions.length}`;
	$("quiz-score").textContent = `${state.score} pt`;

	// モードによって、点数の表示を切り替える
	$("quiz-score").hidden = state.mode !== "choice";   // 4択: 1人分の点数
	$("scoreboard").hidden = state.mode !== "host";     // 司会者: 参加者ごとの得点表
	renderScoreboard(null);                             // 得点表を描き直す

	// 回答後の表示は隠す
	$("answer-box").hidden = true;
	$("host-judge").hidden = true;
	$("btn-next").hidden = false;

	// モードによって表示するものを変える
	$("choices").textContent = "";
	$("host-controls").hidden = state.mode !== "host";
	if (state.mode === "choice") buildChoices(song);

	// 音源を読み込む
	player.src = song.file;
	player.load();

	updateStageUI();
}

// 4択の選択肢を作る（正解1つ ＋ ほかの曲からランダムに3つ）
function buildChoices(correctSong) {
	const others = shuffle(getAllSongs().filter((s) => s !== correctSong)).slice(0, CHOICE_COUNT - 1);
	const choices = shuffle([correctSong, ...others]);

	choices.forEach((song) => {
		const btn = el("button", "choice");
		btn.type = "button";
		btn.append(el("span", "", song.title));
		if (song.artist) btn.append(el("span", "artist", song.artist));
		btn.addEventListener("click", () => answerChoice(song, btn));
		$("choices").append(btn);
	});
}

// 4択で選択肢を押したとき
function answerChoice(selectedSong, selectedBtn) {
	if (state.answered) return;
	state.answered = true;

	const correctSong = state.questions[state.index];
	const isCorrect = selectedSong === correctSong;

	// 選択肢ボタンを色分けして、押せなくする
	const buttons = $("choices").querySelectorAll(".choice");
	buttons.forEach((btn) => {
		btn.disabled = true;
	});
	// 正解のボタンを探して緑に（タイトル文字で判定）
	buttons.forEach((btn) => {
		if (btn.firstChild.textContent === correctSong.title) btn.classList.add("is-correct");
	});
	if (!isCorrect) selectedBtn.classList.add("is-wrong");

	finishQuestion(isCorrect);
}

// 司会者モード: 「答えを見る」を押したとき
function revealForHost() {
	if (state.answered) return;
	const song = state.questions[state.index];

	$("host-controls").hidden = true;
	$("answer-box").hidden = false;
	$("answer-result").textContent = "";
	$("answer-result").className = "answer-result";
	$("answer-song").textContent = `${song.title} / ${song.artist || "アーティスト不明"}`;
	$("btn-next").hidden = true;      // 採点が終わるまで「次へ」は出さない
	$("host-judge").hidden = false;   // 正解／不正解ボタンを出す
	buildJudgeButtons();   // 参加者の名前ボタンを作る

	playFrom(song.startSec, REVEAL_SECONDS, false); // 曲を流して答え合わせ
}

// 司会者モード: 正解した人が決まったとき（winner は参加者。正解者なしは null）
function judgeForHost(winner) {
	if (state.answered) return;
	state.answered = true;
	$("host-judge").hidden = true;
	$("btn-next").hidden = false;
	finishQuestion(winner !== null, winner);
}

// 得点表を描き直す。winnerName の人だけ光らせる（いなければ null）
function renderScoreboard(winnerName) {
	const board = $("scoreboard");
	board.textContent = "";
	state.players.forEach((p) => {
		const li = el("li", p.name === winnerName ? "is-winner" : "");
		li.append(el("span", "name", p.name), el("span", "pt", `${p.score} pt`));
		board.append(li);
	});
}

// 「正解したのは？」の名前ボタンを作る
function buildJudgeButtons() {
	const box = $("judge-buttons");
	box.textContent = "";
	state.players.forEach((p) => {
		const btn = el("button", "btn btn-ok", p.name);
		btn.type = "button";
		btn.addEventListener("click", () => judgeForHost(p)); // 押された人を渡す
		box.append(btn);
	});
}

// 回答が決まったあとの共通処理（点数計算・結果表示）
function finishQuestion(isCorrect, winner = null) {
	const song = state.questions[state.index];
	const point = isCorrect ? STAGE_POINTS[state.stage] : 0;
	if (winner) winner.score += point;   // 司会者モード: 正解した人に加点
	else state.score += point;           // 4択モード: 自分に加点
	state.results.push({ song, correct: isCorrect, point, winner: winner ? winner.name : null });

	$("quiz-score").textContent = `${state.score} pt`;
	renderScoreboard(winner ? winner.name : null); // 得点表を更新して、正解者を光らせる
	$("answer-box").hidden = false;
	updateStageUI(); // 回答後は「聴く」系ボタンを押せなくする

	const result = $("answer-result");
	if (isCorrect) {
		result.textContent = winner ? `${winner.name} 正解！ +${point}pt` : `正解！ +${point}pt`;
	} else {
		result.textContent = state.mode === "host" ? "正解者なし" : "ざんねん…";
	}
	result.className = "answer-result " + (isCorrect ? "ok" : "ng");
	$("answer-song").textContent = `${song.title} / ${song.artist || "アーティスト不明"}`;

	// 最後の問題ならボタンの文字を変える
	const isLast = state.index === state.questions.length - 1;
	$("btn-next").textContent = isLast ? "結果を見る" : "次の問題へ";

	// 4択モードでは、ここで答えの曲を流す（司会者モードは既に流している）
	if (state.mode === "choice") playFrom(song.startSec, REVEAL_SECONDS, false);
}

// 「次の問題へ」
function nextQuestion() {
	stopAudio();
	state.index++;
	if (state.index >= state.questions.length) {
		showResult();
	} else {
		loadQuestion();
	}
}

// 「何段階目か」の表示を更新（ラベルとボタンの状態）
function updateStageUI() {
	const sec = STAGE_SECONDS[state.stage];
	const pt = STAGE_POINTS[state.stage];
	$("stage-label").textContent = `いま聴ける長さ: ${sec}秒（いま当てると ${pt}pt）`;

	// 最終段階では「もう少し長く」を押せなくする
	$("btn-longer").disabled = state.stage >= STAGE_SECONDS.length - 1 || state.answered;
	$("btn-play").disabled = state.answered;
}

// 「もう少し長く聴く」
function listenLonger() {
	if (state.stage < STAGE_SECONDS.length - 1) {
		state.stage++;
		updateStageUI();
		playIntro();
	}
}


/* ---------------------------------------------------------------------
 * 8. 音の再生制御
 * ------------------------------------------------------------------- */

// いまの段階の長さだけイントロを流す
function playIntro() {
	if (state.answered) return;
	const song = state.questions[state.index];
	playFrom(song.startSec, STAGE_SECONDS[state.stage], true);
}

// 指定位置(start秒)から seconds 秒だけ再生する
//   withBar が true のとき、バーを伸ばすアニメーションも動かす
function playFrom(start, seconds, withBar) {
	stopAudio();

	// 実際に再生を始める処理
	const go = () => {
		player.currentTime = start;
		player.play().catch(() => {
			$("stage-label").textContent = "再生できませんでした。もう一度ボタンを押してください。";
		});

		// seconds 秒後に止める
		stopTimerId = setTimeout(() => {
			stopAudio();
			if (withBar) setBarWidth(STAGE_SECONDS[state.stage] / barTotal() * 100);
		}, seconds * 1000);

		if (withBar) animateBar();
	};

	// 音源の準備ができていれば即再生。まだなら準備完了を待つ
	if (player.readyState >= 1) {
		go();
	} else {
		player.addEventListener("loadedmetadata", go, { once: true });
	}
}

// 再生を止める（タイマーとアニメーションも止める）
function stopAudio() {
	clearTimeout(stopTimerId);
	cancelAnimationFrame(rafId);
	stopTimerId = null;
	player.pause();
}

// バー全体が表す秒数（＝最大の段階の長さ）
function barTotal() {
	return STAGE_SECONDS[STAGE_SECONDS.length - 1];
}

// バーの幅(%)を設定
function setBarWidth(percent) {
	$("stage-fill").style.width = Math.min(100, percent) + "%";
}

// 再生に合わせてバーを伸ばす（1コマごとに呼ばれる）
function animateBar() {
	const song = state.questions[state.index];
	const tick = () => {
		const elapsed = player.currentTime - song.startSec;       // 再生開始から何秒経ったか
		setBarWidth(Math.max(0, elapsed) / barTotal() * 100);
		if (!player.paused) rafId = requestAnimationFrame(tick);  // 再生中は繰り返す
	};
	rafId = requestAnimationFrame(tick);
}

// 音源が読み込めなかったとき（ファイル名の間違いなど）
player.addEventListener("error", () => {
	if (screens.quiz.classList.contains("is-active")) {
		$("stage-label").textContent = "音源を読み込めません。songs.js のファイル名と audio フォルダを確認してください。";
	}
});


/* ---------------------------------------------------------------------
 * 9. 結果画面
 * ------------------------------------------------------------------- */
function showResult() {
	const isHost = state.mode === "host";
	$("ranking").hidden = !isHost; // ランキングは司会者モードのときだけ

	if (isHost) {
		// 点数の高い順に並べ替える（[...] でコピーしてから並べ替え、元の順番は壊さない）
		const ranking = [...state.players].sort((a, b) => b.score - a.score);

		// 優勝者（同点なら全員）
		const top = ranking[0].score;
		const winners = ranking.filter((p) => p.score === top).map((p) => p.name);
		$("result-score").textContent = top > 0 ? `優勝：${winners.join("・")}` : "全員0点…";
		$("result-comment").textContent = "みなさんお疲れさまでした！";

		// ランキング（同点は同じ順位にする）
		const rankList = $("ranking");
		rankList.textContent = "";
		let rank = 0;
		ranking.forEach((p, i) => {
			if (i === 0 || p.score !== ranking[i - 1].score) rank = i + 1;
			const li = el("li");
			li.append(el("span", "", `${rank}位　${p.name}`), el("span", "pt", `${p.score} pt`));
			rankList.append(li);
		});
	} else {
		// 4択モード: 合計点とコメント
		const max = state.questions.length * STAGE_POINTS[0];
		const ratio = max > 0 ? state.score / max : 0;
		$("result-score").textContent = `${state.score} / ${max} pt`;

		let comment = "ここから伸びしろしかない！";
		if (ratio >= 0.9) comment = "イントロ王！カラオケ部も脱帽です。";
		else if (ratio >= 0.6) comment = "かなりの音楽通！";
		else if (ratio >= 0.3) comment = "いい勝負でした。";
		$("result-comment").textContent = comment;
	}

	// 1問ごとの結果（司会者モードでは、誰が取ったかも表示）
	const list = $("result-list");
	list.textContent = "";
	state.results.forEach((r) => {
		const li = el("li");
		const info = el("span");
		info.append(el("span", "", r.song.title), el("br"), el("span", "sub", r.song.artist || ""));
		let text = "×";
		if (r.correct) text = r.winner ? `${r.winner} +${r.point}pt` : `○ +${r.point}pt`;
		const mark = el("span", r.correct ? "mark-ok" : "mark-ng", text);
		li.append(info, mark);
		list.append(li);
	});

	showScreen("result");
}


/* ---------------------------------------------------------------------
 * 10. 起動処理（ボタンと動作を結びつける）
 * ------------------------------------------------------------------- */

// スタート画面
$("btn-start").addEventListener("click", startQuiz);
$("btn-add").addEventListener("click", handleAddSong);
$("btn-copy").addEventListener("click", handleCopySnippet);
document.querySelectorAll('input[name="mode"]').forEach((r) =>
	r.addEventListener("change", refreshStartScreen)
);

// クイズ画面
$("btn-play").addEventListener("click", playIntro);
$("btn-longer").addEventListener("click", listenLonger);
$("btn-reveal").addEventListener("click", revealForHost);
$("btn-add-player").addEventListener("click", addPlayer);
$("player-name").addEventListener("keydown", (e) => {
	// 日本語入力の変換確定のEnterでは追加しない（isComposing が true のとき）
	if (e.key === "Enter" && !e.isComposing) addPlayer();
});
$("btn-nobody").addEventListener("click", () => judgeForHost(null));
$("btn-next").addEventListener("click", nextQuestion);

// 結果画面
$("btn-retry").addEventListener("click", () => {
	stopAudio();
	refreshStartScreen();
	showScreen("start");
});

// 最初の画面を準備
refreshStartScreen();

// 参加者の一覧を画面に描き直す
function renderPlayerList() {
	const list = $("player-list");
	list.textContent = "";
	state.players.forEach((p, i) => {
		const li = el("li");
		li.append(el("span", "", p.name));
		const del = el("button", "", "削除");
		del.addEventListener("click", () => {
			state.players.splice(i, 1); // i番目を配列から取り除く
			refreshStartScreen();
		});
		li.append(del);
		list.append(li);
	});
}

// 「追加」ボタンの処理
function addPlayer() {
	const input = $("player-name");
	const name = input.value.trim();
	if (!name) return;
	if (state.players.length >= MAX_PLAYERS) { alert(`参加者は${MAX_PLAYERS}人までです。`); return; }
	if (state.players.some((p) => p.name === name)) { alert("同じ名前の人がいます。"); return; }

	state.players.push({ name, score: 0 });
	input.value = "";
	input.focus();
	refreshStartScreen();
}
