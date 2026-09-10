# FlowLens ch02 Tasks

> 输入：已批准的 `docs/ch02/01/spec.md` 与 `docs/ch02/01/plan.md`。
> 执行前请先读这两份文档。每个任务自包含，可独立阅读。

## 文件清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `lib/types.ts` | 扩展 `rationale`，新增 `AnalysisSource` / `AnalysisOutcome` / `HistoryEntry` / `AnalyzeResponse` |
| 修改 | `lib/analyzer.ts` | 仅新增一行 `rationale: []`（适配契约，逻辑零改动） |
| 新建 | `lib/api.ts` | 浏览器端调用 `/api/analyze` + 30s 超时 + 失败归类 |
| 新建 | `lib/history.ts` | localStorage 历史读写，处理全部失败模式 |
| 新建 | `functions/api/prompt.ts` | System prompt + 输出 JSON Schema |
| 新建 | `functions/api/validate.ts` | LLM 输出校验与规范化 |
| 新建 | `functions/api/analyze.ts` | Pages Function 主入口 |
| 新建 | `functions/tsconfig.json` | Functions 独立类型环境 |
| 新建 | `components/SourceBadge.tsx` | 结果来源标注 |
| 新建 | `components/HistoryPanel.tsx` | 历史记录抽屉 |
| 修改 | `components/TaskCard.tsx` | 渲染 `rationale` |
| 修改 | `components/ResultView.tsx` | 透传 `SourceBadge` |
| 修改 | `app/layout.tsx` | 移除 header |
| 修改 | `app/page.tsx` | 接收 header + 历史入口 + 异步分析流程 |
| 修改 | `scripts/smoke.ts` | 加契约与校验器测试 |
| 修改 | `scripts/render-snapshot.tsx` | 纳入新组件快照 |
| 修改 | `package.json` | 加 `dev:full` 脚本 |
| 修改 | `README.md` | 更新 known limitations |
| 修改 | `docs/design-decisions.md` | 追加 ch02 关键实现细节 |

---

## T1: 扩展数据契约

**文件：** `lib/types.ts`、`lib/analyzer.ts`
**依赖：** 无

**步骤：**
1. 在 `lib/types.ts` 的 `TaskAnalysis` 接口中新增字段 `rationale: string[]`，注释说明「LLM 路径为语义判定依据；规则路径为空数组，页面回退到关键词标签」
2. 在 `lib/types.ts` 末尾新增 `AnalysisSource`、`AnalysisOutcome`、`HistoryEntry`、`AnalyzeResponse` 四个类型（定义见 plan.md「核心数据结构」）
3. 在 `lib/analyzer.ts` 构造 `TaskAnalysis` 的位置新增一行 `rationale: []`
4. 确认 `lib/analyzer.ts` 的其余逻辑**一行都不改**

**验证：** `npm run typecheck` 通过；`npm run smoke` 仍然通过（引擎行为未变）

---

## T2: 客户端分析接口封装

**文件：** `lib/api.ts`
**依赖：** T1

**步骤：**
1. 新建 `lib/api.ts`，导出 `requestAnalysis(text: string): Promise<AnalyzeResponse>`
2. 用 `AbortController` 实现 30 秒超时，超时后 abort 并返回 `{ ok: false, reason: "timeout" }`
3. `fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal })`
4. 响应非 2xx、响应体不是合法 JSON、结构不符合 `AnalyzeResponse` —— 全部返回 `{ ok: false, reason: "model_error" }`
5. 用 `try/catch` 包住全部逻辑，确保**永不抛出**；`clearTimeout` 放在 `finally`

**验证：** `npm run typecheck` 通过；函数签名与 `AnalyzeResponse` 一致

---

## T3: 本地历史存储

**文件：** `lib/history.ts`
**依赖：** T1

**步骤：**
1. 新建 `lib/history.ts`，key 用 `flowlens:history`
2. 实现 `isAvailable()`：写读一个探针值并捕获异常，判断 localStorage 是否可用
3. 实现 `load(): HistoryEntry[]`：解析失败或结构不符时**返回空数组并清除该 key**，不抛出
4. 实现 `save(input, outcome): HistoryEntry[]`：新条目插到最前，超过 50 条时截断尾部（淘汰最旧）
5. 实现 `remove(id)`、`clear()`
6. 所有函数用 `try/catch` 包裹，失败时返回上一次的合理值（空数组 / 不变），绝不抛出
7. 条目 id 用 `crypto.randomUUID()`，不可用时回退到时间戳 + 随机串

