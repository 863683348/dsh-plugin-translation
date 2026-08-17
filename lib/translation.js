/**
 * dsh-plugin-translation — pure translation-assist helpers: segmentation,
 * term extraction, source-target QA, tone guides, and translation-memory
 * (memo) file format.
 *
 * No DSH or Cordis imports here, so this module is unit-testable in
 * isolation. The model translates; these helpers chunk, check, and remember.
 */

const SENTENCE_END = /(?<=[.!?。！？…])(\s+|$)/;

/** Split text into numbered segments bounded by maxLen characters. */
export function segmentText({ text = "", maxLen = 500 } = {}) {
  const limit = Math.max(1, Math.floor(maxLen));
  const sentences = String(text)
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
  const segments = [];
  let current = "";
  for (const s of sentences) {
    if (current.length > 0 && (current + " " + s).length > limit) {
      segments.push(current);
      current = s;
    } else {
      current = current.length === 0 ? s : current + " " + s;
    }
    if (current.length > limit) {
      while (current.length > limit) {
        const piece = current.slice(0, limit).trim();
        if (piece.length > 0) segments.push(piece);
        current = current.slice(limit).trimStart();
      }
    }
  }
  if (current.length > 0) segments.push(current);
  return segments.map((text, index) => ({ index: index + 1, text }));
}

const TERM_RES = [
  [/\b[A-Z]{2,}[A-Za-z0-9]*\b/g, "acronym"],
  [/\b[A-Za-z]+[a-z][A-Z][a-zA-Z]*\b/g, "camelCase"],
  [/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g, "code"],
  [/\b[a-z]+\.[a-z]+\.[a-z]+\b/g, "domain"],
  [/\b\d+(?:[.,]\d+)*\s?(?:%|‰|\$|€|¥|£|°C|°F|kg|km|ml|L)\b/g, "number+unit"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "email"],
  [/https?:\/\/\S+/g, "url"],
];

