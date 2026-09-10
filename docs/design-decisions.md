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

- 权重类型 `KeywordWeight = 2 | 3`：**2=中信号、3=强信号**。（原设计有 `1=弱信号` 一档，但从未有词使用过，2026-09-10 收窄，详见 §17。）
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

- `detectWeeklyFrequency` 从 `matchedKeywords` 中找频率词，**命中多个时取最高频率**，**无命中才**默认 **1 次/周**。
- 2026-09-10 修掉一个让下半张表整体失效的缺陷：原实现以 `freq = 1` 起做「只升不降」的比较，导致 `每月(0.25)` / `每季度(0.08)` / `每年(0.02)` 这三个低于 1 的条目**永远抬不过初值，等于死代码**——「每月导出财务报表」被当成 1 次/周，高估 4 倍。现在默认值只在「一个频率词都没命中」时兜底，详见 §17。
- 另注：原注释写的「取最高频率 = 更保守的估算」是**反的**。频率越高，节省工时越大，估算越**乐观**。此处保留「取最高」的实现，但不再称之为保守。

### 6.2 单次耗时分档（`singleDurationHours`）

| 耗时维度分 | 单次耗时 |
|-----------|---------|
| ≥ 80 | 2 小时 |
| ≥ 50 | 1 小时 |
| ≥ 30 | 0.5 小时 |
| < 30 | 0.25 小时 |

### 6.3 每周节省工时

```
estimatedHoursPerWeek = Σ(每个任务的 频率 × 单次耗时 × 自动化覆盖率)
```

- **自动化覆盖率 `AUTOMATION_COVERAGE = 0.5`**：自动化通常只能消除一部分工时（其余用于复核结果、处理异常、维护规则），故按 50% 折算。**不再假设 100% 消除**。
- 该系数同时写进了 `functions/api/prompt.ts`（第 9 条需求），保证**规则路径与 LLM 路径的工时口径一致**——否则同一次输入换个来源就会给出差一倍的数字。

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

概览预期：`totalSegments = 4`、`automatableCount = 4`、`averageScore = 59.8`、`estimatedHoursPerWeek = 6.8`。

> 2026-09-10 更新：`estimatedHoursPerWeek` 由 `14` 改为 `6.8`，两次改动叠加所致：
>
> 1. 覆盖率折算：`14 × 0.5 = 7`；
> 2. 「每月」任务的频率由被默认值吞掉的 `1` 次/周还原为 `0.25` 次/周，少算 `(1 − 0.25) × 0.5 小时 × 0.5 覆盖率 = 0.1875`；
>
> 结果 `7 − 0.1875 = 6.8125 → 6.8`。评分与任务数不受影响（见 §17）。

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
| 规则引擎行为未变 | smoke 的 ch01 断言全部保留且通过；`EngineOutput` 区块仍为 4 任务 / 59.8 分 / 14 小时（**该 14 小时是当时的基准**；2026-09-10 工时口径调整后为 6.8，见 §17） |

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

---

# ch02 二次变更：provider 由 Workers AI 改为阿里云百炼

## 15. 变更原因与影响

原方案用 Cloudflare Workers AI（`env.AI` 运行时绑定，零 API key），但**该路径未能调通**。改为通过 **OpenAI 兼容协议**调用阿里云百炼。

| 项 | 变更前 | 变更后 |
|---|---|---|
| 凭证 | 无（运行时绑定注入） | `OPENAI_API_KEY` 环境变量 |
| 结构化输出 | `json_schema`（严格约束） | `json_object`（**只保证语法合法**） |
| 调用方式 | `env.AI.run(model, inputs)` | `fetch {base}/chat/completions` |
| 客户端、降级策略、数据契约、历史记录 | — | **全部不变** |

这次变更只动服务端两个文件（`analyze.ts`、`prompt.ts`）与部署配置，验证了「规则兜底在客户端」这个决策的韧性：provider 换掉，兜底层一行没改。

## 15.1 关键实现细节

**改为环境变量驱动**：`OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_API_KEY` 三项覆盖即可切换到任意 OpenAI 兼容服务（DeepSeek、硅基流动、Kimi 等），**换服务商无需改代码**。

默认值：

