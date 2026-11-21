import type { RankGrade, ScoreBreakdown } from '../types';

export const DEFAULT_PUBLIC_GAME_URL = 'https://unimate-jp.com/games/mousoutero/';

export interface ResultCommentaryInput {
  playerName: string;
  cleared: boolean;
  survivorsAlive: number;
  totalSurvivors: number;
}

export interface ResultCommentary {
  headline: string;
  teacherQuote: string;
  shareTagline: string;
}

export function getResultCommentary(input: ResultCommentaryInput): ResultCommentary {
  const { playerName, cleared, survivorsAlive, totalSurvivors } = input;
  const alive = Math.max(0, Math.min(survivorsAlive, totalSurvivors));

  if (cleared) {
    if (alive === totalSurvivors && totalSurvivors > 0) {
      return {
        headline: `👑 完全防衛！${playerName}、伝説のヒーロー！`,
        teacherQuote: `鬼塚先生「おい${playerName}！『みんな俺が守る！』と叫んで机を蹴り倒すな！……ただ、隣のさくらがなぜか拍手してるから今日は許す！」`,
        shareTagline: '全員生存の完全防衛！さくらに拍手されました'
      };
    }
    if (alive === totalSurvivors - 1) {
      return {
        headline: `🔥 ほぼ全員救出！校舎制圧完了！`,
        teacherQuote: `鬼塚先生「おい${playerName}！モップを振り回す素振りで隣の席にぶつかるな！『あと1人間に合えば…』じゃない、黒板を見ろ！」`,
        shareTagline: 'あと1人で完全防衛！惜しくも1名気絶させつつ校舎制圧'
      };
    }
    if (alive >= 3) {
      return {
        headline: `⚔️ 激戦の果てにテロリスト撃退！`,
        teacherQuote: `鬼塚先生「おい${playerName}！授業中に『ここは俺が食い止める！』と呟きながら暴れるな！クラスの半分がドン引きしてるぞ！」`,
        shareTagline: '激戦の末に校舎を防衛！半分ドン引きされました'
      };
    }
    if (alive >= 1) {
      return {
        headline: `💥 満身創痍の孤高ファイター！`,
        teacherQuote: `鬼塚先生「おい${playerName}！『生き残った奴だけで逃げるぞ…』みたいなシリアスな顔して授業サボるな！まず二次方程式を解け！」`,
        shareTagline: 'ギリギリ数名を守り抜いてテロリストを撃退'
      };
    }
    return {
      headline: `💀 孤高の最終兵器（クラス全員気絶）`,
      teacherQuote: `鬼塚先生「おい${playerName}！誰一人守れず1人でニヤニヤ無双するな！クラスメイト全員が冷たい目で見てるぞ！廊下に立ってろ！」`,
      shareTagline: '誰一人守れず1人だけ無双して廊下に立たされました'
    };
  }

  // Defeat commentary based on survivors count
  if (alive === totalSurvivors && totalSurvivors > 0) {
    return {
      headline: `💤 みんな無事だが${playerName}だけ爆睡落下…`,
      teacherQuote: `鬼塚先生「おい${playerName}！クラス全員ピンピンしてるのに1人だけ椅子から転げ落ちるな！さくらも『大丈夫…？』って苦笑いしてるぞ！」`,
      shareTagline: '全員無事なのに自分だけ椅子から転げ落ちました'
    };
  }
  if (alive >= 4) {
    return {
      headline: `🌀 妄想途中で現実へ強制帰還…`,
      teacherQuote: `鬼塚先生「${playerName}！爆睡して机に頭をぶつけるな！まだ5時間目は半分残ってるぞ、顔洗ってこい！」`,
      shareTagline: '熱い妄想の途中で机に頭をぶつけて覚醒しました'
    };
  }
  if (alive >= 1) {
    return {
      headline: `😵 大ピンチの途中で夢から覚醒…`,
      teacherQuote: `鬼塚先生「おい${playerName}！『ぐっ…ここまでか…』って寝言が大きすぎるぞ！保健室で少し休んでこい！」`,
      shareTagline: '「ぐっ…ここまでか…」と大声で寝言を叫びました'
    };
  }
  return {
    headline: `😱 2年B組、妄想内で壊滅…`,
    teacherQuote: `鬼塚先生「${playerName}！！うなされて大声出すな！どんな悪夢を見たんだ！？放課後、補習室に来い！」`,
    shareTagline: '2年B組壊滅の悪夢でうなされて放課後補習決定'
  };
}

export interface SharePayloadInput {
  playerName: string;
  breakdown: ScoreBreakdown;
  rankPosition: number | null;
  cleared: boolean;
  gameUrl?: string;
}

export function getGameShareUrl(): string {
  if (typeof window !== 'undefined' && /^https?:\/\//.test(window.location.origin)) {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.');
    if (!isLocal) {
      return `${window.location.origin}${window.location.pathname}`;
    }
  }
  return DEFAULT_PUBLIC_GAME_URL;
}

export function buildShareText(input: SharePayloadInput): string {
  const { playerName, breakdown, rankPosition, cleared } = input;
  const commentary = getResultCommentary({
    playerName,
    cleared,
    survivorsAlive: breakdown.survivorsAlive,
    totalSurvivors: breakdown.totalSurvivors
  });

  const rankLine = rankPosition !== null ? `🏆 校内ランキング ${rankPosition}位！\n` : '';
  const statusLabel = cleared ? '制圧成功' : '途中覚醒';

  return (
    `🏫 授業中妄想クライシス【${statusLabel}】\n` +
    `${playerName} の結果：ランク ${breakdown.rank}（${breakdown.totalScore.toLocaleString()}pt）\n` +
    `💥 撃破：${breakdown.totalKills}体 ／ 👥 生存：${breakdown.survivorsAlive}/${breakdown.totalSurvivors}名\n` +
    rankLine +
    `💬 ${commentary.shareTagline}\n` +
    `#授業中妄想クライシス #妄想ゲーム`
  );
}

export function buildXShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildLineShareUrl(text: string, url: string): string {
  const full = `${text}\n${url}`;
  return `https://line.me/R/share?text=${encodeURIComponent(full)}`;
}

export function getRankLabel(rank: RankGrade): string {
  return `ランク ${rank}`;
}
