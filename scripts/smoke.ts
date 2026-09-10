/**
 * 冒烟测试
 *
 * 直接运行：npm run smoke
 * 覆盖五层：
 *   [1]-[3] 规则引擎（ch01 既有断言，不得削弱）
 *   [4]     服务端输出校验与规范化
 *   [5]     客户端降级决策
 *   [6]     本地历史存储（含异常路径）
 *   [7]     引擎缺陷回归（docs/design-decisions.md §12.5）
 * 任一断言失败则退出码非 0。
 */

import { analyze } from "../lib/analyzer";
import { resolveOutcome } from "../lib/api";
import * as history from "../lib/history";
import { detectWeeklyFrequency } from "../lib/templates";
import { normalizeResult } from "../functions/api/validate";
import type { AnalysisResult, AnalyzeFailureReason, TaskAnalysis } from "../lib/types";

/** 约定示例（与前端「填入示例」、plan.md 保持一致） */
const SAMPLE_TEXT =
  "每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。";

let failures = 0;

/** 轻量断言：失败计数 + 打印，不中断后续验证 */
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertTasksValid(tasks: TaskAnalysis[], labelPrefix: string) {
  tasks.forEach((t, i) => {
    const p = `${labelPrefix}[${i}]「${t.title}」`;
    check(`${p} 优先级在 0–100`, t.priorityScore >= 0 && t.priorityScore <= 100, `got ${t.priorityScore}`);
    check(`${p} 含自动化建议`, t.automationSuggestions.length >= 2 && t.automationSuggestions.length <= 4);
    check(`${p} SOP 四段齐全`, !!t.sop.trigger && t.sop.inputs.length > 0 && t.sop.steps.length > 0 && !!t.sop.output);
    check(`${p} 含可复用 Prompt`, t.reusablePrompt.length > 0);
    check(`${p} 命中关键词非空`, t.matchedKeywords.length > 0);
    // 契约扩展：规则路径不产出语义判定依据，故为空数组
    check(`${p} rationale 为数组且规则路径下为空`, Array.isArray(t.rationale) && t.rationale.length === 0);
  });
}

