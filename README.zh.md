# dsh-plugin-translation

面向 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) agent 的**翻译工具包**：分块、术语提取、译文质检、语气指南与持久化翻译记忆。模型负责翻译，插件负责切分、校验与记忆。

## 安装

```bash
dsh plugin --profile <profile> add dsh-plugin-translation
```

重启 DSH 后，`translate_kit` 工具全局注册。

## 工具

| 动作 | 用途 |
| --- | --- |
| `segment` | 把长文本切成编号分块，便于分块翻译 |
| `glossary` | 提取候选术语（缩写、驼峰词、域名、数字+单位、邮箱、URL）及出现次数 |
| `check` | 译文质检：数字/单位、括号配对、长度比例、重复标点 |
| `tone` | 语气指南（正式 / 口语 / 技术，中 / 英） |
| `memo_get` | 读取翻译记忆（新的在前） |
| `memo_add` | 保存一条源文→译文到会话工作区内的记忆文件 |

## 配置

均为可选项，写在组合行的 `config` 里：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `personaSection` | `true` | 是否注册翻译提示词段 |
| `sectionOrder` | `6` | 提示词段顺序（persona 为 0，升序） |
| `memoFile` | `.dsh/translation-memo.md` | 记忆文件路径（相对会话工作区，运行时校验不可逃逸） |
| `maxMemoEntries` | `200` | 记忆文件保留的条目数 |

## 设计

纯逻辑（`lib/translation.js`）零 DSH/Cordis 依赖、可独立单测；`lib/index.js` 是薄 Cordis 壳。记忆读写走 `ctx.fs`，所有路径经 containment 校验锁定在会话工作区内。

## License

MIT
