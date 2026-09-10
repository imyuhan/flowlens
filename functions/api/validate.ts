/**
 * LLM 输出校验与规范化
 *
 * Workers AI 明确不保证模型遵守 JSON Schema，这一层是硬边界：
 * 除了校验，还要把「能用但不规范」的输出修正成合法契约。
 * 无法修复时返回 null，由调用方转为降级。
 *
 * 注意：这里刻意不引入 zod 等依赖 —— 除校验外还需要做修正
 * （clamp 分数、裁剪长度、重排、重生成 id），手写更直接。
 */

import type {
  AnalysisResult,
  AnalysisSummary,
  DimensionScores,
  TaskAnalysis,
  TaskSop,
} from "../../lib/types";

/** 单个数组字段的最大条数 */
const MAX_LIST_ITEMS = 6;
/** 单条字符串的最大长度 */
const MAX_TEXT_LENGTH = 400;
/** 任务名的最大长度 */
const MAX_TITLE_LENGTH = 40;
/** SOP 步骤的最大条数 */
const MAX_STEPS = 8;
/** 每周节省工时的上限（防止模型给出离谱数值） */
const MAX_HOURS_PER_WEEK = 200;

/** 裁剪为有限长度的字符串 */
function asText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value === "string") return value.trim().slice(0, maxLength);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** 裁剪为字符串数组：去空、去重、限条数 */
function asTextList(value: unknown, maxItems = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = asText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** 裁剪为 0-100 的整数；非数值返回 null */
function asScore(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** 规范化单个任务；标题或优先级分缺失时返回 null（丢弃该任务） */
function normalizeTask(value: unknown): TaskAnalysis | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const title = asText(raw.title, MAX_TITLE_LENGTH);
  const priorityScore = asScore(raw.priorityScore);
  if (!title || priorityScore === null) return null;

  const dims = (
    typeof raw.dimensions === "object" && raw.dimensions !== null ? raw.dimensions : {}
  ) as Record<string, unknown>;
  const dimensions: DimensionScores = {
    repetition: asScore(dims.repetition) ?? 0,
    timeCost: asScore(dims.timeCost) ?? 0,
    ruleClarity: asScore(dims.ruleClarity) ?? 0,
  };

  const sopRaw = (
    typeof raw.sop === "object" && raw.sop !== null ? raw.sop : {}
  ) as Record<string, unknown>;
  const sop: TaskSop = {
    trigger: asText(sopRaw.trigger, 160),
    inputs: asTextList(sopRaw.inputs),
    steps: asTextList(sopRaw.steps, MAX_STEPS),
    output: asText(sopRaw.output, 160),
  };

  return {
    // id 由 normalizeResult 在重排后统一生成，模型给的一律忽略
    id: "",
    title,
    rawText: asText(raw.rawText),
    priorityScore,
    dimensions,
    matchedKeywords: asTextList(raw.matchedKeywords),
    rationale: asTextList(raw.rationale),
    automationSuggestions: asTextList(raw.automationSuggestions),
    sop,
    reusablePrompt: asText(raw.reusablePrompt, 1500),
  };
}

/** 重算概览，保证与 tasks 自洽（不采信模型给的 count / 平均分） */
function buildSummary(
  rawTotalSegments: unknown,
  rawHours: unknown,
  tasks: TaskAnalysis[],
): AnalysisSummary {
  // 片段总数不能少于已产出的任务数
  const segmentCount =
    typeof rawTotalSegments === "number" &&
    Number.isFinite(rawTotalSegments) &&
    rawTotalSegments >= tasks.length
      ? Math.round(rawTotalSegments)
      : tasks.length;

  const average =
    tasks.length === 0
      ? 0
      : tasks.reduce((sum, task) => sum + task.priorityScore, 0) / tasks.length;

  const hours =
    typeof rawHours === "number" && Number.isFinite(rawHours) && rawHours > 0
      ? Math.min(MAX_HOURS_PER_WEEK, Math.round(rawHours * 10) / 10)
      : 0;

  return {
    totalSegments: segmentCount,
    automatableCount: tasks.length,
    averageScore: Math.round(average * 10) / 10,
    estimatedHoursPerWeek: hours,
  };
}

/**
 * 校验并规范化模型输出。
 *
 * @returns 可用的分析结果；顶层结构完全无法解析时返回 null（调用方据此降级）
 */
export function normalizeResult(raw: unknown): AnalysisResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const payload = raw as Record<string, unknown>;

  // 连 tasks 字段都没有，说明整体结构不可信
  if (!("tasks" in payload)) return null;

  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const tasks: TaskAnalysis[] = [];
  for (const item of rawTasks) {
    const task = normalizeTask(item);
    if (task) tasks.push(task);
  }

  // 按优先级降序，并在排序后生成稳定 id
  tasks.sort((a, b) => b.priorityScore - a.priorityScore);
  tasks.forEach((task, index) => {
    task.id = `task-${index + 1}`;
  });

  const summaryRaw = (
    typeof payload.summary === "object" && payload.summary !== null ? payload.summary : {}
  ) as Record<string, unknown>;

  return {
    summary: buildSummary(summaryRaw.totalSegments, summaryRaw.estimatedHoursPerWeek, tasks),
    tasks,
  };
}
