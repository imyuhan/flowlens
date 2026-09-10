# FlowLens 关键设计与实现细节

> 本文档记录开发过程中的关键设计决策，尤其是**实现层面的具体细节**（具体数值、公式、词表、规则），与 `docs/ch01/01/plan.md` 的框架层设计互补。
> 后续开发中产生的新设计决策，继续追加到本文件。

---

## 1. 架构与分工

- 两层解耦：**分析引擎**（`lib/`，纯函数、无副作用、无 I/O）与**前端页面**（`app/` + `components/`）。
- 解耦契约：`AnalysisResult`（定义于 `lib/types.ts`），页面只消费契约，不感知引擎内部。
- 引擎唯一对外入口：`analyze(text: string): AnalysisResult`，同步返回、不抛异常。

## 2. 技术栈决策

| 决策点 | 选择 | 具体版本 / 说明 |
|--------|------|----------------|
| 框架 | Next.js App Router | 16.3.4 |
| React | 19 | 19.2.8 |
| 语言 | TypeScript | 5.9.3，strict 模式 |
| 样式 | Tailwind CSS **v4** | 4.3.3，用 `@tailwindcss/postcss` 插件 |
| 引擎形态 | 纯函数模块 | 确定性、可被 `tsx` 直跑 |
| 测试 | 冒烟脚本 | `tsx` 4.23.13，无测试框架 |

### Tailwind v4 的关键差异（易踩坑）

- `postcss.config.mjs` 用 `@tailwindcss/postcss` 插件（**不是** v3 的 `tailwindcss` 插件）。
- `globals.css` 用 `@import "tailwindcss";`（**不是** v3 的 `@tailwind base/components/utilities`）。
- **无需** `tailwind.config.js`，v4 默认自动扫描 `app`、`components` 等目录。

### tsconfig 关键项

- `strict: true`、`jsx: "preserve"`、`moduleResolution: "bundler"`。
- 路径别名 `@/*` → `./*`（页面用 `@/lib/analyzer` 引入引擎）。

## 3. 数据契约（`lib/types.ts`）

五个类型构成完整契约：`DimensionScores`、`TaskSop`、`TaskAnalysis`、`AnalysisSummary`、`AnalysisResult`。

实现细节：

- `TaskAnalysis.id` 生成规则：`task-{index + 1}`，`index` 为片段在切分结果中的序号（**不是**排序后序号，保持稳定唯一）。
- `tasks` 在 `analyze()` 内**已按 `priorityScore` 降序**排序，页面直接按数组顺序渲染，无需再排序。
- 评分字段 `priorityScore` 为 `Math.round` 取整；`averageScore`、`estimatedHoursPerWeek` 用 `round1` 保留 1 位小数。

## 4. 关键词词典（`lib/rules.ts`）

### 4.1 三维度与权重语义

- 权重类型 `KeywordWeight = 1 | 2 | 3`：**1=弱信号、2=中信号、3=强信号**。
- 匹配方式：**子串包含**（`text.includes(word)`），一个词命中即累计其权重。
- 每个维度的命中词单独收集，最终 `matchedKeywords` 是三维度命中词的**去重并集**。

### 4.2 重复性词典（频率 / 周期词，16 词）

| 权重 3 | 每天、每日、每周、每星期、每月、每季度、每年、定期、周期性 |
|--------|----------------------------------------------------------|
| 权重 2 | 反复、每当、每次、经常、常常、例行、日常 |

### 4.3 耗时性词典（机械 / 手工操作词，28 词）

| 权重 3 | 手动、手工、录入、汇总、核对、填表 |
|--------|----------------------------------|
| 权重 2 | 复制、粘贴、整理、导出、导入、填写、登记、统计、计算、比对、转交、转给、转发、通知、提醒、生成、发送、回复、审批、报销、归档、备份 |

### 4.4 规则明确度词典（条件 / 判断 / 规则词，24 词）

| 权重 3 | 如果、判断、是否、条件、分类、规则、否则、退款、换货、退货、异常 |
|--------|--------------------------------------------------------------|
| 权重 2 | 筛选、超过、低于、高于、大于、小于、等于、满足、符合、根据、依据、格式、范围 |

> 「分类」「筛选」归入**规则明确度**（按规则分流），不归耗时性，避免同一词在两个维度重复命中导致评分失真。

## 5. 评分模型（`lib/analyzer.ts`，核心公式）

### 5.1 维度分

```
维度分 = min(100, 命中关键词权重和 × 20)
```

