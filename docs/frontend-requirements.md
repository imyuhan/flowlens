# FlowLens 前端页面实现要求

> 本文档自包含，Codex 无需阅读 spec / plan 即可实现页面。
> 分析引擎已完成，页面只需调用 `analyze()` 并渲染结果，不感知引擎内部实现。

## 1. 背景

FlowLens 是一个轻量的 AI 工作流分析工具：用户输入一段日常工作描述，系统识别其中「重复、耗时、规则明确」的可自动化任务，输出自动化建议、优先级评分、SOP 与可复用 Prompt。

**页面定位**：纯前端、单页、无路由。负责「输入 → 触发分析 → 渲染结果」，所有分析逻辑在 `lib/analyzer.ts` 内即时完成，无网络请求、无 loading 延迟（但 UI 仍需呈现加载态以符合状态机）。

## 2. 技术栈与已就绪内容

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript（strict）
- **样式**：Tailwind CSS **v4**（已配置，见「样式注意事项」）
- **路径别名**：`@/*` → 项目根目录 `./*`

已就绪、请勿改动：

| 文件 | 说明 |
|------|------|
| `lib/types.ts` | 数据契约（下述类型定义） |
| `lib/rules.ts` / `lib/templates.ts` / `lib/analyzer.ts` | 分析引擎（纯函数） |
| `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `package.json` | 脚手架配置 |
| `scripts/smoke.ts` | 引擎冒烟测试（`npm run smoke`） |

## 3. 引擎调用方式

```ts
import { analyze } from "@/lib/analyzer";
import type { AnalysisResult } from "@/lib/types";

const result: AnalysisResult = analyze(inputText);
```

- `analyze(text: string): AnalysisResult`，纯函数、同步返回、**不抛异常**。
- 空白/过短输入（去空白后 < 10 字）返回空结果；未命中任何可自动化任务的输入返回 `tasks: []`。

## 4. 数据契约（完整类型）

```ts
// lib/types.ts —— 页面消费的唯一契约

export interface DimensionScores {
  repetition: number;   // 重复性 0–100
  timeCost: number;     // 耗时性 0–100
  ruleClarity: number;  // 规则明确度 0–100
}

export interface TaskSop {
  trigger: string;   // 触发条件
  inputs: string[];  // 输入/材料
  steps: string[];   // 步骤
  output: string;    // 输出
}

export interface TaskAnalysis {
  id: string;
  title: string;             // 任务名
  rawText: string;           // 原始片段
  priorityScore: number;     // 0–100 优先级分（已用于降序排列）
  dimensions: DimensionScores;
  matchedKeywords: string[]; // 命中的关键词（去重）
  automationSuggestions: string[]; // 自动化建议列表
  sop: TaskSop;
  reusablePrompt: string;    // 可复用 Prompt
}

export interface AnalysisSummary {
  totalSegments: number;         // 任务片段总数
  automatableCount: number;      // 可自动化任务数
  averageScore: number;          // 平均优先级分（保留 1 位）
  estimatedHoursPerWeek: number; // 估算每周节省小时数（保留 1 位）
}

