# dsh-plugin-translation

A **translation toolkit** for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) agents: chunking, glossary extraction, source–target QA, tone guides, and a durable translation memory. The model translates; the plugin chunks, checks, and remembers.

## Install

```bash
dsh plugin --profile <profile> add dsh-plugin-translation
```

Restart DSH. The `translate_kit` tool is registered host-wide.

## Tool

| action | purpose |
| --- | --- |
| `segment` | Split text into numbered, bounded chunks for chunked translation |
| `glossary` | Extract candidate terms (acronyms, camelCase, domains, numbers+units, emails, URLs) with counts |
| `check` | Source–target QA: numbers/units, brackets, length ratio, doubled punctuation |
| `tone` | Register-specific tone guide (formal / colloquial / technical, en / zh) |
| `memo_get` | Read the translation memory (newest first) |
| `memo_add` | Save a source→target pair to the memory file in the session workspace |
| `glossary_get` | Read the durable glossary (newest first) |
| `glossary_add` | Add or update a source→target glossary term in the workspace glossary file |
| `glossary_remove` | Remove a glossary term by source |
| `consistency` | Cross-segment terminology consistency check against the glossary |

## Config

All optional, on the composition row's `config`:

| key | default | meaning |
| --- | --- | --- |
| `personaSection` | `true` | register the translation prompt-guidance section |
| `sectionOrder` | `6` | prompt section order (persona is 0, ascending) |
| `memoFile` | `.dsh/translation-memo.md` | memory file path (relative to the session workspace; cannot escape it) |
| `glossaryFile` | `.dsh/translation-glossary.md` | glossary file path (relative to the session workspace; cannot escape it) |
| `maxGlossaryEntries` | `200` | entries kept in the glossary file |
| `maxMemoEntries` | `200` | entries kept in the memory file |

## Design

Pure logic (`lib/translation.js`) has zero DSH/Cordis imports and is unit-tested in isolation; `lib/index.js` is the thin Cordis plugin. Memory access goes through `ctx.fs` and every resolved path is containment-checked against the session workspace.

## License

MIT


## Roadmap

See [ROADMAP.md](./ROADMAP.md) — next five versions (v0.2.0 – v0.6.0): glossary management & consistency, tone memory & quality scoring, side-by-side diff & placeholder protection, conflict detection & effort stats, glossary versioning & batch pipeline.