| 常量 | 值 | 说明 |
|---|---|---|
| `DEFAULT_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 百炼北京站 |
| `DEFAULT_MODEL` | `qwen-plus-2025-07-28` | 由使用方指定 |
| `MAX_INPUT_LENGTH` | 2000 | 不变，在调用上游之前拦截 |
| `UPSTREAM_TIMEOUT_MS` | 55000 | **必须小于客户端超时**（`lib/api.ts` 的 `TIMEOUT_MS = 65000`），否则客户端先降级、`timeout` 原因会失真 |

**`prompt.ts` 的改动**：删除了 `RESULT_SCHEMA` 对象（该服务不接受它），改为把期望结构以示例形式（`RESULT_SHAPE`）**写进 prompt 文本**。这是 `json_object` 模式的无奈之处——模型看不到 schema，只能靠 prompt 描述。

**该服务的两条硬约束**（已写进代码注释，避免以后误删）：

1. 启用 `json_object` 时，**prompt 中必须出现「JSON」字样**，否则接口直接报错。
2. **思考模式下不支持结构化输出** —— 若换用 qwen3 等思考模型，必须显式关闭 thinking。

**错误分类策略**：

| 情形 | 归一为 |
|---|---|
| 未配置 key（且不发起上游请求） | `model_error` |
| 上游非 2xx、网络异常、请求体解析失败 | `model_error` |
| 上游返回非 JSON、结构无法修复 | `invalid_output` |
| 输入超长（且不发起上游请求） | `too_long` |

服务端用 `console.error` 记录状态码等排查信息，但**不返回给客户端**（spec N8）。

## 15.2 密钥防泄漏

- `.gitignore` 新增 `.dev.vars` 与 `.dev.vars.*`，并用 `!.dev.vars.example` 放行模板。
- 仓库只提交不含真实值的 `.dev.vars.example`。
- 判据用 `git status --untracked-files=all`：`.dev.vars` 不出现、`.dev.vars.example` 出现。

> **踩坑（本轮第三次同类问题）**：`git check-ignore` 对**否定规则**同样返回退出码 0，输出行首带 `!` 才表示「该规则排除了它」。拿退出码当判据会得出与事实相反的结论。判断是否被忽略应看 `git status`。

## 15.3 本次验证（mock 上游，无需真 key）

替换 `globalThis.fetch` 注入 mock，覆盖 19 项断言：

- **请求形态**：URL 拼接、`Authorization: Bearer`、`model` 取值、`response_format.type === "json_object"`、`stream === false`、system prompt 含 "JSON"
- **默认值**：不提供环境变量时确实指向百炼北京端点
- **异常路径**：缺 key、超长输入（两者均断言**未发起上游请求**）、上游 401、模型输出非 JSON、网络异常 —— 全部正确归一且不抛出

**真 key 的端到端验证已完成**（2026-09-10）：输入 G1-1「我天天盯着销售表，把数字抄进周报，一个月下来特别费时间，眼睛都花了。」——规则引擎返回 **0 个任务**（漏判），LLM 路径返回 **1 个任务、94 分**，`rationale` 为「每日重复触发 / 需逐条手工核对 / 规则明确可提取 / 机械复制操作」。spec 的 **EA1 由此得到实测证据**。

### 15.4 耗时实测与超时阈值调整

2026-09-10 实测（Node 直接调用 handler，使用 `.dev.vars` 中的真实 key）：

| 输入 | 任务数 | 耗时 |
|---|---|---|
| 单任务（G1-1） | 1 | 9.2 秒 |
| 约定示例 | 4 | 22.1 秒 |

**输出量随任务数近似线性增长**——每个任务都要生成完整的 SOP 四段、2-4 条建议与一段完整的中文 Prompt，这些都必须一次性产出，无法分批。

据此调整：

| 常量 | 原值 | 新值 |
|---|---|---|
| 服务端 `UPSTREAM_TIMEOUT_MS` | 25000 | **55000** |
| 客户端 `TIMEOUT_MS` | 30000 | **65000** |

**原定的 25 秒对 4 任务输入只剩 3 秒余量，会稳定误杀**——表现为服务端 `AbortError`，用户侧则看到静默降级。这不是偶发抖动，而是阈值取小了。

> 若日后仍频繁超时，**减少单次输出量**（限制 `reusablePrompt` 长度、`steps` 条目数）比继续加大超时更有效——超时只是容忍慢，减少输出才是真正提速。

## 16. 排查记录：一次「接口立即失败」的误判

值得完整记下来，因为它差点导向一个完全错误的结论。

### 现象

`wrangler pages dev` 下请求 `/api/analyze` 返回 `{"ok":false,"reason":"model_error"}`，**耗时仅 0.006 秒**。而同一份代码在 Node 里直接调用 handler 完全正常（8.6 秒、`ok: true`、真实调通百炼）。

若只看现象，结论会滑向「wrangler 环境的 fetch 有问题」或「key 无效」。

### 排查弯路

1. 怀疑 **Windows git bash 编码**（终端输出出现过 `HTTP 200����ʱ` 乱码）→ 改用纯 ASCII 输入，**仍然失败** → 排除编码。
2. 查 **服务端日志**，发现我埋的 `console.error` 一条都没出现 → 一度以为是 wrangler 吞日志。**这个判据本身不可靠**：worker 的 console 在 stdout 被重定向到文件时，行为与交互式终端不同。
3. 临时把错误详情塞进响应体（`_debug` 字段）→ 响应里**既没有 `_debug` 也没有新行为** → 反推出失败发生在**旧代码**的 catch 分支里（旧代码不返回 `_debug`）。
4. `rm -rf .wrangler` 报 `Device or resource busy` → 顺藤摸到**多组 wrangler 进程树残留**。

### 根因

用 `&` 后台启动 `npx wrangler pages dev` 后，`kill $PID` **只杀掉了最外层 bash**。完整进程链 `bash → npx → cmd → wrangler.js → wrangler main → workerd` 全部存活，而且 **wrangler main 会在 workerd 被杀后自动把它重启**。

于是累积了 3~4 组实例**同时监听同一端口**，请求被路由到**最旧的那个**——它跑的是改造前的代码（`env.AI.run()`），AI binding 未配置，于是立即抛异常、立即返回 `model_error`。

**「LLM 调用失败」的所有迹象，都指向一份根本不存在的故障。**

### 正确做法

- 后台启动的服务，清理要用 **`taskkill /F /T /PID <顶层PID>`**（杀整棵树），而不是 `kill $PID`。
- 判断残留：`netstat -ano | grep ":<端口>"` 看有几个 PID 在 LISTENING；`Get-CimInstance Win32_Process -Filter "Name='workerd.exe'"` 看还有几组。
- 杀 **workerd 的父进程**（wrangler main）才真正停得下来，只杀 workerd 会被重启。
- 测试换端口，或测试前先确认端口无残留。

### 教训

**「0.006 秒返回失败」是一个强烈的信号**：真实的网络请求不可能这么快失败。遇到**物理上不可能的耗时**，应该先怀疑「请求到底打到了哪里」，而不是去查业务逻辑。我在这上面绕了四轮。

> 另注：本轮为定位问题，两次触发了工具权限拒绝，且**拒绝都是对的** —— 一次是命令要打印 API key 的片段（哪怕只打印前三位后四位也算凭据外泄），一次是 `taskkill /F /IM workerd.exe` 按映像名通杀会误伤其它项目。改用「只输出长度与布尔特征」和「只杀已知 PID」后即通过。

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

本次是纯可读性重构，**没有修复任何引擎缺陷**。当时列出的遗留问题如下——**已于 2026-09-10 全部处理，见 §17**：

- [x] 任务 id 跳号（`analyzer.ts:223` 传过滤前的下标，卡片会印出 `TASK 01 / TASK 03`）
- [x] `summary.totalSegments` 含被跳过的碎片（`analyzer.ts:233`），与 `automatableCount` 口径不一致
- [x] `estimatedHoursPerWeek` 取最高频率且假设 100% 消除，偏乐观
- [x] `npm run start` 在 `output: "export"` 下是死脚本
- [x] `KeywordWeight` 的 `1` 档位从未被任何词使用

> 修复时又发现一条当时未列出的缺陷（`每月/每季度/每年` 三个频率条目实为死代码），一并修掉，见 §17.1。

---

# 17. §12.5 引擎缺陷修复（2026-09-10）

## 17.1 修了什么

| # | 缺陷 | 根因 | 修法 |
|---|------|------|------|
| 1 | 任务 id 跳号（只印出 `TASK 02`） | `analyzeSegment(segment, i)` 传的是**片段下标** `i`，而被 `length < 2` 过滤掉的碎片已经消耗了下标 | 改传**已产出任务数** `tasks.length`；`analyzeSegment` 的参数名同步改为 `taskIndex` |
| 2 | `totalSegments` 含被跳过的 1 字碎片 | `buildSummary(segments.length, …)` 传的是**过滤前**的数组长度 | 把 `length >= 2` 的过滤提前到 `analyze()` 里，`segments` 从此就是「可分析片段」，两处口径合一；魔法数字 `2` 抽成常量 `MIN_SEGMENT_LENGTH` |
| 3 | **每月 / 每季度 / 每年 的频率条目永不生效**（§12.5 未列出，本次新发现） | `detectWeeklyFrequency` 以 `freq = 1` 起做「只升不降」比较，低于 1 的条目抬不过初值 | 默认值改为只在「一个频率词都没命中」时兜底（`DEFAULT_WEEKLY_FREQUENCY`），命中则取命中项的最大值 |
| 4 | 每周节省工时偏乐观（假设 100% 消除） | `Σ(频率 × 单次耗时)` 无折扣 | 引入 `AUTOMATION_COVERAGE = 0.5`，公式改为 `Σ(频率 × 单次耗时 × 覆盖率)`；**同步改 `functions/api/prompt.ts` 第 9 条**，否则两条路径口径不一致 |
| 5 | `npm run start` 是死脚本 | `output: "export"` 下 `next start` 直接报错退出 | 改为 Next 报错信息里自己推荐的 `npx serve@latest out` |
| 6 | `KeywordWeight` 的 `1` 档从未使用 | 死档位 | 类型收窄为 `2 \| 3`，并在注释里写明「需要弱信号词时先加回类型再补词」 |

> 缺陷 3 是这次**修 4 时顺手测出来的**：`docs` §6.1 一直把 `每月 → 0.25` 当作生效值，代码里却永远返回 1——**文档与实现互相矛盾**，而单看代码不会觉得有问题（`FREQUENCY_MAP` 里明明写了）。这也是「不要只按 §12.5 的字面清单改」的一个例子。

## 17.2 验证方式与证据

**测试先行**：先在 `scripts/smoke.ts` 新增 `[7] 引擎回归：§12.5 缺陷` 共 9 条断言，运行确认**全部按预期失败**（RED）：

```
❌ 跳过 1 字碎片后，任务 id 仍从 task-1 起连续编号 — got task-2
❌ totalSegments 只计可分析片段（不含 1 字碎片） — got 2
❌ 命中「每月」→ 0.25 次/周 — got 1
❌ 命中「每季度」→ 0.08 次/周 — got 1
❌ 命中「每年」→ 0.02 次/周 — got 1
❌ 「每天 × 2 小时」按 0.5 覆盖率折算为 5 小时/周 — got 10
❌ 约定示例的每周节省工时 = 6.8（含「每月」任务的 0.25 次/周） — got 14
```

改完实现后全绿。另有 2 条**边界断言从一开始就通过**（「无频率词命中时仍默认 1 次/周」「命中多个频率词时取最高」），特意保留，用来约束新实现不能把既有行为改坏。

| 项 | 证据 |
|---|---|
| 全量断言 | `npm run smoke` → 70 条全通过（原 61 条**一条未削弱**，新增 9 条） |
| 类型收窄未破坏词典 | `npm run typecheck` → 退出码 0（app 与 functions 双侧） |
| 产物可构建 | `npm run build` → 退出码 0，4 个静态页正常生成 |
| 渲染未被误伤 | 用 `git archive HEAD` 建基线副本分别渲染快照并逐字节 diff：**17 个区块中仅 2 处变化**——`ResultSummary` 的 `14 小时` → `6.8 小时`、`EngineOutput` 的 `"estimatedHoursPerWeek": 14` → `6.8`。**`TASK 0X` 标签一个都没变**，反证 id 修复没有改动约定示例的渲染 |
| `npm run start` 真的能跑 | 后台起 `serve` 后 curl：`status=200`、`<title>FlowLens · AI 工作流分析</title>`、8774 字节（与线上部署同尺寸） |

**基准变更**：约定示例概览由 `4 / 59.8 / 14` 变为 **`4 / 59.8 / 6.8`**。任务数、各任务优先级分、平均分**全部未变**。

## 17.3 本次未动的地方（如实记录）

- **任务 id 在排序后与显示顺序不一致。** id 按片段序号生成，而 `tasks` 之后会按优先级降序排序，所以约定示例的卡片顺序是 `TASK 04 / 01 / 02 / 03`（**这是本次改动之前就存在的行为**，本次只消除了「跳号」，没有引入新问题）。LLM 路径（`functions/api/validate.ts`）则是**排序后**重编号 `task-{n}`，两条路径在这里并不一致。若要统一，应让规则路径也改为排序后编号——那会动到 §3「id 用片段序号、不用排序后序号」的既有约定，故本次不改，留待决定。
- **`estimatedHoursPerWeek` 仍是启发式估算**，0.5 这个系数是一个明示的假设，不是实测值。

## 17.4 本轮踩到的两个操作坑

1. **后台进程按 PID 杀要杀整棵树，`serve` 也一样。** `npx serve@latest out` 用 `&` 后台启动后，`taskkill //F //T //PID <bash的PID>` 并没有停掉真正在监听的进程，`netstat` 仍见 3941 处于 LISTENING。改用 **listening 的那个 PID** 再 `taskkill //F //T` 才清理干净。（与 §16 的 wrangler 残留同源：**判断残留看 `netstat`，不看启动命令返回没返回**。）
2. **在仓库根目录跑子目录里的 tsx 脚本会炸。** 为做快照对比，我把 HEAD 的副本放在 `.snapshot-baseline/` 后从仓库根执行 `npx tsx .snapshot-baseline/scripts/render-snapshot.tsx`，报 `ReferenceError: React is not defined`；**`cd` 进该子目录再执行就正常**。tsx 解析 `tsconfig.json`（`jsx: "preserve"`）是按 cwd 而非脚本所在目录，隔着目录跑会退化成经典 JSX 转换。以后做这种「基线副本对比」记得先 `cd` 进去。
