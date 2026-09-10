/**
 * 分析引擎冒烟测试
 *
 * 直接运行：npx tsx scripts/smoke.ts
 * 验证 spec.md 的 EA1–EA5：示例至少命中一个任务、字段完整、概览正确、
 * 过短/空白/闲聊返回空、按评分降序。任一断言失败则抛出并退出码非 0。
 */

import { analyze } from "../lib/analyzer";
import type { TaskAnalysis } from "../lib/types";

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
  });
}

function main() {
  console.log("=== FlowLens 引擎冒烟测试 ===\n");

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
