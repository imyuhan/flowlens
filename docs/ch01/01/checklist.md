# FlowLens Checklist

> 每一项通过运行代码或观察行为来验证，聚焦系统行为。

## 引擎（本实现者验证，运行脚本）

- [ ] 数据契约 `lib/types.ts` 可被导入（验证：`npx tsc --noEmit` 通过）
- [ ] 三维度词典非空且能被命中（验证：smoke 输出含非空 `matchedKeywords`）
- [ ] 每个任务含自动化建议、SOP 四段、可复用 Prompt（验证：smoke 输出字段齐全非空）
- [ ] 概览统计正确（验证：smoke 输出 `totalSegments` / `automatableCount` / `averageScore` / `estimatedHoursPerWeek`）
- [ ] 过短/空白/闲聊输入返回空 `tasks` 且不抛异常（验证：smoke 三种输入）
- [ ] 任务按 `priorityScore` 降序（验证：smoke 输出顺序）

## 页面（Codex 实现后验证）

- [ ] 首次进入为空态；点「填入示例」后输入区出现预置示例文本
- [ ] 点「开始分析」→ 出现概览条 + 至少一张任务卡片
- [ ] 每张卡片含任务名、评分、命中标签与关键词、建议、SOP、可复用 Prompt，且按评分降序
- [ ] 点「复制」→ 剪贴板内容等于该 Prompt，按钮短暂显示「已复制」
- [ ] 输入过短（<10 字）→ 就地提示且不分析；输入闲聊 → 显示「未识别到可自动化任务」

## 集成

- [ ] 页面通过 `@/lib/analyzer` 的 `analyze` 调用引擎，类型与契约一致（验证：`npm run build` 通过）
- [ ] 引擎输出结构符合 `AnalysisResult` 契约（验证：smoke 打印结构与 plan.md 一致）

## 编译与测试

- [ ] `npx tsc --noEmit` 无类型错误
- [ ] `npx tsx scripts/smoke.ts` 通过
- [ ] `npm run build` 通过（Codex 页面完成后）
- [ ] `npm run dev` 能打开页面（Codex 页面完成后）

## 端到端场景

- [ ] 场景 1：空态 → 点「填入示例」→ 点「开始分析」→ 概览条 + 多张卡片、按分数降序（完整用户流程）
- [ ] 场景 2：输入闲聊「今天天气不错」→ 显示「未识别到可自动化任务」
- [ ] 场景 3：320px 宽度无横向滚动条、无文字溢出，卡片纵向堆叠

## 交付（CLAUDE.md 硬性要求）

- [ ] 英文 README 四部分齐全（项目介绍 / 本地运行 / 技术栈 / known limitations）
- [ ] 部署后提交公网可打开的 URL
- [ ] 仓库不含任何 API key
