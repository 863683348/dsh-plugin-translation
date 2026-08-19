# dsh-plugin-translation 路线图（Roadmap）

> 基线：**v0.1.0**（已发布 npm / 已挂 vertical-toolkits profile）
> 范围：接下来 5 个版本 **v0.2.0 → v0.6.0**
> 规划原则：翻译记忆/术语库类能力走 `ctx.fs` + 工作区 containment 校验；纯逻辑可单测。

## 版本总览

| 版本 | 主题 | 关键交付 |
|---|---|---|
| v0.2.0 | 术语管理 | `glossary_file` 术语库持久化 + `consistency` 跨段术语一致性检查 |
| v0.3.0 | 风格与质量 | `tone_memory` 风格记忆 + `quality` 译文质量评分 |
| v0.4.0 | 对照与保护 | `diff` 双语对照报告 + `protect` 占位符/标记保护 |
| v0.5.0 | 冲突与统计 | `conflict` 术语冲突检测 + `effort` 字数与工作量统计 |
| v0.6.0 | 版本与流水线 | `glossary_version` 术语库版本管理 + `pipeline` 多语言批量流水线 |

## v0.2.0（下一个版本）— 术语管理

### 新增动作
- `glossary_file`：术语库持久化——
  - 在工作区维护术语表文件（如 `.dsh/translation-glossary.md`），支持 `glossary_get` / `glossary_add` / `glossary_remove`
  - 路径走 `ctx.fs` + containment 校验（与 memo 同机制），默认条数上限可配
- `consistency`：跨段术语一致性检查——
  - 输入多段译文 + 术语表（或自动提取高频词）→ 找出同一术语的不同译法，输出不一致清单

### 实现位置
- `lib/translation.js`：新增术语表解析/合并、一致性扫描纯函数
- `lib/index.js`：注册 4 个新 action（glossary_get/add/remove、consistency）到 `translate_kit` 工具

### 验收标准
- [ ] `node --check` 通过
- [ ] 新增单测 ≥ 8 个（术语表读写格式、去重、一致性命中/未命中、边界）
- [ ] 原有 6 个 action 单测全绿
- [ ] README（en/zh）更新（含新配置项 `glossaryFile` / `maxGlossaryEntries`）
- [ ] vertical-toolkits dump-config 正常

## v0.3.0 — 风格与质量

- `tone_memory`：保存/复用语气指南（formal/colloquial/technical × en/zh），与 tone 动作联动
- `quality`：译文质量启发式评分（忠实度：数字/术语一致；流畅度：句长/重复度），输出 0–100 与改进点

## v0.4.0 — 对照与保护

- `diff`：原文/译文段级对照报告（Markdown 表格或行内对照），支持按段评分
- `protect`：占位符与标记保护（数字、URL、代码片段、格式标记）在分段/翻译建议中不被破坏

## v0.5.0 — 冲突与统计

- `conflict`：术语冲突检测（同一术语多译法 + 使用频率），与 consistency 互补（库级 vs 文本级）
- `effort`：字数/词数统计（中英混合）、预估翻译工作量

## v0.6.0 — 版本与流水线

- `glossary_version`：术语库版本管理（历史快照、差异 diff、回滚）
- `pipeline`：多语言批量流水线（en/zh/ja/ko 分批分段、逐批 QA、汇总结论）

## 发布节奏

每个版本完成后走完整 dsh-factory 流程：本地验证 → npm publish → GitHub topic → awesome PR。
