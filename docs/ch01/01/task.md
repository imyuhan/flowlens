# FlowLens Tasks

> 本清单列出「本实现者（Claude）」的任务。前端页面由 Codex 实现，不在本清单执行（见文末说明）。

## 文件清单

| 操作 | 文件 | 职责 | 实现方 |
|------|------|------|--------|
| 新建 | `package.json` / `tsconfig.json` / `next.config.ts` / `postcss.config.mjs` | 脚手架 | 我 |
| 新建 | `lib/types.ts` | 数据契约 | 我 |
| 新建 | `lib/rules.ts` | 关键词词典 | 我 |
| 新建 | `lib/templates.ts` | 文案生成 | 我 |
| 新建 | `lib/analyzer.ts` | 主入口 `analyze()` | 我 |
| 新建 | `scripts/smoke.ts` | 冒烟测试 | 我 |
| 新建 | `docs/frontend-requirements.md` | 页面要求（交付 Codex） | 我 |
| 新建 | `README.md` | 英文 README | 我 |
| 新建 | `app/`、`components/` | 前端页面 | Codex |

## 任务

### T1: 重建脚手架

**文件:** `package.json` / `tsconfig.json` / `next.config.ts` / `postcss.config.mjs`
**依赖:** 无
**步骤:**
1. 写 `package.json`：scripts（`dev` / `build` / `start` / `smoke`）、deps（next / react / react-dom）、devDeps（typescript / @types/react / @types/node / @types/react-dom / tailwindcss / tsx）
2. 写 `tsconfig.json`（strict、`jsx: preserve`、路径别名 `@/*` → `./*`）
3. 写 `next.config.ts`（默认空配置）
4. 写 `postcss.config.mjs`（Tailwind 插件）
5. 执行 `npm install`

**验证:** `npm install` 无报错，`node_modules` 生成

### T2: 数据契约 `lib/types.ts`

**文件:** `lib/types.ts`
**依赖:** T1
**步骤:**
1. 定义 `DimensionScores`（repetition / timeCost / ruleClarity，各 0–100）
2. 定义 `TaskSop`（trigger / inputs / steps / output）
3. 定义 `TaskAnalysis`（id / title / rawText / priorityScore / dimensions / matchedKeywords / automationSuggestions / sop / reusablePrompt）
4. 定义 `AnalysisSummary`、`AnalysisResult`

**验证:** `npx tsc --noEmit` 无类型错误

### T3: 关键词词典 `lib/rules.ts`

**文件:** `lib/rules.ts`
**依赖:** T1
**步骤:**
1. 定义 `KeywordRule`（word / weight）
2. 重复性词典：频率/周期词（每天、每周、每月、定期、反复、每当……权重 1–3）
3. 耗时性词典：机械/手工操作词（手动、录入、复制、粘贴、汇总、核对……）
4. 规则明确度词典：条件/判断/规则词（如果、判断、是否、条件、分类……）

**验证:** `npx tsc --noEmit` 通过；三个词典均非空

### T4: 文案模板 `lib/templates.ts`

**文件:** `lib/templates.ts`
**依赖:** T2
**步骤:**
1. `buildAutomationSuggestions`（按维度命中生成 2–4 条建议）
2. `detectWeeklyFrequency`（频率词推断：每天=5 / 每周=1 / 每月=0.25 / 每当=3 / 默认=1）
3. `buildSop`（触发 / 输入 / 步骤 / 输出四段）
4. `buildPrompt`（可复用 Prompt 文本）

**验证:** `npx tsc --noEmit` 通过

### T5: 分析主入口 `lib/analyzer.ts`

**文件:** `lib/analyzer.ts`
**依赖:** T2 / T3 / T4
**步骤:**
1. `splitSegments`（按 。！？；!?\n 切分，忽略逗号避免切碎）
2. `matchKeywords` + `toScore`（权重和 × 20，封顶 100）
3. `analyzeSegment`（三维度分 + 加权优先级）
4. `estimateHoursPerWeek` + `buildSummary`
5. `analyze`（trim / 过短返回空 / 阈值过滤 / 降序 / 汇总）

**验证:** `npx tsc --noEmit` 通过

### T6: 冒烟测试 + 验证

**文件:** `scripts/smoke.ts`
**依赖:** T5
**步骤:**
1. 用「约定示例」调用 `analyze` 并打印
2. 用闲聊输入（「今天天气不错」）、过短输入（「abc」）验证空结果
3. 执行 `npx tsx scripts/smoke.ts`

**验证:** 输出符合 EA1–EA5（示例 ≥1 任务且降序、闲聊返回空、过短返回空、字段完整）

### T7: 前端页面要求文档（交付 Codex）

**文件:** `docs/frontend-requirements.md`
**依赖:** T2（数据契约已定）
**步骤:**
1. 整合 spec 的 P1–P6 页面需求
2. 附上 plan 的数据契约（`AnalysisResult` 等类型 + `analyze` 接口）
3. 组件清单 + 移动端要求 + 约定示例文本
4. 附验收标准 PA1–PA5

**验证:** 文档自包含，Codex 无需读 spec / plan 即可实现页面

### T8: 英文 README

**文件:** `README.md`
**依赖:** T6（引擎已可用）
**步骤:**
1. 项目介绍（是什么、解决什么问题）
2. 本地运行方式（`npm install` / `npm run dev` / `npm run build`）
3. 技术栈（Next.js + TypeScript + Tailwind）
4. known limitations（规则匹配的局限、无持久化、无 LLM 等）

**验证:** 四部分齐全，运行命令正确

## Codex 任务（另交，不在本清单执行）

前端页面（`app/` + `components/`）由 Codex 依据 `docs/frontend-requirements.md` 实现，完成后按 checklist 的 PA1–PA5 验收。

## 交付任务（需用户配合）

- 推送到 GitHub 公开仓库（保留真实 commit 历史）
- Vercel 导入仓库部署，拿到公网 URL（对应 JA2）

## 执行顺序

```
T1 → T2 → T3 → T4 → T5 → T6 → T8
                    ↘
T7（依赖 T2 契约，可与 T3–T6 并行）
```

每个任务（或每组逻辑相关任务）完成后提交一次 git commit，保证真实提交历史。
