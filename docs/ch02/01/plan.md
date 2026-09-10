# FlowLens ch02 Plan

> 输入：已批准的 `docs/ch02/01/spec.md`。本文档定义如何满足 spec 的 F1–F11 与 N1–N12。

## 架构概览

三层，规则引擎作为兜底层放在**客户端**：

```
浏览器（Next.js 静态导出）
  ├─ app/page.tsx        状态容器
  ├─ lib/api.ts          调用 /api/analyze + 超时 + 失败归类
  ├─ lib/history.ts      localStorage 历史读写
  ├─ lib/analyzer.ts  ★  规则引擎（兜底层，ch01 原样不动）
  └─ components/*        UI
          │
          │  POST /api/analyze  { text }
          ▼
Cloudflare Pages Function（functions/api/analyze.ts）
  ├─ 输入长度校验（>2000 字直接拒绝，不消耗额度）
  ├─ 构造 prompt
  ├─ fetch {OPENAI_BASE_URL}/chat/completions
  └─ 运行时校验 + 规范化模型输出
          │
          ▼
阿里云百炼（OpenAI 兼容协议，默认 qwen-plus-2025-07-28）
```

### 关键决策：规则兜底放在客户端，不放服务端

| | 服务端兜底 | **客户端兜底（本方案）** |
|---|---|---|
| 代码成本 | 要把 `lib/` 打包进 Function | 零 —— `analyzer.ts` 本就在前端 bundle 内（静态导出含全部 JS） |
| 服务端不可达时（未部署 / 本地没起 wrangler / 网络断） | ❌ 完全失效 | ✅ 仍然兜得住 |
| 本地 `npm run dev` | 需另起 wrangler 才有结果 | ✅ 接口 404 → 自动降级 → 开发体验与 ch01 一致 |
| 服务端复杂度 | 调模型 + 兜底两套逻辑 | 只做「调模型 + 校验」 |

核心判断：**兜底层不该和它要保护的东西放在同一层**。服务端一挂，服务端兜底也跟着挂；客户端兜底在任何情况下都活着。同时 `lib/` 内部全部使用相对路径导入（`./types`、`./rules`、`./templates`），未使用 `@/` 别名，因此它既能被 wrangler 打包、也能留在客户端 —— 本方案选择后者。

## 核心数据结构

`AnalysisResult` **增量扩展、不破坏现有字段**；`source` 不进契约，避免污染 ch01 的数据结构。

```ts
// lib/types.ts

// ── TaskAnalysis 新增一个字段 ──
/** 判定依据：LLM 路径为语义理由；规则路径为空数组（页面回退到关键词标签） */
rationale: string[];

// ── 以下为新增类型，不改动现有结构 ──

/** 结果来源 */
export type AnalysisSource = "llm" | "rules";

/** 一次分析的完整产出：结果 + 来源标注 */
export interface AnalysisOutcome {
  result: AnalysisResult;
  source: AnalysisSource;
  /** 降级原因，仅因失败降级时存在 */
  degradedReason?: string;
}

/** 一条历史记录 */
export interface HistoryEntry {
  id: string;
  createdAt: number;        // epoch ms
  input: string;
  outcome: AnalysisOutcome;
}

/** POST /api/analyze 响应体 */
export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; reason: "too_long" | "timeout" | "model_error" | "invalid_output" };
```

**为什么 `rationale` 用数组而非字符串**：它和 `matchedKeywords` 一样按标签渲染，视觉上与 ch01 一致，用户不会觉得页面结构变了 —— 但标签内容从 `#每天` 变成 `#每日重复的机械操作`，语义质量的提升直接可见（spec EA1）。

## 模块设计

### functions/api/analyze.ts

**职责：** 接收文本 → 长度校验 → 调 Workers AI → 校验输出 → 返回结构化响应
**对外接口：** `POST /api/analyze`，请求体 `{ text: string }`，响应 `AnalyzeResponse`
**依赖：** `./prompt`、`./validate`、环境变量（`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`）

- 导出 `onRequestPost: PagesFunction<Env>`，`Env` 含 `AI: Ai`
- 非 POST 方法由 Pages 自动 405
- 文本超过 2000 字：返回 `{ ok: false, reason: "too_long" }`，**在调用模型之前返回**
- 调用模型期间任何异常（含 JSON Mode 无法满足）都归一为 `model_error`
- Function 自身永不抛未捕获异常 —— 任何路径都返回合法 JSON 响应

### functions/api/prompt.ts

**职责：** 定义 System prompt（内嵌输出结构说明）
**对外接口：** `SYSTEM_PROMPT: string`
**依赖：** 无

所选服务只支持 `json_object`（**不支持 `json_schema`**），模型看不到 schema，因此**完整的结构说明必须以文本形式写进 prompt**。另有两条该接口的硬性约束：prompt 中必须出现「JSON」字样，否则接口直接报错；思考模式下不支持结构化输出。