- 单个强词（权重 3）→ 60 分；两个强词（权重和 5+）→ 100 分封顶。
- 设计意图：单强词足以显著区分「可自动化」，多词命中则拉满。

### 5.2 优先级分

```
priorityScore = round(repetition × 0.35 + timeCost × 0.40 + ruleClarity × 0.25)
```

- **耗时性权重最高（0.40）**——机械操作是自动化收益最大、最该优先的维度。
- 重复性次之（0.35），规则明确度最低（0.25）。

### 5.3 阈值

- **可自动化阈值 `SCORE_THRESHOLD = 25`**：`priorityScore < 25` 的片段被过滤掉。
- **过短输入阈值 `MIN_TEXT_LENGTH = 10`**：去空白后 < 10 字的输入直接返回空结果（不再切分匹配）。

## 6. 频率与工时估算

### 6.1 频率映射（`FREQUENCY_MAP`）

| 频率词 | 每周次数 | 频率词 | 每周次数 |
|--------|---------|--------|---------|
| 每天 / 每日 | 5 | 每季度 | 0.08 |
| 每周 / 每星期 | 1 | 每年 | 0.02 |
| 每月 | 0.25 | 每当 / 每次 | 3 |

- `detectWeeklyFrequency` 从 `matchedKeywords` 中找频率词，**命中多个时取最高频率**（更保守的工时估算），无命中默认 **1 次/周**。

### 6.2 单次耗时分档（`singleDurationHours`）

| 耗时维度分 | 单次耗时 |
|-----------|---------|
| ≥ 80 | 2 小时 |
| ≥ 50 | 1 小时 |
| ≥ 30 | 0.5 小时 |
| < 30 | 0.25 小时 |

### 6.3 每周节省工时

```
estimatedHoursPerWeek = Σ(每个任务的 频率 × 单次耗时)
```

## 7. 文案模板生成（`lib/templates.ts`）

### 7.1 自动化建议 `buildAutomationSuggestions`

按维度阈值触发对应建议（`≥ 50` 触发），再追加一条通用建议，**保证 2–4 条**：

- `repetition ≥ 50` → 「定时任务/调度工具自动触发」
- `timeCost ≥ 50` → 「脚本/RPA 替代手工操作」
- `ruleClarity ≥ 50` → 「规则引擎/表单分流自动处理」
- 通用 → 「沉淀为 SOP 与 Prompt 交给 AI 批量执行」

### 7.2 SOP 四段 `buildSop`

| 段 | 生成逻辑 |
|----|---------|
| trigger | 按关键词优先级判断：每当/每次（事件触发）> 每天 > 每周 > 每月 > 定期/周期性/例行 > 默认「按固定周期或事件触发」 |
| inputs | 基础「原始数据」+ 按关键词追加「分类标准/判定规则」「报表模板」+ 截取片段前 20 字作背景 |
| steps | 固定骨架：收集准备 →（规则 ≥50 加「筛选分类」）→（耗时 ≥50 加「汇总核对」）→ 生成输出 → 复核交付 |
| output | 按关键词映射：报表类→「报表/周报」，通知类→「分流工单/通知」，核对类→「核对结论/异常清单」，默认「整理后的处理结果」 |

### 7.3 可复用 Prompt `buildPrompt`

固定三段式模板：任务描述 + 处理规则（按维度命中追加）+ 输出要求（直接给结果、信息不足则指出缺失）。规则按维度阈值（`≥ 50`）追加，无命中时给兜底规则。

## 8. 分段切分与标题（`lib/analyzer.ts`）

### 8.1 分段 `splitSegments`

- 分隔符正则 `/[。！？；;!?\n]+/`——**逗号不切分**，避免把一句话切碎。
- 切分后 `trim` 并过滤空片段。

### 8.2 片段跳过规则

- 切分后长度 `< 2` 的碎片直接跳过（标点残留的 1 字碎片）。
- 注意：`summary.totalSegments` 统计的是**切分后的片段总数**（含未命中片段），与 `tasks.length`（命中并过阈值）不同。

### 8.3 任务标题 `buildTitle`

- 去掉**开头**的频率词前缀（如「每天」「每周」），再截取**前 14 字**，超出加 `…`。
- 若去掉前缀后为空，回退为原文前 14 字。

## 9. 边界处理与确定性（E5）

