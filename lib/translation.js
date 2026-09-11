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

const GLOSSARY_HEADER = "# Translation Glossary";
const GLOSSARY_TAG = "<!-- dsh-translation-glossary -->";

/** Parse '- source => target' lines from a glossary file. */
export function parseGlossary({ text = "" } = {}) {
  const entries = [];
  for (const line of String(text).split("\n")) {
    const m = line.match(/^-\s*(.+?)\s*=>\s*(.+?)\s*$/);
    if (m) entries.push({ source: m[1].trim(), target: m[2].trim() });
  }
  return entries;
}

function renderGlossaryBody(entries) {
  const body = entries.map((e) => "- " + e.source + " => " + e.target).join("\n");
  return GLOSSARY_HEADER + "\n\n" + GLOSSARY_TAG + "\n\n" + body + (entries.length > 0 ? "\n" : "");
}

/** Add or update one source->target glossary entry. */
export function mergeGlossaryEntry({ existing = "", source = "", target = "", maxEntries = 200 } = {}) {
  const src = String(source || "").trim();
  const tgt = String(target || "").trim();
  if (!src || !tgt) throw new Error("translation: glossary source and target are required");
  let entries = parseGlossary({ text: existing }).filter((e) => e.source !== src);
  entries.push({ source: src, target: tgt });
  entries = entries.slice(-Math.max(1, Math.floor(maxEntries)));
  return renderGlossaryBody(entries);
}

/** Remove a glossary entry by source term. */
export function removeGlossaryEntry({ existing = "", source = "" } = {}) {
  const src = String(source || "").trim();
  if (!src) throw new Error("translation: glossary source is required");
  const entries = parseGlossary({ text: existing }).filter((e) => e.source !== src);
  return renderGlossaryBody(entries);
}

/** Render glossary entries (newest first) for the model. */
export function renderGlossary({ text = "", maxEntries = 50 } = {}) {
  const entries = parseGlossary({ text });
  const kept = entries.slice(-Math.max(1, Math.floor(maxEntries))).reverse();
  if (kept.length === 0) return "(glossary is empty)";
  return "Translation glossary (newest first):\n\n" + kept.map((e) => e.source + " => " + e.target).join("\n");
}

/** Cross-segment terminology consistency check against a glossary. */
export function checkConsistency({ pairs = [], glossary = [] } = {}) {
  const dict = new Map();
  for (const g of (Array.isArray(glossary) ? glossary : [])) {
    if (g && g.source) dict.set(g.source, g.target || "");
  }
  if (dict.size === 0) return { mismatches: [], consistent: true, checked: [], text: "(no glossary terms provided - add glossary entries first)" };
  const segs = (Array.isArray(pairs) ? pairs : []).filter((p) => p && p.source && p.target);
  const usage = new Map();
  for (const seg of segs) {
    for (const [term, expected] of dict) {
      if (!seg.source.includes(term)) continue;
      const found = expected && seg.target.includes(expected) ? expected : "(missing: " + (expected || "no translation") + ")";
      if (!usage.has(term)) usage.set(term, new Map());
      const counts = usage.get(term);
      counts.set(found, (counts.get(found) || 0) + 1);
    }
  }
  const mismatches = [];
  for (const [term, counts] of usage) {
    if (counts.size > 1) {
      mismatches.push({
        term,
        translations: [...counts.entries()].map(([tr, c]) => ({ translation: tr, count: c })).sort((a, b) => b.count - a.count),
      });
    }
  }
  const text = mismatches.length === 0
    ? "Consistency check passed: no conflicting translations found for the glossary terms present."
    : "Consistency issues found:\n" + mismatches.map((m) => "- " + m.term + " -> " + m.translations.map((t) => t.translation + " (x" + t.count + ")").join(" / ")).join("\n");
  return { mismatches, consistent: mismatches.length === 0, checked: [...usage.keys()], text };
}
const TONE_HEADER = "# Translation Tone Memory";
const TONE_TAG = "<!-- dsh-translation-tone-memory -->";

function toneKey(tone, lang) {
  return String(tone || "").trim().toLowerCase() + "@" + String(lang || "").trim().toLowerCase();
}