**验证：** 临时脚本 `npx tsx -e "..."` 喂入畸形 JSON（如 `localStorage` 桩返回 `"{{{"`），确认返回空数组而非抛出

---

## T4: Prompt 与 JSON Schema

**文件：** `functions/api/prompt.ts`
**依赖：** 无

**步骤：**
1. 导出 `SYSTEM_PROMPT`：约定全中文输出、三维度口径、`priorityScore` 为 0–100 加权分、SOP 四段齐全、`rationale` 给短语形式的判定依据（而非罗列关键词）
2. 在 prompt 中明确要求：识别「重复、耗时、规则明确」的任务；不相关的片段不输出；`summary` 各字段需自洽
3. 导出 `RESULT_SCHEMA`：与 `lib/types.ts` 的 `AnalysisResult` 结构一一对应的 JSON Schema
4. 在文件顶部注释说明：Schema 是「尽力约束」，真正保证靠 `validate.ts`

**验证：** `npm run typecheck` 通过；人工核对 Schema 字段名与 `AnalysisResult` 完全一致

---

## T5: 输出校验与规范化

**文件：** `functions/api/validate.ts`
**依赖：** T1

**步骤：**
1. 导出 `normalizeResult(raw: unknown): AnalysisResult | null`
2. 逐层校验：`summary` 与 `tasks` 存在且类型正确；任一任务缺关键字段则丢弃该任务
3. 分数处理：`priorityScore` 与三维度分 clamp 到 0–100 并取整；非数字则丢弃该任务
4. 数组处理：字符串数组去空串、去重、限长（如最多 6 项）；超长字符串截断（如 120 字）
5. **忽略 LLM 返回的 id**，按 `priorityScore` 降序重排后重新生成 `task-{n}`
6. 重算 `summary.automatableCount`（= tasks.length）与 `averageScore`，保证自洽
7. 全部任务都被丢弃（或原本为空）时返回结构合法的空结果，而非 `null`；仅当顶层结构完全无法解析时返回 `null`

**验证：** `npx tsx -e` 内联脚本喂入四类畸形输入 —— ①分数 999 ②缺 `sop` ③`tasks` 是字符串 ④`null` —— 确认前三类被修正或丢弃、第四类返回 `null`，且均不抛出

---

## T6: Pages Function 主入口

**文件：** `functions/api/analyze.ts`
**依赖：** T4、T5

**步骤：**
1. 定义 `interface Env { AI: Ai }`，导出 `onRequestPost: PagesFunction<Env>`
2. 解析请求体 JSON，取 `text`；解析失败或 `text` 非字符串 → 返回 `{ ok: false, reason: "model_error" }`
3. `text` 去空白后长度 > 2000 → 返回 `{ ok: false, reason: "too_long" }`，**在调用模型之前返回**
4. 调用 `env.AI.run(MODEL, { messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }], response_format: {...} })`
5. 从返回中取出文本并 `JSON.parse`，交给 `normalizeResult`；`null` → `{ ok: false, reason: "invalid_output" }`
6. 整个 handler 包 `try/catch`，任何异常归一为 `{ ok: false, reason: "model_error" }`
7. 统一用 `Response.json(...)` 返回
8. 模型名提为文件顶部常量 `MODEL`，并在注释中标明「待 T15 实测后定稿」

**验证：** `npm run typecheck`（需先完成 T7）；本地 `wrangler pages dev` 后 `curl` 一个超长文本，确认返回 `too_long` 且**未消耗额度**

---

## T7: Functions 类型环境与脚本

**文件：** `functions/tsconfig.json`、`package.json`
**依赖：** 无

**步骤：**
1. 安装 `@cloudflare/workers-types` 为 devDependency
2. 新建 `functions/tsconfig.json`：`types` 只含 `@cloudflare/workers-types`，**不包含 `dom`**（避免 `Request`/`Response` 等全局类型重定义冲突）
3. 在根 `tsconfig.json` 的 `exclude` 中加入 `"functions"`，避免根配置用 `dom` lib 去检查 Functions 代码
4. 更新 `typecheck` 脚本为「根检查 + functions 检查」两步：`tsc --noEmit && tsc --noEmit -p functions`
5. 在 `package.json` 加 `"dev:full": "next build && wrangler pages dev out --ai=AI"`

**验证：** `npm run typecheck` 通过，且 `functions/` 下的代码确实被检查（故意写一个类型错误，确认报错后再改回）

---

## T8: 来源标注组件

**文件：** `components/SourceBadge.tsx`
**依赖：** T1

