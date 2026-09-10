/**
 * 文案模板
 *
 * 根据命中维度与关键词，生成自动化建议、SOP、可复用 Prompt 的纯函数。
 * 全部文案在本地模板化拼装，无任何外部调用，保证结果确定。
 */

import type { DimensionScores, TaskSop } from "./types";

/** 频率词 → 每周发生次数（用于估算每周节省工时） */
const FREQUENCY_MAP: Record<string, number> = {
  每天: 5,
  每日: 5,
  每周: 1,
  每星期: 1,
  每月: 0.25,
  每季度: 0.08,
  每年: 0.02,
  每当: 3,
  每次: 3,
};

/** 一个频率词都没命中时的默认频率（次/周） */
const DEFAULT_WEEKLY_FREQUENCY = 1;

/**
 * 从命中关键词推断每周发生频率。
 * 命中多个频率词时取最高频率；一个都没命中时默认 1 次/周。
 *
 * 注意：默认值只能在「无命中」时兜底，**不能拿来当比较的初值** ——
 * 否则 每月(0.25) / 每季度(0.08) / 每年(0.02) 这些低于 1 的条目
 * 永远抬不过初值 1，等于在映射表里形同虚设。
 */
export function detectWeeklyFrequency(keywords: string[]): number {
  const frequencies = keywords
    .map((kw) => FREQUENCY_MAP[kw])
    .filter((freq): freq is number => freq !== undefined);

  return frequencies.length > 0 ? Math.max(...frequencies) : DEFAULT_WEEKLY_FREQUENCY;
}

/** 根据维度得分生成 2–4 条自动化建议 */
export function buildAutomationSuggestions(
  dims: DimensionScores,
  _keywords: string[],
): string[] {
  const suggestions: string[] = [];

  if (dims.repetition >= 50) {
    suggestions.push("用定时任务或调度工具按固定周期自动触发，替代人工重复执行");
  }
  if (dims.timeCost >= 50) {
    suggestions.push("用脚本或 RPA 工具替代手工复制粘贴、汇总核对等机械操作");
  }
  if (dims.ruleClarity >= 50) {
    suggestions.push("把判断条件固化为明确规则，用规则引擎或表单分流自动处理");
  }
  suggestions.push("将流程沉淀为 SOP 与可复用 Prompt，交给 AI 助手批量执行");

  // 兜底：至少 2 条，最多 4 条
  if (suggestions.length < 2) {
    suggestions.push("梳理该任务的输入输出，评估无代码自动化平台的可行性");
  }
  return suggestions.slice(0, 4);
}

/** 根据关键词生成触发条件 */
function buildTrigger(keywords: string[]): string {
  if (keywords.includes("每当") || keywords.includes("每次")) {
    return "每当触发事件发生时（如新工单提交、新数据到达）";
  }
  if (keywords.includes("每天") || keywords.includes("每日")) {
    return "每天固定时间（如每个工作日上午）";
  }
  if (keywords.includes("每周") || keywords.includes("每星期")) {
    return "每周固定时间（如周一上午）";
  }
  if (keywords.includes("每月")) {
    return "每月固定时间（如月初第一天）";
  }
  if (keywords.some((k) => ["定期", "周期性", "例行"].includes(k))) {
    return "按固定周期（如每周期一次）";
  }
  return "按固定周期或事件触发";
}

/** 根据原始片段与关键词生成输入材料清单 */
function buildInputs(rawText: string, keywords: string[]): string[] {
  const inputs = ["原始数据或待处理材料"];
  if (keywords.some((k) => ["分类", "筛选", "判断", "是否", "异常", "退款", "换货", "退货", "格式", "范围", "条件"].includes(k))) {
    inputs.push("明确的分类标准或判定规则");
  }
  if (keywords.some((k) => ["周报", "报表", "汇总", "统计", "导出"].includes(k))) {
    inputs.push("目标输出模板（如报表 / 周报格式）");
  }
  // 从片段中截取一个可识别的实体作为输入提示
  const raw = rawText.trim();
  if (raw.length > 0) {
    inputs.push(`任务背景：${raw.slice(0, 20)}${raw.length > 20 ? "…" : ""}`);
  }
  return inputs;
}

/** 根据维度得分生成执行步骤 */
function buildSteps(dims: DimensionScores): string[] {
  const steps: string[] = [];
  steps.push("收集并准备输入材料，确认数据完整");
  if (dims.ruleClarity >= 50) {
    steps.push("按既定规则逐条筛选、分类或判定");
  }
  if (dims.timeCost >= 50) {
    steps.push("对数据进行汇总、核对或格式整理");
  }
  steps.push("生成最终输出（报表 / 清单 / 通知）");
  steps.push("复核结果并交付给对应方");
  return steps;
}

/** 根据关键词生成输出描述 */
function buildOutput(keywords: string[]): string {
  if (keywords.some((k) => ["周报", "报表", "汇总", "统计", "导出"].includes(k))) {
    return "整理后的报表 / 周报";
  }
  if (keywords.some((k) => ["通知", "提醒", "发送", "转交", "转给", "转发"].includes(k))) {
    return "已分流的工单或已发送的通知";
  }
  if (keywords.some((k) => ["核对", "比对", "异常", "审批", "报销"].includes(k))) {
    return "核对结论或异常清单";
  }
  return "整理后的处理结果";
}

/** 生成 SOP（触发 / 输入 / 步骤 / 输出 四段） */
export function buildSop(
  rawText: string,
  dims: DimensionScores,
  keywords: string[],
): TaskSop {
  return {
    trigger: buildTrigger(keywords),
    inputs: buildInputs(rawText, keywords),
    steps: buildSteps(dims),
    output: buildOutput(keywords),
  };
}

/** 生成可复用 Prompt（用户可直接复制给 AI 助手） */
export function buildPrompt(
  rawText: string,
  dims: DimensionScores,
  keywords: string[],
): string {
  const rules: string[] = [];
  if (dims.ruleClarity >= 50) {
    rules.push("按明确的 if-then 规则逐条判断，不遗漏不臆测");
  }
  if (dims.timeCost >= 50) {
    rules.push("自动完成汇总、核对、整理等机械操作，输出结构化结果");
  }
  if (dims.repetition >= 50) {
    rules.push("保持输出格式每次一致，便于批量复用");
  }
  if (rules.length === 0) {
    rules.push("按任务描述理解意图，输出清晰可执行的结果");
  }

  const ruleLines = rules.map((r) => `- ${r}`).join("\n");

  return [
    "你是我的自动化助手，请帮我完成以下重复性任务。",
    "",
    "【任务描述】",
    rawText.trim(),
    "",
    "【处理规则】",
    ruleLines,
    "",
    "【输出要求】",
    "- 直接给出处理结果，不要额外寒暄",
    "- 如信息不足以判断，明确指出缺失项",
  ].join("\n");
}