- 空白 / 过短（< 10 字）→ 返回 `emptyResult()`（`totalSegments: 0`、`tasks: []`）。
- 任何字符串输入**不抛异常**（纯函数、无 I/O、无随机数、无 Date）。
- 确定性：相同输入 → 相同输出（词典、权重、模板全部为静态常量）。

## 10. 验证基准（约定示例的预期输出）

约定示例（`scripts/smoke.ts` 与页面「填入示例」共用）：

> 每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。

切分后 4 个片段，预期 4 个可自动化任务（降序）：

| 片段 | priorityScore | 命中维度 |
|------|--------------|---------|
| 导出财务报表，筛选异常交易 | 62 | 重复+耗时+规则 |
| 整理销售数据，复制粘贴到周报 | 61 | 重复+耗时 |
| 汇总各部门进度，手动核对 | 61 | 重复+耗时 |
| 客户提交工单，判断退款/换货 | 55 | 重复+耗时+规则 |

概览预期：`totalSegments = 4`、`automatableCount = 4`、`averageScore = 59.8`、`estimatedHoursPerWeek = 14`。

> 此基准由 `npm run smoke` 断言，改动引擎实现后必须重跑验证。

## 11. 静态导出与部署（Cloudflare Pages）

- FlowLens 纯前端、无后端 / API Route / SSR，故采用 Next.js **静态导出**：`next.config.ts` 设 `output: "export"`，`npm run build` 生成 `out/` 目录（`index.html` / `404.html` / `_next/` 静态资源 / `icon.svg`）。
- 托管平台选 **Cloudflare Pages**（原因：Vercel 注册依赖 Google reCAPTCHA，国内不可用；Cloudflare 用自家 Turnstile 验证，且 `.pages.dev` 国内访问更稳）。
- Cloudflare Pages 构建配置：Framework 预设「Next.js (Static HTML Export)」、构建命令 `npm run build`、输出目录 `out`。
- `out/` 已加入 `.gitignore`（与 `/.next/` 同属构建产物，不入库）。
- 静态导出的约束：页面必须全部 `"use client"`（`app/page.tsx` 已是）；不可用 `next/image` 远程优化（本项目 Logo 为内联 SVG，无影响）；无动态路由需 `generateStaticParams`。

---

# ch02：LLM 主路径 + 客户端规则兜底

> 四份规格文档见 `docs/ch02/01/`。以下记录实现层面的具体决策与细节。

## 12. 架构

### 12.1 三层结构

```
浏览器（Next.js 静态导出）
  ├─ app/page.tsx        状态容器（header + 分析流程 + 历史）
  ├─ lib/api.ts          调用 /api/analyze + 30s 超时 + 降级决策
  ├─ lib/history.ts      localStorage 历史读写
  ├─ lib/analyzer.ts     规则引擎（兜底层，ch01 原样）
  └─ components/*        UI
          │  POST /api/analyze { text }
          ▼
Cloudflare Pages Function（functions/api/）
  ├─ analyze.ts    输入校验 → env.AI.run → 输出校验
  ├─ prompt.ts     SYSTEM_PROMPT + RESULT_SCHEMA
  └─ validate.ts   normalizeResult：校验 + 修正
          │
          ▼
Workers AI（env.AI 运行时绑定）
```

### 12.2 关键决策：规则兜底放在**客户端**，不放服务端

| | 服务端兜底 | **客户端兜底（实际选择）** |
|---|---|---|
| 代码成本 | 需把 `lib/` 打包进 Function | 零 —— `analyzer.ts` 本就在前端 bundle 内 |
| 服务端不可达时 | ❌ 完全失效 | ✅ 仍然兜得住 |
| 本地 `npm run dev` | 需另起 wrangler 才有结果 | ✅ 接口 404 → 自动降级，开发体验与 ch01 一致 |
| 服务端复杂度 | 调模型 + 兜底两套逻辑 | 只做「调模型 + 校验」 |

判断依据：**兜底层不该和它要保护的东西放在同一层**。服务端一挂，服务端兜底也跟着挂。

可行性来自一个已确认的事实：`lib/` 内部全部使用相对路径导入（`./types`、`./rules`、`./templates`），未使用 `@/` 别名 —— 因此它既可被 wrangler 打包、也可留在客户端。本方案选择后者。

### 12.3 Workers AI 绑定：整个项目零 API key