prompt 须明确约定：全中文输出；三维度各自的口径（重复性 / 耗时性 / 规则明确度）；`priorityScore` 为 0–100 且由三维度加权而来；SOP 四段（触发 / 输入 / 步骤 / 输出）齐全；`rationale` 给出短语形式的判定依据而非罗列关键词。Schema 与 `lib/types.ts` 的 `AnalysisResult` 结构一一对应。

### functions/api/validate.ts

**职责：** 校验 LLM 输出是否符合契约，并做规范化修正 —— 模型不保证遵守 Schema，这一层是硬边界
**对外接口：** `normalizeResult(raw: unknown): AnalysisResult | null`，无法修复时返回 `null`
**依赖：** 无（不引入 zod，手写校验）

修正项：
- 分数 `clamp` 到 0–100 并取整；非数字则丢弃该任务
- 字符串数组去掉空串、去重
- 超长字符串截断（防止模型啰嗦导致卡片撑爆）
- 缺失的可选字段补默认值（空数组 / 空字符串）
- **忽略 LLM 给的 id，按降序重排后重新生成** —— 模型给的 id 不可信且可能重复
- `summary` 中与实际任务数矛盾的字段（如 `automatableCount`）以实际计算结果为准

### lib/api.ts

**职责：** 浏览器端调用分析接口；超时控制；把各类失败归类为可读原因
**对外接口：** `requestAnalysis(text: string): Promise<AnalyzeResponse>`
**依赖：** `./types`（类型）

- `AbortController` + 30 秒超时（spec N2），超时归类为 `timeout`
- 网络错误、非 2xx、响应体不是合法 JSON、响应结构不符 —— 全部归类为 `model_error`
- **永不抛出**，任何情况下都返回 `AnalyzeResponse`

### lib/history.ts

**职责：** localStorage 历史读写，处理全部失败模式
**对外接口：**

```ts
isAvailable(): boolean
load(): HistoryEntry[]              // 时间倒序
save(input: string, outcome: AnalysisOutcome): HistoryEntry[]
remove(id: string): HistoryEntry[]
clear(): void
```

**依赖：** `./types`（类型）

- 所有操作包 try/catch：隐私模式禁用存储、配额写满、已存数据损坏都不得抛出（spec N11）
- 数据损坏（JSON 解析失败或结构不符）时丢弃并重建，而非反复失败
- 超过 50 条淘汰最旧（spec F11）
- 单 key 存储，key 名形如 `flowlens:history`

### components/HistoryPanel.tsx

**职责：** 历史列表（时间倒序）+ 单条删除 + 清空全部
**对外接口：** props `{ entries, open, onClose, onSelect, onRemove, onClear }`
**依赖：** `lib/types`（类型）

- 抽屉形态：桌面端右侧滑出，移动端全屏 —— 320px 下不得溢出
- 空历史、历史不可用（N11）两种状态各有文案
- 条目展示：时间、输入摘要、来源标注、任务数
- 清空全部需二次确认

### components/SourceBadge.tsx

**职责：** 结果来源徽标 —— 「AI 分析」/「本地规则分析」
**对外接口：** props `{ source, degradedReason? }`
**依赖：** `lib/types`（类型）

降级时说明原因（AI 暂不可用 / 额度已用尽 / 返回内容异常 / 等待超时），满足 spec N8「不得暴露错误堆栈或供应商原始报错」—— 只给用户可理解的中文原因。

### app/page.tsx（改造）

**职责：** 唯一状态容器，编排分析流程与历史记录
**依赖：** 全部上述模块

改动点：
- `runAnalysis` 由同步改为异步：先 `requestAnalysis`，失败或降级则调用本地 `analyze(text)`
- 新增 `outcome: AnalysisOutcome | null`、`history: HistoryEntry[]`、`historyOpen: boolean` 状态
- 挂载时加载历史（`useEffect`，注意 SSR / 静态导出下的副作用时机）
- 分派 `sourceBadge` 给 `ResultView`
- **删除 ch01 的 `window.setTimeout(..., 320)` 假加载** —— 真异步后假加载会叠加延迟

### app/layout.tsx（改造）

**职责：** 移除 `<header>`，只保留 `<html>` / `<body>` / metadata
**依赖：** 无

**选择：把 header 整体从 `layout.tsx` 移入 `page.tsx`。** header 里的历史入口需要交互，而历史状态天然属于 `page.tsx`；放进同一组件即可直接共享状态，零额外抽象（无需 Context、无需状态提升）。项目为单页应用，header 放进 layout 并无实际收益。

注：`page.tsx` 的 `<main>` 上已有 `min-h-[calc(100vh-3.5rem)]`（对应 header 的 3.5rem），header 移入后需一并调整该处高度计算。

## 模块交互

### 主路径（LLM 成功）

```
点「开始分析」
  → 前端长度校验（去空白 < 10 字 → 就地提示，不发请求）
  → requestAnalysis(text)
      → POST /api/analyze
          → 长度校验（> 2000 字 → too_long，不调模型）
          → env.AI.run(model, { messages, response_format })
          → normalizeResult(raw)
      ← { ok: true, result }  或  { ok: false, reason }
  → ok：    outcome = { result, source: "llm" }
  → 失败：  analyze(text) → outcome = { result, source: "rules", degradedReason }
  → history.save(input, outcome)
  → 渲染结果 + 来源徽标
```