/** 装一个可控的 localStorage 桩，用于验证历史存储的异常路径 */
function installFakeStorage() {
  const map = new Map<string, string>();
  const stub = {
    failMode: "none" as "none" | "corrupt" | "throw",
    getItem(key: string) {
      if (stub.failMode === "corrupt") return "{{{ 不是合法 JSON";
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (stub.failMode === "throw") throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: stub };
  return stub;
}

function main() {
  console.log("=== FlowLens 冒烟测试 ===\n");

  // EA1/EA2/EA3/EA5 —— 约定示例
  console.log("[1] 约定示例分析");
  const result = analyze(SAMPLE_TEXT);

  check("至少命中 1 个可自动化任务", result.tasks.length >= 1, `got ${result.tasks.length}`);
  check("任务片段总数 = 4", result.summary.totalSegments === 4, `got ${result.summary.totalSegments}`);
  check(
    "可自动化任务数 = tasks.length",
    result.summary.automatableCount === result.tasks.length,
  );
  check(
    "平均分在 0–100",
    result.summary.averageScore >= 0 && result.summary.averageScore <= 100,
    `got ${result.summary.averageScore}`,
  );
  check(
    "估算每周节省工时 >= 0",
    result.summary.estimatedHoursPerWeek >= 0,
    `got ${result.summary.estimatedHoursPerWeek}`,
  );

  assertTasksValid(result.tasks, "task");

  // EA5 —— 降序
  const sorted = result.tasks.every(
    (t, i) => i === 0 || result.tasks[i - 1].priorityScore >= t.priorityScore,
  );
  check("任务按优先级评分降序", sorted);

  console.log("\n[2] 结果概览");
  console.log(`  totalSegments        = ${result.summary.totalSegments}`);
  console.log(`  automatableCount     = ${result.summary.automatableCount}`);
  console.log(`  averageScore         = ${result.summary.averageScore}`);
  console.log(`  estimatedHoursPerWeek= ${result.summary.estimatedHoursPerWeek}`);
  result.tasks.forEach((t, i) => {
    console.log(
      `  #${i + 1} [${t.priorityScore}分] ${t.title}  | 命中: ${t.matchedKeywords.join(", ")}`,
    );
  });

  // EA4 —— 边界输入
  console.log("\n[3] 边界输入");
  const blank = analyze("   ");
  check("空白输入返回空 tasks", blank.tasks.length === 0 && blank.summary.totalSegments === 0);

  const short = analyze("abc");
  check("过短输入返回空 tasks", short.tasks.length === 0);

  const chitchat = analyze("今天天气不错，阳光明媚，适合出去散散步晒晒太阳");
  check(
    "闲聊输入（>=10 字）返回空 tasks",
    chitchat.tasks.length === 0,
    `got ${chitchat.tasks.length}`,
  );
  check("闲聊输入不抛异常且返回有效结构", chitchat.summary.totalSegments >= 0);

  // ── [4] 服务端输出校验与规范化 ──
  // 模型不保证遵守 JSON Schema，这层是硬边界，必须逐类验证
  console.log("\n[4] 输出校验与规范化（服务端）");

  const clampCase = normalizeResult({
    tasks: [
      {
        title: "越界分数",
        priorityScore: 999,
        dimensions: { repetition: 200, timeCost: -5, ruleClarity: 50.6 },
      },
    ],
  });
  check(
    "分数越界被 clamp 为 0-100 整数",
    clampCase?.tasks[0].priorityScore === 100 &&
      clampCase.tasks[0].dimensions.repetition === 100 &&
      clampCase.tasks[0].dimensions.timeCost === 0 &&
      clampCase.tasks[0].dimensions.ruleClarity === 51,
  );

  const missingSop = normalizeResult({ tasks: [{ title: "缺 SOP", priorityScore: 60 }] });
  check(
    "缺 sop 时补默认结构而非丢弃任务",
    missingSop?.tasks.length === 1 && missingSop.tasks[0].sop.steps.length === 0,
  );

  const notArray = normalizeResult({ tasks: "abc" });
  check(
    "tasks 非数组时返回结构合法的空结果",
    notArray !== null && notArray.tasks.length === 0 && notArray.summary.automatableCount === 0,
  );

  check("null 输入返回 null", normalizeResult(null) === null);
  check("缺 tasks 字段返回 null", normalizeResult({ summary: {} }) === null);

  const unordered = normalizeResult({
    summary: { totalSegments: 2, automatableCount: 99, averageScore: 0 },
    tasks: [
      { title: "低分任务", priorityScore: 30 },
      { title: "高分任务", priorityScore: 90 },
    ],
  });
  check("重排为优先级降序", unordered?.tasks[0].title === "高分任务");
  check(
    "id 按排序后重新生成",
    unordered?.tasks[0].id === "task-1" && unordered.tasks[1].id === "task-2",
  );
  check("automatableCount 以实际任务数为准（忽略模型的 99）", unordered?.summary.automatableCount === 2);
  check("averageScore 重算为 60", unordered?.summary.averageScore === 60);
  check("标题为空的任务被丢弃", normalizeResult({ tasks: [{ title: "", priorityScore: 60 }] })?.tasks.length === 0);
  check(
    "优先级分非数值的任务被丢弃",
    normalizeResult({ tasks: [{ title: "x", priorityScore: "不是数字" }] })?.tasks.length === 0,
  );

  // ── [5] 客户端降级决策 ──
  console.log("\n[5] 降级决策（客户端）");

  const fakeResult: AnalysisResult = {
    summary: { totalSegments: 1, automatableCount: 1, averageScore: 60, estimatedHoursPerWeek: 2 },
    tasks: [],
  };

  const succeeded = resolveOutcome(SAMPLE_TEXT, { ok: true, result: fakeResult }, analyze);
  check("接口成功 → 来源为 llm 且无降级原因", succeeded.source === "llm" && succeeded.degradedReason === undefined);
  check(
    "接口成功 → 直接采用服务端结果，不跑本地引擎",
    JSON.stringify(succeeded.result) === JSON.stringify(fakeResult),
  );

  const reasons: AnalyzeFailureReason[] = ["too_long", "timeout", "model_error", "invalid_output"];
  reasons.forEach((reason) => {
    const degraded = resolveOutcome(SAMPLE_TEXT, { ok: false, reason }, analyze);
    check(
      `接口失败(${reason}) → 降级为本地规则且结果与引擎一致`,
      degraded.source === "rules" &&
        degraded.degradedReason === reason &&
        JSON.stringify(degraded.result) === JSON.stringify(analyze(SAMPLE_TEXT)),
    );
  });

  // ── [6] 本地历史存储 ──
  console.log("\n[6] 本地历史记录");

  const storage = installFakeStorage();
  const entry = { result: fakeResult, source: "llm" as const };

  check("存储可用时 isAvailable 为 true", history.isAvailable() === true);
  check("初始为空", history.load().length === 0);

  const afterSave = history.save("测试输入", entry);
  check("保存一条后长度为 1", afterSave.length === 1);
  check("重新读取保留该条", history.load().length === 1);
  check("删除单条后为空", history.remove(afterSave[0].id).length === 0);

  for (let i = 0; i < 60; i++) history.save(`输入 ${i}`, entry);
  const capped = history.load();
  check(
    `超过 ${history.HISTORY_LIMIT} 条时淘汰最旧、保留最新`,
    capped.length === history.HISTORY_LIMIT && capped[0].input === "输入 59",
    `got ${capped.length} 条，首条「${capped[0]?.input}」`,
  );

  history.clear();
  check("清空后为空", history.load().length === 0);

  storage.failMode = "corrupt";
  check("数据损坏时返回空数组而非抛出", history.load().length === 0);

  storage.failMode = "throw";
  let threw = false;
  try {
    history.save("配额写满", entry);
  } catch {
    threw = true;
  }
  check("写入失败（配额满）时不向外抛出", threw === false);

  // ── [7] 引擎缺陷回归 ──
  // 对应 docs/design-decisions.md §12.5 记录的引擎缺陷，逐条固化为断言防回归
  console.log("\n[7] 引擎回归：§12.5 缺陷");

  // 缺陷 1 & 2：「嗯」这类 1 字碎片会被跳过，但旧实现用过滤前的下标生成 id、
  // 且把它算进了 totalSegments，导致卡片印出 TASK 02、片段总数虚高
  const withFragment = analyze("嗯。每天手动整理销售数据并汇总。");
  check(
    "跳过 1 字碎片后，任务 id 仍从 task-1 起连续编号",
    withFragment.tasks.length === 1 && withFragment.tasks[0].id === "task-1",
    `got ${withFragment.tasks.map((t) => t.id).join(", ") || "（无任务）"}`,
  );
  check(
    "totalSegments 只计可分析片段（不含 1 字碎片）",
    withFragment.summary.totalSegments === 1,
    `got ${withFragment.summary.totalSegments}`,
  );

  // 缺陷 3：频率映射中低于 1 次/周的词，曾被「默认 1 次/周」的初值吞掉而永不生效
  check(
    "命中「每月」→ 0.25 次/周",
    detectWeeklyFrequency(["每月"]) === 0.25,
    `got ${detectWeeklyFrequency(["每月"])}`,
  );
  check(
    "命中「每季度」→ 0.08 次/周",
    detectWeeklyFrequency(["每季度"]) === 0.08,
    `got ${detectWeeklyFrequency(["每季度"])}`,
  );
  check(
    "命中「每年」→ 0.02 次/周",
    detectWeeklyFrequency(["每年"]) === 0.02,
    `got ${detectWeeklyFrequency(["每年"])}`,
  );
  check(
    "无频率词命中时仍默认 1 次/周",
    detectWeeklyFrequency(["手动", "核对"]) === 1,
    `got ${detectWeeklyFrequency(["手动", "核对"])}`,
  );
  check(
    "命中多个频率词时取最高",
    detectWeeklyFrequency(["每月", "每天"]) === 5,
    `got ${detectWeeklyFrequency(["每月", "每天"])}`,
  );

  // 缺陷 4：每周节省工时曾假设 100% 消除，现按 AUTOMATION_COVERAGE 折算
  const dailyHeavy = analyze("每天手动核对并汇总销售数据");
  check(
    "「每天 × 2 小时」按 0.5 覆盖率折算为 5 小时/周",
    dailyHeavy.summary.estimatedHoursPerWeek === 5,
    `got ${dailyHeavy.summary.estimatedHoursPerWeek}`,
  );
  check(
    "约定示例的每周节省工时 = 6.8（含「每月」任务的 0.25 次/周）",
    result.summary.estimatedHoursPerWeek === 6.8,
    `got ${result.summary.estimatedHoursPerWeek}`,
  );

  console.log("\n=== 结果 ===");
  if (failures === 0) {
    console.log("全部通过 ✅");
    process.exit(0);
  } else {
    console.error(`共 ${failures} 项失败 ❌`);
    process.exit(1);
  }
}

main();