**步骤：**
1. props 为 `{ source: AnalysisSource; degradedReason?: string }`
2. `source === "llm"` 显示「AI 分析」（teal 配色）
3. `source === "rules"` 显示「本地规则分析」（琥珀配色），并在其后附一句可读原因
4. 原因文案映射为中文短语（如「AI 暂不可用，已用本地规则完成分析」），**不得出现错误堆栈或供应商原始报错**（spec N8）
5. 移动端换行不溢出

**验证：** 用 `scripts/render-snapshot.tsx` 渲染两种来源，肉眼确认文案与配色

---

## T9: 任务卡片渲染判定依据

**文件：** `components/TaskCard.tsx`
**依赖：** T1

**步骤：**
1. 在卡片中（标签行上方或下方）新增判定依据区域
2. `rationale.length > 0` 时渲染为一行「判定依据」加若干标签
3. `rationale` 为空（规则路径）时**不渲染该区域**，保持 ch01 原样 —— 现有 `matchedKeywords` 标签行保持不变

**验证：** 用 `render-snapshot.tsx` 分别喂入带 `rationale` 与空 `rationale` 的任务，确认前者多出依据区、后者与 ch01 渲染一致

---

## T10: 历史记录抽屉

**文件：** `components/HistoryPanel.tsx`
**依赖：** T1

**步骤：**
1. props 为 `{ entries, open, onClose, onSelect, onRemove, onClear, available }`
2. 关闭状态下渲染 `null`
3. 打开时渲染遮罩 + 面板：桌面端右侧滑出（固定宽度），移动端全屏
4. 每条展示：时间（本地化格式）、输入摘要（截断）、来源标签、任务数；右侧删除按钮
5. 顶部有标题、「清空全部」按钮、关闭按钮
6. 「清空全部」需二次确认（用组件内状态切换按钮文案，不引入 `window.confirm`）
7. 空历史与 `available === false` 两种状态各有文案
8. 点条目任意处 → `onSelect(entry)`；删除按钮需 `stopPropagation`

**验证：** 用 `render-snapshot.tsx` 渲染 `open` / 空列表 / `available=false` 三种状态，确认输出稳定

---

## T11: header 迁移与页面外壳

**文件：** `app/layout.tsx`、`app/page.tsx`
**依赖：** 无

**步骤：**
1. `app/layout.tsx` 移除整个 `<header>` 及其 `LogoMark` import，只保留 `<html>` / `<body>` / metadata
2. 在 `app/page.tsx` 顶部按原样重建 header（sticky、h-14、边框、毛玻璃、LogoMark + 「FlowLens」）
3. header 右侧留出历史入口的位置（本任务先渲染占位，T13 接入真实组件）
4. 调整 `<main>` 的 `min-h-[calc(100vh-3.5rem)]`，确保 header 移入后首屏空态的垂直居中不跳变

**验证：** `npm run build` 通过；`npm run snapshot > /tmp/after.html` 与改动前的快照 diff，确认结果区渲染**逐字节未变**

---

## T12: 分析流程改异步

**文件：** `app/page.tsx`
**依赖：** T2、T8

**步骤：**
1. `runAnalysis` 改为 `async`：先做去空白 < 10 字的前端校验（保持现有就地提示）
2. 调用 `requestAnalysis(input)`；`ok === true` 时构造 `{ result, source: "llm" }`
3. `ok === false` 或请求抛出时，调用本地 `analyze(input)` 兜底，构造 `{ result, source: "rules", degradedReason }`；`too_long` 给专门文案
4. 新增 `outcome: AnalysisOutcome | null` 状态，替换原来的 `result`
5. **删除 `window.setTimeout(..., 320)` 假加载**（plan 明确要求）
6. `LoadingState` 文案改为适配真实等待（可能 10–30 秒，spec N12）
7. 结果区透传 `SourceBadge`

**验证：** 断开网络后点「开始分析」，确认页面仍出结果且显示「本地规则分析」徽标；连接正常（接口 404）时行为相同

---

## T13: 历史状态接入

**文件：** `app/page.tsx`
**依赖：** T3、T10、T11、T12

**步骤：**
1. 新增 `history: HistoryEntry[]`、`historyOpen: boolean`、`historyAvailable: boolean` 状态
2. `useEffect` 在挂载后 `history.load()`（放 `useEffect` 内避免静态导出时的访问问题）
3. 每次分析完成后调用 `history.save(input, outcome)` 并更新列表
4. header 右侧接入「历史记录 (N)」按钮，点击切换 `historyOpen`
5. `onSelect` → 还原 `outcome` 到结果区并关闭抽屉；`onRemove` / `onClear` → 调对应函数并更新列表
6. 历史不可用时按钮置灰并提示