/** Extract candidate glossary terms with occurrence counts. */
export function extractTerms({ text = "" } = {}) {
  const counts = new Map();
  for (const [re, kind] of TERM_RES) {
    for (const m of String(text).matchAll(re)) {
      const term = m[0];
      const key = term.toLowerCase();
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { term, kind, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

const NUM_TOKEN = /\d+(?:[.,]\d+)*\s?(?:%|‰|\$|€|¥|£|°C|°F|kg|km|ml|L|万|亿|元|块|克|斤|里|岁|年|月|日|时|分|秒)/g;

function tokens(text) {
  return (String(text).match(NUM_TOKEN) || []).map((t) => t.replace(/\s/g, ""));
}

/** Source-target consistency QA. Returns issues and diagnostics. */
export function qaCheck({ source = "", target = "" } = {}) {
  const issues = [];
  const s = String(source);
  const t = String(target);
  if (s.length === 0 || t.length === 0) {
    issues.push("Both source and target must be non-empty.");
    return { issues, passed: false, ratio: null, missingTokens: [], extraTokens: [] };
  }
  const sTokens = new Set(tokens(s));
  const tTokens = new Set(tokens(t));
  const missingTokens = [...sTokens].filter((x) => !tTokens.has(x));
  const extraTokens = [...tTokens].filter((x) => !sTokens.has(x));
  if (missingTokens.length > 0) issues.push("Numbers/units in source missing from target: " + missingTokens.join(", "));
  if (extraTokens.length > 0) issues.push("Numbers/units in target not present in source: " + extraTokens.join(", "));
  for (const pair of [["(", ")"], ["[", "]"], ["{", "}"], ["「", "」"], ["（", "）"]]) {
    const [open, close] = pair;
    const so = s.split(open).length - 1;
    const sc = s.split(close).length - 1;
    const to = t.split(open).length - 1;
    const tc = t.split(close).length - 1;
    if (so !== sc) issues.push("Unbalanced '" + open + close + "' in source (" + so + " vs " + sc + ").");
    if (to !== tc) issues.push("Unbalanced '" + open + close + "' in target (" + to + " vs " + tc + ").");
  }
  const ratio = t.length / s.length;
  if (ratio < 0.35) issues.push("Target is very short relative to source (ratio " + ratio.toFixed(2) + ") — possible truncation.");
  if (ratio > 2.2) issues.push("Target is much longer than source (ratio " + ratio.toFixed(2) + ") — possible over-translation.");
  if (/([，。！？；])\1+/.test(t)) issues.push("Doubled CJK punctuation found in target.");
  return { issues, passed: issues.length === 0, ratio, missingTokens, extraTokens };
}

const TONE_GUIDES = {
  formal: {
    en: ["Use full forms (do not, cannot) and complete sentences.", "Prefer third-person or passive where appropriate.", "Avoid contractions and slang; keep register elevated.", "Keep terminology consistent with the glossary."],
    zh: ["使用完整句式，避免口语化缩略。", "措辞书面、正式，避免网络用语。", "术语与术语表保持一致。", "数字、单位、人名地名严格核对。"],
  },
  colloquial: {
    en: ["Sound natural and conversational; contractions are fine.", "Short sentences; keep idioms where they carry meaning.", "Match the tone to the audience (chat, social post, ad)."],
    zh: ["表达自然口语化，可用缩略与语气词。", "短句为主，保留俗语/俚语的原意表达。", "贴合场景（聊天、社媒、广告）。"],
  },
  technical: {
    en: ["Keep technical terms in their canonical (often English) form.", "Preserve placeholders, code identifiers, and format strings exactly.", "Do not translate brand names or product names.", "Add units and numbers verbatim."],
    zh: ["技术术语保留规范英文原文（如 API、token）。", "占位符、代码标识符、格式串原样保留。", "品牌与产品名不翻译。", "数字与单位逐字保留。"],
  },
};

/** Tone guide checklist for a register and target language. */
export function toneGuide({ tone = "formal", targetLang = "zh" } = {}) {
  const guide = TONE_GUIDES[tone] ?? TONE_GUIDES.formal;
  const lang = targetLang.toLowerCase().startsWith("en") ? "en" : "zh";
  const items = guide[lang] ?? guide.en;
  return "Tone guide (" + tone + ", " + targetLang + "):\n- " + items.join("\n- ");
}

export const MEMO_HEADER = "# Translation Memory";
export const MEMO_TAG = "<!-- dsh-plugin-translation v1 -->";

/** Build the file block for one memo entry. */
export function buildMemoEntry({ source = "", target = "", lang = "", now = new Date().toISOString() } = {}) {
  return "## [" + now + "] " + (lang ? "(" + lang + ") " : "") + "\n" + source + "\n=> " + target;
}

/** Append an entry to an existing memo file, keeping the newest entries. */
export function appendMemo({ existing = "", entry = "", maxEntries = 200 } = {}) {
  const blocks = existing.split(/\n?## \[/).filter((x) => x.trim().length > 0);
  let body;
  if (existing.includes(MEMO_HEADER) && existing.includes(MEMO_TAG)) {
    const first = existing.indexOf("## [");
    const prev = first === -1 ? "" : existing.slice(first).trimEnd();
    body = (prev.length > 0 ? prev + "\n\n" : "") + entry;
  } else {
    body = entry;
  }
  const entries = body.split(/\n\n(?=## \[)/).filter((x) => x.trim().length > 0);
  const kept = entries.slice(-Math.max(1, Math.floor(maxEntries)));
  return MEMO_HEADER + "\n\n" + MEMO_TAG + "\n\n" + kept.join("\n\n") + "\n";
}

/** Render memo entries (newest first) for the model. */
export function renderMemo({ text = "", maxEntries = 20 } = {}) {
  const blocks = String(text).split(/\n\n(?=## \[)/).filter((x) => x.trim().length > 0);
  const kept = blocks.slice(-Math.max(1, Math.floor(maxEntries))).reverse();
  if (kept.length === 0) return "(translation memory is empty)";
  return "Translation memory (newest first):\n\n" + kept.join("\n\n");
}
