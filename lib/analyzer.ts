/**
 * 分析引擎主入口
 *
 * 编排完整流程：切分任务片段 → 三维度关键词匹配打分 → 加权优先级 →
 * 阈值过滤 → 降序排列 → 模板化生成建议 / SOP / Prompt → 汇总统计。
 *
 * 纯函数、同步返回、对任何字符串输入都不抛异常。
 */

import type {
  AnalysisResult,
  AnalysisSummary,
  DimensionScores,
  TaskAnalysis,
} from "./types";
import {
  REPETITION_KEYWORDS,
  RULE_CLARITY_KEYWORDS,
  TIME_COST_KEYWORDS,
  type KeywordRule,
} from "./rules";
import {
  buildAutomationSuggestions,
  buildPrompt,
  buildSop,
  detectWeeklyFrequency,
} from "./templates";

/** 去空白后少于该字数视为「过短输入」，返回空结果 */
const MIN_TEXT_LENGTH = 10;

/** 可自动化阈值：priorityScore 低于此值的片段被过滤 */
const SCORE_THRESHOLD = 25;

/** 分段切分符：句号、感叹号、问号、分号、换行；逗号不切分以避免切碎 */
const SEGMENT_SPLIT_RE = /[。！？；;!?\n]+/;

/**
 * 按标点切分任务片段，去除空白与空片段。
 */
function splitSegments(text: string): string[] {
  return text
    .split(SEGMENT_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 命中一个词典中的所有关键词（子串包含判断），返回命中的词（天然去重）。
 */
function matchKeywords(text: string, rules: KeywordRule[]): string[] {
  const matched: string[] = [];
  for (const rule of rules) {
    if (text.includes(rule.word)) {
      matched.push(rule.word);
    }
  }
  return matched;
}

/**
 * 维度得分：命中关键词权重和 × 20，封顶 100。
 * 单个强词（权重 3）约 60 分，两个及以上强词封顶 100。
 */
function toScore(matched: string[], rules: KeywordRule[]): number {
  const weightMap = new Map<string, number>();
  for (const rule of rules) {
    weightMap.set(rule.word, rule.weight);
  }
  let sum = 0;
  for (const word of matched) {
    sum += weightMap.get(word) ?? 0;
  }
  return Math.min(100, sum * 20);
}

/** 去掉开头的频率词前缀，截取前若干字作为任务名 */
function buildTitle(text: string): string {
  const frequencyPrefixes = [
    "每天",
    "每日",
    "每周",
    "每星期",
    "每月",
    "每季度",
    "每年",
    "每当",
    "每次",
    "定期",
    "反复",
    "经常",
    "常常",
    "例行",
    "日常",
  ];
  let title = text;
  for (const prefix of frequencyPrefixes) {
    if (title.startsWith(prefix)) {
      title = title.slice(prefix.length);
      break;
    }
  }
  title = title.trim().replace(/^[，,。；;！!？?\s]+/, "");
  const MAX_LENGTH = 14;
  if (title.length > MAX_LENGTH) {
    title = `${title.slice(0, MAX_LENGTH)}…`;
  }
  return title || text.slice(0, MAX_LENGTH);
}

/** 单次耗时（小时）按耗时维度分档估算 */
function singleDurationHours(timeCost: number): number {
  if (timeCost >= 80) return 2;
  if (timeCost >= 50) return 1;
  if (timeCost >= 30) return 0.5;
  return 0.25;
}

/** 估算每周节省工时 = Σ(频率 × 单次耗时) */
function estimateHoursPerWeek(tasks: TaskAnalysis[]): number {
  return tasks.reduce((sum, task) => {
    const freq = detectWeeklyFrequency(task.matchedKeywords);
    return sum + freq * singleDurationHours(task.dimensions.timeCost);
  }, 0);
}

/** 保留 1 位小数 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 汇总概览统计 */
function buildSummary(totalSegments: number, tasks: TaskAnalysis[]): AnalysisSummary {
  const automatableCount = tasks.length;
  const averageScore =
    automatableCount === 0
      ? 0
      : tasks.reduce((sum, t) => sum + t.priorityScore, 0) / automatableCount;
  return {
    totalSegments,
    automatableCount,
    averageScore: round1(averageScore),
    estimatedHoursPerWeek: round1(estimateHoursPerWeek(tasks)),
  };
}

/** 分析单个片段，返回可自动化任务；未达阈值返回 null */
function analyzeSegment(text: string, index: number): TaskAnalysis | null {
  const repetitionMatched = matchKeywords(text, REPETITION_KEYWORDS);
  const timeCostMatched = matchKeywords(text, TIME_COST_KEYWORDS);
  const ruleClarityMatched = matchKeywords(text, RULE_CLARITY_KEYWORDS);

  const dimensions: DimensionScores = {
    repetition: toScore(repetitionMatched, REPETITION_KEYWORDS),
    timeCost: toScore(timeCostMatched, TIME_COST_KEYWORDS),
    ruleClarity: toScore(ruleClarityMatched, RULE_CLARITY_KEYWORDS),
  };

  // 优先级：耗时性权重最高（机械操作是自动化最大收益），其次重复性，最后规则明确度
  const priorityScore = Math.round(
    dimensions.repetition * 0.35 +
      dimensions.timeCost * 0.4 +
      dimensions.ruleClarity * 0.25,
  );

  if (priorityScore < SCORE_THRESHOLD) {
    return null;
  }

  const matchedKeywords = Array.from(
    new Set([...repetitionMatched, ...timeCostMatched, ...ruleClarityMatched]),
  );

  return {
    id: `task-${index + 1}`,
    title: buildTitle(text),
    rawText: text,
    priorityScore,
    dimensions,
    matchedKeywords,
    // 规则路径不产出语义判定依据，页面回退到 matchedKeywords 标签
    rationale: [],
    automationSuggestions: buildAutomationSuggestions(dimensions, matchedKeywords),
    sop: buildSop(text, dimensions, matchedKeywords),
    reusablePrompt: buildPrompt(text, dimensions, matchedKeywords),
  };
}

/** 空结果 */
function emptyResult(): AnalysisResult {
  return {
    summary: {
      totalSegments: 0,
      automatableCount: 0,
      averageScore: 0,
      estimatedHoursPerWeek: 0,
    },
    tasks: [],
  };
}

/**
 * 分析引擎唯一对外入口。
 *
 * @param text 一段日常工作描述
 * @returns 分析结果；空白/过短输入返回空结果，任何输入不抛异常
 */
export function analyze(text: string): AnalysisResult {
  const trimmed = text.trim();

  // 空白或过短输入：返回空结果
  if (trimmed.length < MIN_TEXT_LENGTH) {
    return emptyResult();
  }

  const segments = splitSegments(trimmed);

  const tasks: TaskAnalysis[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    // 跳过过短片段（标点切分后可能残留 1 个字的碎片）
    if (segment.length < 2) {
      continue;
    }
    const task = analyzeSegment(segment, i);
    if (task) {
      tasks.push(task);
    }
  }

  // 按优先级评分降序排列
  tasks.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    summary: buildSummary(segments.length, tasks),
    tasks,
  };
}