### 历史路径

```
挂载 → history.load() → 渲染历史入口角标
点历史条目 → 还原 outcome 到结果区 → 关闭抽屉
删除单条 → history.remove(id) → 更新列表
清空全部 → 二次确认 → history.clear() → 更新列表
```

## 文件组织

```
FlowLens/
├── functions/api/               【新】Pages Function（不参与 Next 构建）
│   ├── analyze.ts               — 主入口 onRequestPost
│   ├── prompt.ts                — System prompt + JSON Schema
│   ├── validate.ts              — 输出校验与规范化
│   └── tsconfig.json            — 独立类型环境（workers-types）
├── lib/
│   ├── types.ts                 【改】扩展 rationale + 新增 3 个类型
│   ├── api.ts                   【新】客户端调用 + 超时
│   ├── history.ts               【新】localStorage 读写
│   ├── analyzer.ts              【不动】规则引擎兜底
│   ├── rules.ts                 【不动】
│   └── templates.ts             【不动】
├── components/
│   ├── HistoryPanel.tsx         【新】历史抽屉
│   ├── SourceBadge.tsx          【新】来源标注
│   ├── ResultView.tsx           【改】透传 SourceBadge
│   └── TaskCard.tsx             【改】渲染 rationale
├── app/
│   ├── layout.tsx               【改】移除 header，只留 html/body/metadata
│   └── page.tsx                 【改】接收 header + 历史入口，异步流程 + 历史状态
├── scripts/
│   ├── smoke.ts                 【改】加契约 / 校验器测试
│   └── render-snapshot.tsx      【改】纳入新组件快照
└── docs/ch02/01/                【新】本目录四份文档
```

## 技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 规则兜底位置 | 客户端 | analyzer 本就在 bundle 内；服务端不可达时也能兜住 |
| 服务端职责 | 只调 LLM + 校验 | 代码最简，不打包规则引擎 |
| 结构化输出 | `response_format: { type: "json_object" }` | 阿里云百炼的 OpenAI 兼容模式**不支持 `json_schema`** 严格模式，只支持 `json_object`（保证 JSON 语法合法、**不保证结构**）。结构约束因此由 prompt 描述 + `normalizeResult` 运行时校验共同保证 |
| 输出校验 | 手写校验 + 规范化 | 除校验还需修正（clamp 分数、裁剪数组、重排、重生成 id）；避免引入 zod 依赖 |
| 超时 | 客户端 30s + 服务端上游 25s | 服务端超时必须**小于**客户端，否则客户端先触发降级、`timeout` 原因会失真 |
| 历史存储 | localStorage 单 key JSON 数组 | 无后端；50 条上限下体积可忽略 |
| 来源标注 | 包进 `AnalysisOutcome` | 不污染 ch01 契约 |
| 加载态 | **删除** ch01 的 `setTimeout(320)` | 真异步后假加载会叠加延迟 |
| 输入上限 | 前后端各校验一次 | 前端省无谓请求，后端防绕过 |
| 模型选型 | `qwen-plus-2025-07-28` | 由使用方指定；可用 `OPENAI_MODEL` 环境变量覆盖，换模型无需改代码 |
| 服务商切换 | 全部走环境变量 | `OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_API_KEY` 三项即可切到任何 OpenAI 兼容服务 |
| Functions 类型 | 独立 `functions/tsconfig.json` | workers-types 与根 tsconfig 的 `dom` lib 存在类型冲突（`Request`/`Response` 等全局类型重定义） |

## spec 覆盖自检

| spec 需求 | 归属模块 |
|---|---|
| F1 LLM 完成分析 | `functions/api/analyze.ts` + `prompt.ts` |
| F2 契约一致 | `validate.ts` + `lib/types.ts` |
| F3 判定理由 | `rationale` 字段 + `TaskCard.tsx` |
| F4 降序 | `validate.ts` 重排 |
| F5 自动降级 | 客户端兜底（`page.tsx` + `analyzer.ts`） |
| F6 长度上限 | `analyze.ts` 前置校验 + `page.tsx` 前端校验 |
| F7 调用仅在服务端 | 架构保证：客户端只 fetch 同源接口 |
| F8 自动保存 | `history.save` 在分析完成后调用 |
| F9 查看 / 还原 | `HistoryPanel.tsx` + `page.tsx` |
| F10 删除 / 清空 | `history.remove` / `history.clear` |
| F11 50 条上限 | `history.save` 淘汰逻辑 + 面板提示 |
| N2 30s 超时 | `lib/api.ts` AbortController |
| N4 输入上限 | 前后端双校验 |
| N8 优雅降级 | `SourceBadge` 中文原因，不暴露堆栈 |
| N11 存储失败不崩 | `history.ts` 全 try/catch + 面板「不可用」态 |
| N12 等待有反馈 | `LoadingState` 复用（改动期文案） |
