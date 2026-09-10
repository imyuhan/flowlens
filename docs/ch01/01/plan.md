# FlowLens Plan

## 架构概览

FlowLens 是纯前端的 Next.js 单页应用，分两层：

1. **分析引擎（`lib/`，本实现者负责）**：纯函数模块，无副作用、无 I/O。输入一段文本，输出 `AnalysisResult`。由四个文件组成：类型契约、关键词词典、文案模板、分析主入口。
2. **前端页面（`app/` + `components/`，Codex 负责）**：调用 `analyze()`，负责输入、状态管理、结果渲染。它只依赖 `@/lib/analyzer` 的 `analyze` 和 `@/lib/types` 的类型，不感知引擎内部实现。

两者通过 `AnalysisResult` 数据契约解耦：引擎改动内部实现不影响页面，页面只消费契约。

## 核心数据结构（引擎与页面的共享契约）

### AnalysisResult

```ts
interface AnalysisResult {
  summary: AnalysisSummary;
  tasks: TaskAnalysis[];   // 已按 priorityScore 降序
}
```

### AnalysisSummary

```ts
interface AnalysisSummary {
  totalSegments: number;         // 识别到的任务片段总数
  automatableCount: number;      // 可自动化任务数（= tasks.length）
  averageScore: number;          // 平均优先级分 0–100，保留 1 位
  estimatedHoursPerWeek: number; // 估算每周节省小时数，保留 1 位
}
```

### TaskAnalysis

```ts
interface TaskAnalysis {
  id: string;
  title: string;             // 任务名（从片段截取）
  rawText: string;           // 原始片段
  priorityScore: number;     // 0–100 加权综合分
  dimensions: DimensionScores;
  matchedKeywords: string[]; // 命中的关键词（去重）
  automationSuggestions: string[];
  sop: TaskSop;
  reusablePrompt: string;
}
```

### DimensionScores

```ts
interface DimensionScores {
  repetition: number;   // 重复性 0–100
  timeCost: number;     // 耗时性 0–100
  ruleClarity: number;  // 规则明确度 0–100
}
```

### TaskSop

```ts
interface TaskSop {
  trigger: string;   // 触发条件
  inputs: string[];  // 输入/材料
  steps: string[];   // 步骤
  output: string;    // 输出
}
```

### 引擎对外接口

```ts
// lib/analyzer.ts
export function analyze(text: string): AnalysisResult;
```

纯函数、同步返回、不 throw（空/非法输入返回空结果）。

## 模块设计

### 模块 A：类型契约 `lib/types.ts`

- **职责**：定义上述所有类型，是引擎与页面的唯一契约来源。
- **对外**：导出 `AnalysisResult`、`TaskAnalysis`、`AnalysisSummary`、`DimensionScores`、`TaskSop`。
- **依赖**：无。

### 模块 B：关键词词典 `lib/rules.ts`

- **职责**：三个维度的关键词词典，每个词带权重（1=弱、2=中、3=强）。
  - 重复性词典：频率/周期词（每天、每周、每月、定期、反复、每当……）
  - 耗时性词典：机械/手工操作词（手动、录入、复制、粘贴、汇总、核对……）
  - 规则明确度词典：条件/判断/规则词（如果、判断、是否、条件、分类……）
- **对外**：导出三个 `KeywordRule[]`（`{ word, weight }`）。
- **依赖**：无。

### 模块 C：文案模板 `lib/templates.ts`

- **职责**：根据命中维度生成自动化建议、SOP、可复用 Prompt 的纯函数。
- **对外**：
  - `buildAutomationSuggestions(dims, keywords): string[]` — 2–4 条
  - `buildSop(rawText, dims, keywords): TaskSop`
  - `buildPrompt(rawText, dims, keywords): string`
  - `detectWeeklyFrequency(keywords): number`
- **依赖**：`types`。

### 模块 D：分析主入口 `lib/analyzer.ts`

- **职责**：编排完整流程，是引擎唯一对外入口。
- **对外**：`analyze(text): AnalysisResult`。
- **依赖**：`types`、`rules`、`templates`。

### 前端页面（Codex，需求级）

- `app/page.tsx` — 唯一 `"use client"` 状态容器，持有 `input` / `result` / `loading` 状态
- `components/WorkflowInput.tsx` — 输入区（textarea + 填入示例 + 分析按钮）
- `components/ResultSummary.tsx` — 概览条（可自动化数 / 平均分 / 节省工时）
- `components/TaskCard.tsx` — 单张任务卡片
- `components/ScoreBar.tsx` — 评分条（0–100 进度条 + 颜色 + 数字）
- `components/EmptyState.tsx` — 空态 / 无命中态