/** Parse tone-memory blocks ('## key' + body lines). */
export function parseToneMemory({ text = "" } = {}) {
  const entries = [];
  const blocks = String(text).split(/\n(?=## )/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block.startsWith("## ")) continue;
    const nl = block.indexOf("\n");
    const header = (nl === -1 ? block.slice(3) : block.slice(3, nl)).trim();
    const body = nl === -1 ? "" : block.slice(nl + 1).trim();
    let ts = "";
    let key = header;
    const m = header.match(/^(\S+)\s+(.*)$/);
    if (m && /^\d{4}-\d{2}-\d{2}/.test(m[1])) { ts = m[1]; key = m[2].trim(); }
    const at = key.lastIndexOf("@");
    const tone = at === -1 ? key : key.slice(0, at);
    const lang = at === -1 ? "" : key.slice(at + 1);
    if (!tone) continue;
    entries.push({ ts, tone, lang, notes: body });
  }
  return entries;
}

function renderToneBody(entries) {
  const body = entries.map((e) => "## " + (e.ts ? e.ts + " " : "") + toneKey(e.tone, e.lang) + "\n" + e.notes).join("\n\n");
  return TONE_HEADER + "\n\n" + TONE_TAG + "\n\n" + body + (entries.length > 0 ? "\n" : "");
}

/** Save or update a tone guide for a tone\lang pair. */
export function mergeToneEntry({ existing = "", tone = "", targetLang = "", notes = "", maxEntries = 50, now = "" } = {}) {
  if (!tone) throw new Error("translation: tone is required");
  if (!notes) throw new Error("translation: notes are required");
  const key = toneKey(tone, targetLang);
  let entries = parseToneMemory({ text: existing }).filter((e) => toneKey(e.tone, e.lang) !== key);
  entries.push({ ts: now, tone: String(tone).trim(), lang: String(targetLang || "").trim(), notes: String(notes).trim() });
  entries = entries.slice(-Math.max(1, Math.floor(maxEntries)));
  return renderToneBody(entries);
}

/** Remove a saved tone guide. */
export function removeToneEntry({ existing = "", tone = "", targetLang = "" } = {}) {
  const key = toneKey(tone, targetLang);
  const entries = parseToneMemory({ text: existing }).filter((e) => toneKey(e.tone, e.lang) !== key);
  return renderToneBody(entries);
}

/** Render saved tone guides (optionally filtered), newest first. */
export function renderToneMemory({ text = "", tone = "", targetLang = "", maxEntries = 10 } = {}) {
  let entries = parseToneMemory({ text });
  if (tone) entries = entries.filter((e) => e.tone.toLowerCase() === String(tone).toLowerCase());
  if (targetLang) entries = entries.filter((e) => e.lang.toLowerCase() === String(targetLang).toLowerCase());
  const kept = entries.slice(-Math.max(1, Math.floor(maxEntries))).reverse();
  if (kept.length === 0) return "(tone memory is empty)";
  return "Tone memory (newest first):\n\n" + kept.map((e) => "- " + toneKey(e.tone, e.lang) + ":\n  " + e.notes.split("\n").join("\n  ")).join("\n");
}

function countSentences(s) {
  return String(s).split(/[.!?。！？]+/).filter((x) => x.trim().length > 0).length;
}

/** Heuristic translation quality score (0-100) with fidelity/fluency breakdown. */
export function scoreQuality({ source = "", target = "", glossary = [] } = {}) {
  const src = String(source);
  const tgt = String(target);
  if (!src.trim() || !tgt.trim()) throw new Error("translation: source and target are required");
  const issues = [];
  let fidelity = 60;
  let fluency = 40;
  // 1. numbers preserved
  const srcNums = src.match(/\d+(?:[.,]\d+)?/g) || [];
  const tgtNums = new Set(tgt.match(/\d+(?:[.,]\d+)?/g) || []);
  const missingNums = srcNums.filter((n) => !tgtNums.has(n));
  if (missingNums.length > 0) {
    const p = Math.min(24, missingNums.length * 8);
    fidelity -= p;
    issues.push("数字缺失 " + missingNums.length + " 个：" + missingNums.slice(0, 5).join(", ") + "（-" + p + "）");
  }
  // 2. glossary compliance
  const gMiss = [];
  for (const g of (Array.isArray(glossary) ? glossary : [])) {
    if (!g || !g.source || !g.target) continue;
    if (src.includes(g.source) && !tgt.includes(g.target)) gMiss.push(g.source);
  }
  if (gMiss.length > 0) {
    const p = Math.min(18, gMiss.length * 6);
    fidelity -= p;
    issues.push("术语未按术语表翻译：" + gMiss.slice(0, 5).join(", ") + "（-" + p + "）");
  }
  // 3. length ratio sanity
  const ratio = src.length > 0 ? tgt.length / src.length : 1;
  if (ratio < 0.4 || ratio > 3) {
    fidelity -= 8;
    issues.push("长度比 " + ratio.toFixed(2) + " 异常（-8）");
  }
  // 4. untranslated leakage
  const srcCJK = /[\u4e00-\u9fff]/.test(src);
  const asciiRuns = tgt.match(/[A-Za-z]{4,}(?:\s+[A-Za-z]{2,}){2,}/g) || [];
  if (srcCJK && asciiRuns.length > 0) {
    fidelity -= 10;
    issues.push("目标语言中疑似未翻译片段：「" + asciiRuns[0].slice(0, 30) + "」（-10）");
  }
  // 5. sentence count parity
  const sSent = countSentences(src);
  const tSent = countSentences(tgt);
  if (sSent > 0 && Math.abs(sSent - tSent) / sSent > 0.5) {
    fluency -= 8;
    issues.push("句数不匹配（源 " + sSent + " / 译 " + tSent + "）（-8）");
  }
  // 6. doubled punctuation / spaces
  const doubles = (tgt.match(/[，。、；：,.;:]{2,}|\s{2,}/g) || []).length;
  if (doubles > 0) {
    const p = Math.min(12, doubles * 4);
    fluency -= p;
    issues.push("重复标点/空格 " + doubles + " 处（-" + p + "）");
  }
  // 7. over-long sentence
  const hasLong = tgt.split(/[.!?。！？]+/).some((s) => s.trim().length > 200);
  if (hasLong) {
    fluency -= 6;
    issues.push("存在超长句（>200 字符），建议拆分（-6）");
  }
  fidelity = Math.max(0, fidelity);
  fluency = Math.max(0, fluency);
  const score = fidelity + fluency;
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
  const text = [
    "# Translation quality: " + score + "/100 (" + grade + ")",
    "",
    "fidelity " + fidelity + "/60 | fluency " + fluency + "/40 | length ratio " + ratio.toFixed(2),
    "",
    issues.length === 0 ? "- 未发现明显问题" : issues.map((i) => "- " + i).join("\n"),
  ].join("\n");
  return { score, grade, fidelity, fluency, ratio: Math.round(ratio * 100) / 100, issues, text };
}