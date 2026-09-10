/**
 * 关键词词典
 *
 * 三个维度的关键词，每个词带权重（1=弱、2=中、3=强）。
 * 匹配方式为「子串包含」：片段文本包含该词即命中一次。
 * 这是纯规则匹配，不依赖任何外部模型，保证结果确定且即时。
 */

/** 关键词权重：1=弱信号，2=中信号，3=强信号 */
export type KeywordWeight = 1 | 2 | 3;

/** 单个关键词规则 */
export interface KeywordRule {
  /** 关键词（片段文本 contains 判断） */
  word: string;
  /** 权重 */
  weight: KeywordWeight;
}

/** 重复性词典：频率 / 周期词，命中说明任务高频、周期性出现 */
export const REPETITION_KEYWORDS: KeywordRule[] = [
  { word: "每天", weight: 3 },
  { word: "每日", weight: 3 },
  { word: "每周", weight: 3 },
  { word: "每星期", weight: 3 },
  { word: "每月", weight: 3 },
  { word: "每季度", weight: 3 },
  { word: "每年", weight: 3 },
  { word: "定期", weight: 3 },
  { word: "周期性", weight: 3 },
  { word: "反复", weight: 2 },
  { word: "每当", weight: 2 },
  { word: "每次", weight: 2 },
  { word: "经常", weight: 2 },
  { word: "常常", weight: 2 },
  { word: "例行", weight: 2 },
  { word: "日常", weight: 2 },
];

/** 耗时性词典：机械 / 手工操作词，命中说明任务费时、可被工具替代 */
export const TIME_COST_KEYWORDS: KeywordRule[] = [
  { word: "手动", weight: 3 },
  { word: "手工", weight: 3 },
  { word: "录入", weight: 3 },
  { word: "汇总", weight: 3 },
  { word: "核对", weight: 3 },
  { word: "填表", weight: 3 },
  { word: "复制", weight: 2 },
  { word: "粘贴", weight: 2 },
  { word: "整理", weight: 2 },
  { word: "导出", weight: 2 },
  { word: "导入", weight: 2 },
  { word: "填写", weight: 2 },
  { word: "登记", weight: 2 },
  { word: "统计", weight: 2 },
  { word: "计算", weight: 2 },
  { word: "比对", weight: 2 },
  { word: "转交", weight: 2 },
  { word: "转给", weight: 2 },
  { word: "转发", weight: 2 },
  { word: "通知", weight: 2 },
  { word: "提醒", weight: 2 },
  { word: "生成", weight: 2 },
  { word: "发送", weight: 2 },
  { word: "回复", weight: 2 },
  { word: "审批", weight: 2 },
  { word: "报销", weight: 2 },
  { word: "归档", weight: 2 },
  { word: "备份", weight: 2 },
];

/** 规则明确度词典：条件 / 判断 / 规则词，命中说明任务可写成明确的 if-then 规则 */
export const RULE_CLARITY_KEYWORDS: KeywordRule[] = [
  { word: "如果", weight: 3 },
  { word: "判断", weight: 3 },
  { word: "是否", weight: 3 },
  { word: "条件", weight: 3 },
  { word: "分类", weight: 3 },
  { word: "规则", weight: 3 },
  { word: "否则", weight: 3 },
  { word: "退款", weight: 3 },
  { word: "换货", weight: 3 },
  { word: "退货", weight: 3 },
  { word: "异常", weight: 3 },
  { word: "筛选", weight: 2 },
  { word: "超过", weight: 2 },
  { word: "低于", weight: 2 },
  { word: "高于", weight: 2 },
  { word: "大于", weight: 2 },
  { word: "小于", weight: 2 },
  { word: "等于", weight: 2 },
  { word: "满足", weight: 2 },
  { word: "符合", weight: 2 },
  { word: "根据", weight: 2 },
  { word: "依据", weight: 2 },
  { word: "格式", weight: 2 },
  { word: "范围", weight: 2 },
];
