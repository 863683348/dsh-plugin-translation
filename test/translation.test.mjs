import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendMemo,
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