- 调用形态：`env.AI.run(MODEL, { messages, response_format })`，凭证由 Cloudflare 在运行时注入。
- **仓库、客户端产物、网络响应中都不存在任何密钥**（已验证，见 §13.4）。
- 生产：在 Cloudflare dashboard 为 Pages 项目配置名为 `AI` 的 Workers AI binding。
- 本地：`npx wrangler pages dev out --ai=AI`（官方支持，且优先于配置文件），已封装为 `npm run dev:full`。
- 免费额度：10,000 neurons/天（账户级，UTC 0 点重置），Free 计划超额直接报错、**不会产生账单**。

### 12.4 JSON Mode 与校验策略

- 使用 Workers AI 的 JSON Mode：`response_format: { type: "json_schema", json_schema: { name, schema } }`。
- **官方明确不保证模型遵守 schema**，且已知有「通过 Worker binding 传 json_schema 可能失败」的报告（REST API 可用）。因此 `normalizeResult` 是硬边界，不可省略。
- `validate.ts` 的修正规则（具体数值）：

| 处理项 | 规则 |
|--------|------|
| 分数 | clamp 到 0–100 并取整；非数值则丢弃该任务 |
| 字符串数组 | 去空、去重、最多 6 项（SOP 步骤最多 8 项） |
| 字符串长度 | 常规 400 字、标题 40 字、SOP 触发/输出 160 字、Prompt 1500 字 |
| 任务保留条件 | 标题非空 **且** priorityScore 可解析为数值，否则丢弃该任务 |
| id | **忽略模型给的 id**，按降序重排后重新生成为 `task-{n}` |
| summary | `automatableCount` / `averageScore` 一律按实际 tasks 重算，不采信模型 |
| 每周工时 | clamp 到 0–200 |
| 顶层判定 | 非对象或无 `tasks` 字段 → 返回 `null`（触发降级）；`tasks` 非数组 → 返回结构合法的空结果 |

### 12.5 数据契约扩展

`AnalysisResult` 增量扩展、不破坏 ch01 字段；`source` 不进契约以避免污染：

- `TaskAnalysis` 新增 `rationale: string[]` —— LLM 路径为语义判定依据，**规则路径固定为空数组**（`analyzer.ts` 只加了一行 `rationale: []`，逻辑零改动），页面据此回退到 `matchedKeywords` 关键词标签。
- 新增 `AnalysisSource`、`AnalysisOutcome`、`HistoryEntry`、`AnalyzeFailureReason`、`AnalyzeResponse`。
- 选择理由：`rationale` 用数组而非字符串，是为了和 `matchedKeywords` 一样按标签渲染，视觉上与 ch01 一致，但标签内容从 `#每天` 变成 `#每日重复触发` —— 语义提升直接可见。

### 12.6 降级决策抽成纯函数

`lib/api.ts` 的 `resolveOutcome(text, response, localAnalyze)` 把「接口响应 → 分析产出」的决策逻辑从组件里抽出。

原因：降级是本轮最需要被验证的行为，埋在 `page.tsx` 里就无法直接测试。抽出后 smoke 测试可以覆盖全部四种失败原因（见 §13.2）。

### 12.7 历史记录存储

- 单 key（`flowlens:history`）存 JSON 数组，最新在前，上限 50 条（超出截断尾部）。
- 所有操作包 try/catch：无 `window`（SSR）、隐私模式、配额写满、数据损坏都退化为「历史不可用」，**绝不抛出**（spec N11）。
- 数据损坏时丢弃并重建 key，避免之后每次读取都失败。
- 损坏条目在读取时被过滤，并把清理后的版本写回。
- `id` 用 `crypto.randomUUID()`，不可用时回退到时间戳 + 随机串。
- **历史条目存的是完整结果快照**（不只是输入），因此点击历史不消耗 LLM 额度，且结果与当时一致（不受 LLM 非确定性影响）。

### 12.8 header 从 layout 迁入 page

历史入口按钮需要交互，而历史状态属于 `page.tsx`。放进同一组件即可直接共享状态，无需 Context 或状态提升。项目为单页应用，header 放在 layout 并无实际收益。

`layout.tsx` 现在只保留 `<html>` / `<body>` / metadata。

### 12.9 移除 ch01 的假加载延时

ch01 用 `window.setTimeout(..., 320)` 模拟加载态（当时分析是同步瞬时的）。真异步后若保留，会在真实耗时上**叠加** 320ms，故删除（spec 的 checklist 有对应项）。

复制按钮的 1.5 秒回显 `setTimeout` 保留 —— 那是 UI 反馈，不是假加载。

## 13. 验证方式与实测结果

### 13.1 测试策略