> 组件可拆分/合并，但保持职责单一；`page.tsx` 是唯一状态容器，其余组件接收 props 做纯展示。

## 模块交互（数据流）

```
用户输入文本
   │  (app/page.tsx 调用 analyze)
   ▼
analyze(text)
   │  1. 切分任务片段（按 。！？；!?\n，忽略逗号避免切碎）
   │  2. 每个片段 → 三个词典关键词匹配 → 三维度分
   │  3. 加权得 priorityScore，过滤低于阈值的片段
   │  4. 按分数降序，模板化生成建议 / SOP / Prompt
   ▼
AnalysisResult ──► 页面渲染概览条 + 任务卡片
```

## 评分模型（关键技术决策）

- **维度分**：某维度命中关键词权重和 → `min(100, 权重和 × 20)`（单个强词约 60 分，两个强词封顶 100）
- **优先级**：`repetition × 0.35 + timeCost × 0.4 + ruleClarity × 0.25`（耗时性权重最高——机械操作是自动化最大收益）
- **可自动化阈值**：`priorityScore >= 25`
- **节省工时**：`频率 × 单次耗时`；频率由频率词推断（每天=5、每周=1、每月=0.25、每当/每次=3、默认=1）；单次耗时按 `timeCost` 分档（≥80→2h、≥50→1h、≥30→0.5h、否则 0.25h）

## 需求覆盖

| 需求 | 归属 |
|------|------|
| E1 识别可自动化任务 | analyzer（切分 + 匹配 + 过滤） |
| E2 三维度打分 + 优先级 | analyzer + rules + 评分模型 |
| E3 建议 / SOP / Prompt | templates |
| E4 概览统计 | analyzer `buildSummary` |
| E5 边界处理 / 确定性 | analyzer 主入口 |
| P1 输入 + 填入示例 | WorkflowInput |
| P2 触发 + 加载态 | page.tsx + WorkflowInput |
| P3 概览条 | ResultSummary |
| P4 任务卡片 | TaskCard + ScoreBar |
| P5 复制 Prompt | TaskCard |
| P6 状态处理 | page.tsx + EmptyState |

## 文件组织

```
project/
├── lib/                     # 分析引擎（我实现）
│   ├── types.ts             — 数据契约
│   ├── rules.ts             — 关键词词典
│   ├── templates.ts         — 文案生成
│   └── analyzer.ts          — 主入口 analyze()
├── app/                     # 前端页面（Codex 实现）
│   ├── layout.tsx           — 根布局 + metadata
│   ├── globals.css          — Tailwind 指令 + 字体
│   └── page.tsx             — 主页面（状态容器）
├── components/              # 页面组件（Codex 实现）
│   ├── WorkflowInput.tsx
│   ├── ResultSummary.tsx
│   ├── TaskCard.tsx
│   ├── ScoreBar.tsx
│   └── EmptyState.tsx
├── scripts/
│   └── smoke.ts             # 引擎冒烟测试（我实现）
├── docs/
│   ├── spec.md / plan.md / task.md / checklist.md
├── package.json / tsconfig.json / next.config.ts / postcss.config.mjs
└── README.md                # 英文（交付阶段）
```

## 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 框架 | Next.js App Router | CLAUDE.md 指定 React/Next.js；App Router 是当前默认 |
| 语言 | TypeScript | 引擎与页面共享类型契约，TS 保证契约不被破坏 |
| 样式 | Tailwind CSS | 快速、响应式友好，适合 1 天交付 + 移动端不崩 |
| 引擎形态 | 纯函数模块（无副作用） | 确定性、可测试、可被冒烟脚本直接调用 |
| 引擎/页面解耦 | 通过 `AnalysisResult` 契约 | 引擎内部改动不影响 Codex 页面 |
| 评分方式 | 关键词权重和 → 0–100 | 无 LLM、确定性、轻量，符合「纯规则」决策 |
| 部署 | Vercel | Next.js 官方托管，零配置，公网可访问 |
| 测试 | 冒烟脚本（node 直跑） | 引擎是纯函数，无需测试框架，脚本即可验证 |

## 约定示例（引擎测试与页面「填入示例」共用）

```text
每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。
```

冒烟脚本用这段验证 EA1–EA5，页面「填入示例」按钮填充同一段，保证两者一致。
