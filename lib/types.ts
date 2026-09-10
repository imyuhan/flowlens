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
  /** 命中的关键词（去重） */
  matchedKeywords: string[];
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