**验证：** 分析一次 → 刷新页面 → 历史里仍有该条且可还原；删除单条后刷新确认未复现；清空后刷新确认仍为空

---

## T14: 测试脚本扩展

**文件：** `scripts/smoke.ts`、`scripts/render-snapshot.tsx`
**依赖：** T1、T5、T8、T9、T10

**步骤：**
1. 在 `scripts/smoke.ts` 中保留 ch01 全部既有断言（**不得削弱**）
2. 新增断言：规则引擎输出的每个任务含 `rationale` 字段且为数组
3. 新增 `normalizeResult` 的单测：畸形输入（分数越界、缺字段、类型错误、`null`）逐类断言
4. 新增断言：`normalizeResult` 对合法输入会重排为降序并重生成 id
5. 在 `scripts/render-snapshot.tsx` 中新增渲染区块：`SourceBadge` 两种来源、带 `rationale` 的 `TaskCard`、`HistoryPanel` 的 `open` / 空列表 / `available=false` 三态

**验证：** `npm run smoke` 全部通过且失败时能定位到具体断言；`npm run snapshot` 输出各区块齐全

---

## T15: 本地端到端联调

**文件：** 无（验证任务）
**依赖：** T1–T14

**步骤：**
1. `npm run build`
2. `npm run dev:full`（等价于 `wrangler pages dev out --ai=AI`）
3. 打开本地地址，点「填入示例」→「开始分析」
4. 观察：是否返回 LLM 结果、耗时多久、中文与 JSON 合规情况
5. **模型选型实测**：对比候选模型（Llama 3.3 70B / Llama 4 Scout / Qwen 系）的中文质量与 JSON 合规率，把 `MODEL` 常量定稿
6. 验证 JSON Mode：确认 `response_format: json_schema` 在 binding 路径下是否生效；**若不生效，退为 `json_object` + prompt 强约束**，并在 `design-decisions.md` 记录
7. 用 spec EA1 的同义改写输入（如「我天天盯着销售表，把数字抄进周报」）验证语义识别确实生效
8. 把实测结论追加到 `docs/design-decisions.md`

**验证：** LLM 路径返回结构完整、中文通顺的结果；EA1 输入能被识别（而规则路径漏判）

**注意：** 此任务需要联网与 Cloudflare 账号。若暂时无法进行，标记为「未验证」并如实报告，不得以「应该可以」替代。

---

## T16: 更新 README 的 known limitations

**文件：** `README.md`
**依赖：** T15（需要实测结论）

**步骤：**
1. 更新「How it works」：说明现在先走云端 LLM，失败时回退到本地规则引擎
2. 改写 known limitations：
   - 删除「Rule-based, not semantic」（已不成立）
   - 删除「确定性」相关表述（spec N3 已作废）
   - 新增：依赖平台免费额度，额度耗尽会降级到本地规则分析
   - 新增：历史记录仅存于浏览器本地，换设备/清缓存即丢失
   - 新增：历史保存上限 50 条
3. 补充本地开发说明：`npm run dev` 只跑前端（自动降级），`npm run dev:full` 才能测 LLM 路径
4. 补充部署说明：需在 Cloudflare dashboard 为 Pages 项目配置 Workers AI binding

**验证：** 通读 README，确认英文表述准确、无过时的「确定性」或「纯规则」说法

---

## 执行顺序

```
T1 ─┬─→ T2 ─────────────┐
    ├─→ T3 ─────────────┤
    ├─→ T5 ─→ T6        │
    ├─→ T8 ─────────────┤
    ├─→ T9              │
    └─→ T10 ────────────┤
T4 ─────────────────────┤
T7 ─────────────────────┤
T11 ────────────────────┤
                        ▼
              T12 ─→ T13 ─→ T14 ─→ T15 ─→ T16
```

- T1 是绝大多数任务的前置，**必须最先做**
- T4 / T7 / T11 无依赖，可与 T2、T3 并行
- T15 需要用户配合（Cloudflare 账号与联网），是唯一可能阻塞的任务
- T16 依赖 T15 的实测结论，必须最后做

## 需要用户参与的事项

| 事项 | 何时 |
|---|---|
| 在 Cloudflare dashboard 为 Pages 项目配置 Workers AI binding | T15 部署前 |
| 确认模型选型（T15 实测后我会给推荐） | T15 |
| 部署并确认公网 URL | T15 之后（对应 spec JA2） |
