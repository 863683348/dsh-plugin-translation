/**
 * dsh-plugin-translation — a model-facing `translate_kit` tool (including a
 * workspace-contained translation memory) and translation prompt guidance for
 * DeepSeek Harness agents.
 *
 * A Cordis plugin: when the package is a profile layer (declares
 * `dsh.bundle.patch`), cordis.patch.yml inserts this row into the launcher
 * composition and the host runner loads this file. Pure logic lives in
 * ./translation.js; the memory actions use `ctx.fs` with containment
 * enforcement against the session workspace.
 *
 * @module dsh-plugin-translation
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  appendMemo,
  buildMemoEntry,
  extractTerms,
  qaCheck,
  renderMemo,
  segmentText,
  toneGuide,
} from "./translation.js";

/** Cordis plugin name (registered with the loader). */
const name = "translation";

/** Services this plugin must resolve before it applies. */
const inject = ["tools", "systemPrompt", "fs"];

/** Composition-row configuration for the plugin entry. */
const Config = z.object({
  /** Register the translation prompt-guidance section. */
  personaSection: z.boolean().default(true),
  /** Order of the section (ascending; persona is 0). */
  sectionOrder: z.number().default(6),
  /** Translation-memory file path, relative to the session workspace. */
  memoFile: z.string().default(".dsh/translation-memo.md"),
  /** Keep at most this many entries in the memory file. */
  maxMemoEntries: z.number().default(200),
});

const SECTION_TEXT = [
  "Translation guidance:",
  "- For long texts, chunk first with `translate_kit` action `segment`, translate chunk by chunk, then `check` the full target against the source.",
  "- Build a glossary with `glossary` from the source and reuse it consistently.",
  "- Always run `check` before delivering: numbers, units, placeholders, brackets, and length must match the source.",
  "- Apply the appropriate `tone` guide (formal / colloquial / technical) for the target audience.",
  "- Save recurring pairs to the translation memory with `memo_add` and consult it with `memo_get`.",
].join("\n");

async function resolveMemoTarget(ctx, file, cwd, signal) {
  const target = await ctx.fs.resolve(file, cwd !== undefined ? { cwd, signal } : { signal });
  if (cwd !== undefined) {
    const cwdTarget = await ctx.fs.resolve(".", { cwd, signal });
    if (!ctx.fs.contains(cwdTarget, target)) {
      throw new Error('translation: memo file "' + file + '" escapes the session workspace');
    }
  }
  return target;
}

function apply(ctx, config) {
  const { memoFile, maxMemoEntries } = config;

  ctx.tools.register(defineTool({
    name: "translate_kit",
    description: "Translation-assist helper: `segment` (split text into numbered, bounded chunks), `glossary` (extract candidate terms with counts), `check` (source-target QA: numbers/units, brackets, length ratio, doubled punctuation), `tone` (register-specific tone guide), `memo_get` (read the translation memory, newest first), `memo_add` (save a source→target pair to the translation memory stored in this session's workspace). Use it for any translation task.",
    parameters: {
      action: {
        type: "string", required: true,
        enum: ["segment", "glossary", "check", "tone", "memo_get", "memo_add"],
        description: "Which translation helper to run.",
      },
      text: { type: "string", description: "Source text (segment/glossary/check)." },
      maxLen: { type: "integer", description: "Max chunk length (segment)." },
      source: { type: "string", description: "Source text (check / memo_add)." },
      target: { type: "string", description: "Target text (check / memo_add)." },
      tone: { type: "string", description: "Register: formal | colloquial | technical (tone)." },
      targetLang: { type: "string", description: "Target language, e.g. zh / en (tone)." },
      lang: { type: "string", description: "Language pair tag, e.g. en->zh (memo_add)." },
      maxEntries: { type: "integer", description: "How many entries to render (memo_get)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          action: { type: "string", required: true },
          text: { type: "string" },
          segments: { type: "array", items: { type: "object" } },
          terms: { type: "array", items: { type: "object" } },
          issues: { type: "array", items: { type: "string" } },
          passed: { type: "boolean" },
          ratio: { type: "number" },
          path: { type: "string" },
        },
      },
      render: (_args, value) => [{ type: "text", text: value.text ?? "" }],
    },
    execute: async (args, exec) => {
      const action = args.action;
      let text = "";
      let segments;
      let terms;
      let issues;
      let passed;
      let ratio;
      let path;
      switch (action) {
        case "segment":
          segments = segmentText({ text: args.text, maxLen: args.maxLen });
          text = segments.map((s) => "[" + s.index + "] " + s.text).join("\n\n");
          break;
        case "glossary":
          terms = extractTerms({ text: args.text });
          text = terms.length === 0
            ? "(no candidate terms found)"
            : terms.map((t) => "- " + t.term + " (" + t.kind + ") x" + t.count).join("\n");
          break;
        case "check":
          ({ issues, passed, ratio } = qaCheck({ source: args.source, target: args.target }));
          text = passed
            ? "QA passed: numbers/units and brackets match, length ratio " + ratio.toFixed(2) + "."
            : "QA issues found:\n- " + issues.join("\n- ");
          break;
        case "tone":
          text = toneGuide({ tone: args.tone, targetLang: args.targetLang });
          break;
        case "memo_get":
        case "memo_add": {
          const cwd = exec.agent?.session?.header?.cwd;
          const target = await resolveMemoTarget(ctx, memoFile, cwd, exec.signal);
          path = ctx.fs.processPath(target);
          const info = await ctx.fs.stat(target, exec.signal);
          const existing = info !== undefined ? await ctx.fs.readText(target, exec.signal) : "";
          if (action === "memo_get") {
            text = renderMemo({ text: existing, maxEntries: args.maxEntries });
          } else {
            const entry = buildMemoEntry({
              source: args.source, target: args.target, lang: args.lang,
              now: new Date().toISOString(),
            });
            const next = appendMemo({ existing, entry, maxEntries: maxMemoEntries });
            await ctx.fs.writeText(target, next, undefined, exec.signal);
            text = "Saved to translation memory (" + path + ").\n\n" + renderMemo({ text: next, maxEntries: 3 });
          }
          break;
        }
        default:
          throw new Error("translate_kit: unknown action '" + action + "'");
      }
      return { action, text, segments, terms, issues, passed, ratio, path };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Translate kit: " + args.action,
      kind: "other",
      rawInput: args,
    }),
  }));

  if (config.personaSection) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: "translation:instructions",
      order: config.sectionOrder,
      text: SECTION_TEXT,
    }), "translation.section()");
  }
}

export { Config, SECTION_TEXT, apply, inject, name };