项目无测试框架。采用三条路径：

1. **`npm run smoke`** —— 扩展为四层，61 条断言：
   - `[1]-[3]` 规则引擎（ch01 既有断言，**一条未删**）
   - `[4]` 服务端输出校验与规范化（11 条）
   - `[5]` 客户端降级决策（6 条）
   - `[6]` 本地历史存储含异常路径（9 条）
   历史测试用可控的 `localStorage` 桩（`installFakeStorage`），覆盖 corrupt / throw 两种故障模式。
2. **`npm run snapshot`** —— 16 个区块的渲染快照，用于重构前后逐字节对比。
3. **临时探针脚本** —— 每个任务实现时用 `tsx` 内联脚本验证，随后固化为上述持久测试或删除。

### 13.2 关键验证证据

| 项 | 证据 |
|---|---|
| Function 在真实运行时可用 | `wrangler pages dev` 启动后 curl：超长→`too_long`、空白→`model_error`、AI 未绑定→`model_error`（不崩溃）、静态页 200 |
| 超长输入不耗额度 | 直接调 handler 并断言 mock 的 `AI.run` **调用次数为 0** |
| 类型检查确实覆盖 functions/ | 放入故意报错的探针文件 → 退出码 2 且指向该文件；移除后回到 0 |
| 页面渲染未被破坏 | T11 改动前后 snapshot 逐字节 diff 无差异 |
| 规则引擎行为未变 | smoke 的 ch01 断言全部保留且通过；`EngineOutput` 区块仍为 4 任务 / 59.8 分 / 14 小时 |

### 13.3 端到端联调的**未完成部分**（如实记录）

以下三项因需要 Cloudflare 登录（浏览器授权）而**未验证**，经用户决定跳过：

- 模型选型实测（候选：Llama 3.3 70B / Llama 4 Scout / Qwen 系）—— `functions/api/analyze.ts` 的 `MODEL` 常量当前为初值 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，**未经实测确认**。
- JSON Mode 的 `json_schema` 形式在 binding 路径下是否生效 —— 若不生效，需退为 `json_object` + prompt 强约束。
- spec EA1 的语义识别对照（同义改写输入 vs 规则引擎漏判）—— 这是本轮最核心的价值主张，**尚未取得实测证据**。

### 13.4 凭据检查（含阳性对照）

- git 全部历史（307,873 字节）中无硬编码凭据。
- 源码、`out/` 客户端产物中均无 key 模式。
- **做了阳性对照**：用同一正则在伪造的 key 上验证能抓到，确认「未发现」不是正则失效导致的假阴性。

## 14. 遇到的问题与教训

### 14.1 管道退出码陷阱（本轮踩了两次）

- 第一次：`npm run typecheck | tail -8; echo $?` —— `$?` 是 `tail` 的退出码（恒为 0），掩盖了真实的失败。
- 第二次：`grep ... | head -5 && echo "⚠️ 有命中"` —— 管道退出码是 `head` 的（恒为 0），导致 `&&` 分支永远执行，**把「零命中」误报成「发现凭据」**，差点得出完全相反的结论。

**教训**：用管道后不能依赖 `$?` 或 `&&`/`||` 判断前一个命令的成败。改为先重定向到文件、再对文件执行 `grep`，或使用 `PIPESTATUS`。

### 14.2 免费额度的数据时效性

最初查到的「Gemini 免费层约 1500 请求/天」是**错误**的：更精确的实测数据显示 Gemini 3.x Flash 免费档只有 **20 请求/天**，Groq 的「1000 请求/天」也受 TPD 限制（70B 模型仅约 50 次/天）。

这直接改变了 provider 选型，最终选了**零 API key、零账单**的 Cloudflare Workers AI。

**教训**：免费额度政策变动频繁且第三方文章互相矛盾，必须交叉验证；架构上则要避免依赖某一家额度 —— 这正是「规则兜底」存在的意义。

### 14.3 并行会话共用工作目录

开发期间另一个会话在本仓库提交代码，导致：它的提交落到我创建的分支上、分支被重命名、我的提交落到新分支而非 main（见 git reflog）。

**教训**：两个会话共用一个工作目录做 git 操作会互相干扰，提交可能落到对方的分支上。

## 12. 组件可读性重构与渲染快照验证

### 12.1 背景