export interface AnalysisResult {
  summary: AnalysisSummary;
  tasks: TaskAnalysis[];  // 已按 priorityScore 降序
}
```

引擎返回的 `tasks` **已经按 `priorityScore` 降序**，页面直接按数组顺序渲染即可，无需再排序。

## 5. 页面需求（P1–P6）

### P1 输入区 + 填入示例
- 提供多行文本输入区（textarea）接收工作描述。
- 提供「填入示例」按钮：点击后把「约定示例文本」（见 §8）一键填充到输入区。

### P2 触发分析 + 加载态
- 提供「开始分析」按钮触发 `analyze()`。
- 分析期间进入加载态：按钮禁用或显示「分析中…」。分析是同步瞬时完成，但 UI 仍需短暂呈现该状态以符合状态机要求（可用 `setTimeout` 或 `useTransition` 制造可感知的加载态）。

### P3 概览条
- 有结果时，顶部渲染概览条，展示三个指标：
  - 可自动化任务数（`summary.automatableCount`）
  - 平均优先级分（`summary.averageScore`）
  - 估算每周节省工时（`summary.estimatedHoursPerWeek`，单位「小时」）

### P4 任务卡片列表
- 按 `tasks` 数组顺序渲染卡片（已降序）。
- 每张卡片需包含：
  - 任务名（`title`）
  - 优先级评分（`priorityScore`）+ 可视化评分条
  - 命中维度标签与关键词（`matchedKeywords`；维度标签由 `dimensions` 三个值决定，可用「重复」「耗时」「规则」三色标签）
  - 自动化建议列表（`automationSuggestions`）
  - SOP 四段（`sop.trigger` / `sop.inputs` / `sop.steps` / `sop.output`）
  - 可复用 Prompt（`reusablePrompt`）

### P5 复制 Prompt
- 每个任务卡片的可复用 Prompt 提供「复制」按钮，一键复制 `reusablePrompt` 到剪贴板（`navigator.clipboard.writeText`）。
- 复制成功后按钮短暂显示「已复制」反馈（约 1.5 秒后恢复）。

### P6 状态处理
页面需覆盖以下完整状态：

| 状态 | 触发 | 展示 |
|------|------|------|
| 空态 | 首次进入（未输入未分析） | 引导文案 + 「填入示例」提示 |
| 加载中 | 点击「开始分析」后 | 按钮禁用 + 加载提示 |
| 有结果 | `result.tasks.length > 0` | 概览条 + 任务卡片列表 |
| 无命中 | 分析完成但 `tasks.length === 0`（如闲聊） | 「未识别到可自动化任务」提示 |
| 输入过短 | 去空白后 < 10 字就点分析 | 就地提示，**不触发分析** |

## 6. 组件清单与职责

> 可拆分/合并，但保持职责单一；`page.tsx` 是唯一状态容器，其余组件接收 props 做纯展示。

| 组件 | 职责 |
|------|------|
| `app/layout.tsx` | 根布局 + metadata（`lang="zh-CN"`，title 如「FlowLens · AI 工作流分析」） |
| `app/globals.css` | Tailwind v4 引入 + 全局字体/基础样式 |
| `app/page.tsx` | 唯一 `"use client"` 状态容器，持有 `input` / `result` / `status` 状态，编排数据流 |
| `components/WorkflowInput.tsx` | 输入区（textarea + 填入示例 + 开始分析按钮 + 过短提示） |
| `components/ResultSummary.tsx` | 概览条（三指标） |
| `components/TaskCard.tsx` | 单张任务卡片 |
| `components/ScoreBar.tsx` | 评分条（0–100 进度条 + 颜色 + 数字） |
| `components/EmptyState.tsx` | 空态 / 无命中态 |

### 建议的状态机（page.tsx）

```ts
type Status = "idle" | "loading" | "done";
// input: string
// result: AnalysisResult | null
```

- 「开始分析」：先判断去空白后长度是否 < 10，是则就地提示并返回；否则进入 `loading`，调用 `analyze(input)`，完成后置 `result` 并进入 `done`。
- 状态展示优先级：`loading` > `result`（有结果/无命中）> 空态。

## 7. 移动端与样式要求（硬性）

- **320px 宽度无横向滚动条**：所有文字 `break-words` / `whitespace-pre-wrap` 自动换行，不溢出。
- 卡片在窄屏纵向堆叠，桌面端可用多列或单列居中，最大宽度适中（如 `max-w-3xl`）。
- 按钮触达面积足够（`min-h` 建议 ≥ 44px）。
- **UI 全中文**，无英文界面文案。
- 评分条颜色建议：≥ 60 绿色 / 30–59 琥珀 / < 30 灰（或红色系），自定但需清晰。
- 不做深色模式、不做国际化、不做文件上传。

### 样式注意事项（Tailwind v4）

- `app/globals.css` 用 **v4 语法**引入 Tailwind（**不要**写 v3 的 `@tailwind base/components/utilities`）：

```css
@import "tailwindcss";
```

- 无需 `tailwind.config.js`（v4 默认扫描 `app`、`components` 等目录）。
- 全局字体可在同一文件用普通 CSS 追加。

## 8. 约定示例文本

「填入示例」按钮填充以下文本（与引擎冒烟测试一致）：

```text
每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。
```

该示例预期产生 4 个可自动化任务，按优先级降序排列。

## 9. 验收标准（PA1–PA5）

- **PA1**：首次进入为空态；点「填入示例」后输入区出现预置示例文本。
- **PA2**：输入预置示例 → 点「开始分析」→ 出现概览条和至少一张任务卡片。
- **PA3**：每张卡片完整含任务名、评分、命中标签与关键词、建议、SOP、可复用 Prompt，且按评分降序。
- **PA4**：点「复制」后剪贴板内容等于该 Prompt，且按钮短暂显示「已复制」。
- **PA5**：输入去空白后少于 10 字 → 就地提示且不分析；输入闲聊 → 显示「未识别到可自动化任务」。

## 10. 验证命令

```bash
npm run typecheck   # 类型检查（tsc --noEmit）
npm run dev         # 本地开发服务器
npm run build       # 生产构建
```
