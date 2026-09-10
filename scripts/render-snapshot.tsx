/**
 * 渲染快照工具
 *
 * 用 react-dom/server 的 renderToStaticMarkup 把组件渲染成静态 HTML 并打印到 stdout，
 * 用于在「纯格式化 / 结构重构」前后做逐字节比对，机械地证明渲染结果未变。
 *
 * 用法：
 *   npx tsx scripts/render-snapshot.tsx > before.html
 *   ... 改代码 ...
 *   npx tsx scripts/render-snapshot.tsx > after.html
 *   diff before.html after.html
 *
 * 覆盖：概览条、任务卡片列表、两种空态、评分条，以及（重构后）ResultView 组合。
 */

import { renderToStaticMarkup } from "react-dom/server";
import { analyze } from "../lib/analyzer";
import { EmptyState } from "../components/EmptyState";
import { ResultSummary } from "../components/ResultSummary";
import { ScoreBar } from "../components/ScoreBar";
import { TaskCard } from "../components/TaskCard";

// 与 app/page.tsx 的 EXAMPLE 保持一致
const EXAMPLE =
  "每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。";

const result = analyze(EXAMPLE);
const noop = () => {};

/** 逐段渲染并拼接，便于 diff 时定位到具体区块 */
function renderSection(label: string, markup: string): string {
  return `<!-- === ${label} === -->\n${markup}\n`;
}

const sections: string[] = [];

sections.push(renderSection("ResultSummary", renderToStaticMarkup(<ResultSummary summary={result.summary} />)));

sections.push(
  renderSection(
    "TaskList",
    renderToStaticMarkup(
      <section className="mx-auto max-w-4xl space-y-5 px-4 pb-12 pt-12 sm:px-6 sm:pb-20 sm:pt-14">
        {result.tasks.map((task) => (
          <TaskCard key={task.id} task={task} copied={false} onCopy={noop} />
        ))}
      </section>,
    ),
  ),
);

// copied=true 的分支（按钮文案「已复制」）单独渲染一次
sections.push(
  renderSection("TaskCard-copied", renderToStaticMarkup(<TaskCard task={result.tasks[0]} copied onCopy={noop} />)),
);

sections.push(renderSection("EmptyState-idle", renderToStaticMarkup(<EmptyState kind="idle" compact />)));
sections.push(renderSection("EmptyState-empty", renderToStaticMarkup(<EmptyState kind="empty" />)));

for (const score of [0, 25, 62, 100]) {
  sections.push(renderSection(`ScoreBar-${score}`, renderToStaticMarkup(<ScoreBar score={score} />)));
}

// 引擎输出一并快照：确认重构没碰到 lib/
sections.push(renderSection("EngineOutput", JSON.stringify(result, null, 2)));

process.stdout.write(sections.join("\n"));
