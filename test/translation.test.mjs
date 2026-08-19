import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendMemo,
  checkConsistency,
  mergeGlossaryEntry,
  parseGlossary,
  removeGlossaryEntry,
  renderGlossary,
  buildMemoEntry,
  extractTerms,
  qaCheck,
  renderMemo,
  segmentText,
  toneGuide,
} from "../lib/translation.js";

test("segmentText splits into bounded segments", () => {
  const segs = segmentText({ text: "One. Two. Three four five six.", maxLen: 12 });
  assert.ok(segs.length >= 2);
  assert.ok(segs.every((s) => s.text.length <= 12));
  assert.equal(segs[0].index, 1);
  assert.ok(segs.every((s) => s.text.length > 0));
});

test("segmentText preserves full text after rejoining", () => {
  const src = "Hello world. This is a longer sentence that should be split somewhere. Done!";
  const segs = segmentText({ text: src, maxLen: 30 });
  assert.equal(segs.map((s) => s.text).join(" "), src);
});

test("extractTerms finds acronyms, codes, and numbered units", () => {
  const terms = extractTerms({ text: "The API v2 uses UTF-8. API rate: 100% per day. 5kg apples, 5kg pears." });
  assert.ok(terms.some((t) => t.term === "API" && t.count === 2));
  assert.ok(terms.some((t) => t.term === "UTF-8"));
  assert.ok(terms.some((t) => /5kg/.test(t.term)));
});

test("qaCheck flags missing numbers", () => {
  const res = qaCheck({ source: "Price is 100元.", target: "价格是 X 元。" });
  assert.ok(res.issues.some((i) => /missing from target/.test(i)));
  assert.equal(res.passed, false);
});

test("qaCheck flags unbalanced brackets", () => {
  const res = qaCheck({ source: "Open (bracket", target: "左括号（未闭合" });
  assert.ok(res.issues.some((i) => /Unbalanced/.test(i)));
});

test("qaCheck passes consistent pair", () => {
  const res = qaCheck({ source: "Total 50元 (incl. tax).", target: "合计 50元（含税）。" });
  assert.equal(res.passed, true);
});

test("toneGuide returns items for zh formal", () => {
  const out = toneGuide({ tone: "formal", targetLang: "zh" });
  assert.ok(out.includes("Tone guide"));
  assert.ok(out.includes("术语"));
});

test("appendMemo keeps newest entries and header", () => {
  let memo = "";
  for (let i = 1; i <= 5; i++) {
    memo = appendMemo({ existing: memo, entry: buildMemoEntry({ source: "s" + i, target: "t" + i, now: "t" + i }), maxEntries: 3 });
  }
  assert.ok(memo.startsWith("# Translation Memory"));
  assert.ok(memo.includes("s5"));
  assert.ok(!memo.includes("s1"));
});

test("renderMemo renders newest first", () => {
  const memo = appendMemo({ existing: "", entry: buildMemoEntry({ source: "alpha", target: "beta", now: "t1" }) });
  const memo2 = appendMemo({ existing: memo, entry: buildMemoEntry({ source: "charlie", target: "delta", now: "t2" }) });
  const out = renderMemo({ text: memo2 });
  const i2 = out.indexOf("charlie");
  const i1 = out.indexOf("alpha");
  assert.ok(i2 !== -1 && i1 !== -1 && i2 < i1);
});


test("parseGlossary parses source => target lines", () => {
  const entries = parseGlossary({ text: "# Translation Glossary\n\n- cache => 缓存\n- LLM => 大语言模型\n" });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].source, "cache");
  assert.equal(entries[0].target, "缓存");
});

test("mergeGlossaryEntry adds and updates, keeping newest", () => {
  let text = mergeGlossaryEntry({ existing: "", source: "cache", target: "缓存", maxEntries: 100 });
  assert.ok(text.includes("- cache => 缓存"));
  text = mergeGlossaryEntry({ existing: text, source: "cache", target: "高速缓存", maxEntries: 100 });
  const entries = parseGlossary({ text });
  assert.equal(entries.length, 1, "updated in place");
  assert.equal(entries[0].target, "高速缓存");
});

test("mergeGlossaryEntry caps entries and validates input", () => {
  let text = "";
  for (let i = 0; i < 5; i++) text = mergeGlossaryEntry({ existing: text, source: "t" + i, target: "v" + i, maxEntries: 3 });
  assert.equal(parseGlossary({ text }).length, 3);
  assert.throws(() => mergeGlossaryEntry({ existing: "", source: "", target: "x" }));
  assert.throws(() => mergeGlossaryEntry({ existing: "", source: "x", target: "" }));
});

test("removeGlossaryEntry deletes by source", () => {
  let text = mergeGlossaryEntry({ existing: "", source: "a", target: "1", maxEntries: 10 });
  text = mergeGlossaryEntry({ existing: text, source: "b", target: "2", maxEntries: 10 });
  text = removeGlossaryEntry({ existing: text, source: "a" });
  const entries = parseGlossary({ text });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, "b");
});

test("renderGlossary lists newest first", () => {
  let text = mergeGlossaryEntry({ existing: "", source: "a", target: "1", maxEntries: 10 });
  text = mergeGlossaryEntry({ existing: text, source: "b", target: "2", maxEntries: 10 });
  const rendered = renderGlossary({ text });
  assert.ok(rendered.indexOf("b => 2") < rendered.indexOf("a => 1"), "newest first");
});

test("checkConsistency flags conflicting translations", () => {
  const res = checkConsistency({
    pairs: [
      { source: "The cache stores data.", target: "缓存存储数据。" },
      { source: "Clear the cache.", target: "清除存储。" },
    ],
    glossary: [{ source: "cache", target: "缓存" }],
  });
  assert.equal(res.consistent, false);
  assert.equal(res.mismatches.length, 1);
  assert.equal(res.mismatches[0].term, "cache");
  assert.ok(res.mismatches[0].translations.length >= 2);
});

test("checkConsistency passes when consistent and reports empty glossary", () => {
  const ok = checkConsistency({
    pairs: [{ source: "cache", target: "缓存" }],
    glossary: [{ source: "cache", target: "缓存" }],
  });
  assert.equal(ok.consistent, true);
  const empty = checkConsistency({ pairs: [{ source: "x", target: "y" }], glossary: [] });
  assert.equal(empty.consistent, true);
});