`components/` 下的 `TaskCard`、`EmptyState`、`ResultSummary` 由 Codex 生成时被压成单行 JSX（`TaskCard.tsx` 整张卡片挤在 1 行、约 4000 字符、约 15 层嵌套），`app/page.tsx:42` 用嵌套三元渲染整个结果区。本次为纯可读性重构：**不改逻辑、不改 Tailwind 类名、不改 DOM 结构**。

### 12.2 重构内容

| 文件 | 做法 |
|------|------|
| `components/TaskCard.tsx` | 维度表抽成 `DIMENSIONS` 常量（中文名 / 字段名 / 配色三元组），卡片按「头部 → 标签 → 双栏 → Prompt」分区并加中文注释 |
| `components/EmptyState.tsx` | 两种空态的文案抽成 `CONTENT` 常量表，按 `kind` 取用 |
| `components/ResultSummary.tsx` | 新增 `buildItems()` 生成三个统计项，`map` 回调展开 |
| `components/LoadingState.tsx` | **新增**：从 `page.tsx` 抽出的加载态 |
| `components/ResultView.tsx` | **新增**：从 `page.tsx` 抽出的结果区（概览条 + 卡片列表），props 为 `summary / tasks / copiedId / onCopy` |
| `app/page.tsx` | 用 `loading && …` / `!loading && hasTasks && …` / `!loading && !hasTasks && …` 三组互斥条件渲染替掉嵌套三元；`EXAMPLE` 旁新增 `MIN_INPUT_LENGTH` 常量 |

### 12.3 关键实现细节（易踩坑）

- **JSX 中跨行的 `{a} {b}` 会丢掉中间的空格。** 原代码 `{label} {value}` 两个表达式写在同一行，中间那个空格是**字面量**；若换行书写会变成 `{label}{value}`，渲染结果从「重复 62」变成「重复62」。重构维度标签时必须保持这两个表达式同行。
- **状态分支的互斥性。** 原嵌套三元的 else 分支进入条件是 `result || loading`。改写成并列 `&&` 后必须保证 `loading` / `!loading && hasTasks` / `!loading && !hasTasks` 三者互斥，否则会同时渲染加载态与结果。本例靠 `loading` 与 `!loading` 天然互斥成立。
- **`TaskCard` 的维度字段名不能直接搬。** 原实现把分值先在组件体内取成数组（`[label, value, cls]`），重构为 `[label, key, cls]` 后渲染时现取 `task.dimensions[key]`——两者渲染结果一致，但类型收窄方式不同，需确认 `key` 在 `DimensionScores` 上可索引。

### 12.4 验证方法（无测试框架下的机械证明）

- `scripts/render-snapshot.tsx`（`npm run snapshot`）用 `react-dom/server` 的 `renderToStaticMarkup` 把组件渲染成静态 HTML 打印到 stdout。
- 改动前后各跑一次并 `diff`，逐字节一致即可机械地证明渲染结果未变：

  ```bash
  npm run --silent snapshot > before.html
  # ... 改代码 ...
  npm run --silent snapshot > after.html
  diff before.html after.html
  ```

  > 必须加 `--silent`：不加的话 npm 会把 4 行执行横幅写进 stdout，污染快照文件。

- 快照覆盖：`ResultSummary`、任务卡片列表、`copied=true` 的卡片、两种空态、4 档分值的 `ScoreBar`，以及引擎输出 JSON（确认没碰到 `lib/`）。
- `ResultView` 的抽取是否忠实，单独用「`ResultView` 渲染输出 == 基线中 `ResultSummary` + `TaskList` 两段拼接」验证。
- 验证结果：以上比对**全部逐字节一致**；`npm run typecheck`、`npm run build`、`npm run smoke` 均通过（smoke 的基准仍为 `4 / 59.8 / 14`）。
- **局限**：快照只覆盖静态渲染。交互行为（点击复制、输入、加载态切换、`copiedId` 回显）不在覆盖范围内，仍需人工确认。

### 12.5 本次未做的事

本次是纯可读性重构，**没有修复任何引擎缺陷**。以下问题仍然存在，留待后续处理：

- 任务 id 跳号（`analyzer.ts:223` 传过滤前的下标，卡片会印出 `TASK 01 / TASK 03`）
- `summary.totalSegments` 含被跳过的碎片（`analyzer.ts:233`），与 `automatableCount` 口径不一致
- `estimatedHoursPerWeek` 取最高频率且假设 100% 消除，偏乐观
- `npm run start` 在 `output: "export"` 下是死脚本
- `KeywordWeight` 的 `1` 档位从未被任何词使用
