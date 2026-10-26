export interface PromptComparison {
  expectedWordCount: number;
  recognizedWordCount: number;
  matchedWordCount: number;
  accuracyPercent: number;
  missingWords: string[];
  extraWords: string[];
}

/** Compare recognized words with a prompt. This is word-level transcript matching,
 * not an acoustic pronunciation score. Speech recognition may itself be wrong. */
export function comparePrompt(prompt: string, transcript: string): PromptComparison {
  const words = (value: string) =>
    value.toLocaleLowerCase().replace(/[^\p{L}\p{N}'’-]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const expected = words(prompt);
  const recognized = words(transcript);
  const rows = expected.length + 1;
  const cols = recognized.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] = expected[i - 1] === recognized[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  let i = expected.length;
  let j = recognized.length;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === recognized[j - 1]) {
      matched.unshift(expected[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      missing.unshift(expected[i - 1]);
      i--;
    } else {
      extra.unshift(recognized[j - 1]);
      j--;
    }
  }
  while (i > 0) missing.unshift(expected[--i]);
  while (j > 0) extra.unshift(recognized[--j]);

  const matchedWordCount = matched.length;
  return {
    expectedWordCount: expected.length,
    recognizedWordCount: recognized.length,
    matchedWordCount,
    accuracyPercent: expected.length ? Math.round((matchedWordCount / expected.length) * 100) : 0,
    missingWords: missing,
    extraWords: extra,
  };
}
