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
