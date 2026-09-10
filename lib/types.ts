/**
 * FlowLens 数据契约
 *
 * 这是分析引擎与前端页面共享的唯一契约来源。
 * 引擎只负责产出这些结构，页面只负责消费，双方不感知彼此内部实现。
 */

/** 三个维度的评分，各 0–100 */
export interface DimensionScores {
  /** 重复性：任务是否高频、周期性出现 */
  repetition: number;
  /** 耗时性：任务是否机械、手工、费时 */
  timeCost: number;
  /** 规则明确度：任务的判断依据是否清晰、可写成规则 */
  ruleClarity: number;
}

/** 单个任务的 SOP（标准作业流程），分四段 */
export interface TaskSop {
  /** 触发条件：什么情况下执行该 SOP */
  trigger: string;
  /** 输入/材料：执行前需要准备什么 */
  inputs: string[];
  /** 步骤：按顺序执行的操作 */
  steps: string[];
  /** 输出：执行完成后产出的结果 */
  output: string;
}

/** 单个可自动化任务的分析结果 */
export interface TaskAnalysis {
  /** 唯一标识 */
  id: string;
  /** 任务名（从片段截取） */
  title: string;
  /** 原始片段文本 */
  rawText: string;
  /** 0–100 加权综合优先级分 */
  priorityScore: number;
  /** 三维度得分 */
  dimensions: DimensionScores;
  /** 命中的关键词（去重）；规则路径下即为该任务的判定依据 */
  matchedKeywords: string[];
  /** 判定依据：LLM 路径为语义理由；规则路径为空数组，页面回退到 matchedKeywords 标签 */
  rationale: string[];
  /** 自动化建议列表 */
  automationSuggestions: string[];
  /** 标准作业流程 */
  sop: TaskSop;
  /** 可复用 Prompt */
  reusablePrompt: string;
}

/** 概览统计 */
export interface AnalysisSummary {
  /** 识别到的任务片段总数 */
  totalSegments: number;
  /** 可自动化任务数（= tasks.length） */
  automatableCount: number;
  /** 平均优先级分 0–100，保留 1 位 */
  averageScore: number;
  /** 估算每周节省小时数，保留 1 位 */
  estimatedHoursPerWeek: number;
}

/** 分析引擎的完整返回结果 */
export interface AnalysisResult {
  summary: AnalysisSummary;
  /** 已按 priorityScore 降序排列 */
  tasks: TaskAnalysis[];
}

/** 分析结果来源：llm = 云端模型分析；rules = 本地规则引擎降级 */
export type AnalysisSource = "llm" | "rules";

/** 一次分析的完整产出：结果 + 来源标注 */
export interface AnalysisOutcome {
  result: AnalysisResult;
  source: AnalysisSource;
  /** 降级原因，仅因失败降级时存在 */
  degradedReason?: AnalyzeFailureReason;
}

/** 一条历史记录（仅存于浏览器本地，不上传服务端） */
export interface HistoryEntry {
  id: string;
  /** 创建时间，epoch 毫秒 */
  createdAt: number;
  /** 用户当时的输入原文 */
  input: string;
  /** 当时那份完整结果快照 */
  outcome: AnalysisOutcome;
}

/** 分析失败原因 */
export type AnalyzeFailureReason = "too_long" | "timeout" | "model_error" | "invalid_output";

/** POST /api/analyze 的响应体 */
export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; reason: AnalyzeFailureReason };
