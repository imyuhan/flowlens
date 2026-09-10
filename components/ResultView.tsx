import type { AnalysisSummary, TaskAnalysis } from "@/lib/types";
import { ResultSummary } from "./ResultSummary";
import { TaskCard } from "./TaskCard";

type Props = {
  summary: AnalysisSummary;
  /** 已按优先级降序排列，直接按顺序渲染即可 */
  tasks: TaskAnalysis[];
  /** 当前已复制 Prompt 的任务 id，用于按钮回显「已复制」 */
  copiedId: string | null;
  onCopy: (id: string, prompt: string) => void;
};

/** 分析结果区：概览条 + 任务卡片列表 */
export function ResultView({ summary, tasks, copiedId, onCopy }: Props) {
  return (
    <>
      <ResultSummary summary={summary} />
      <section className="mx-auto max-w-4xl space-y-5 px-4 pb-12 pt-12 sm:px-6 sm:pb-20 sm:pt-14">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            copied={copiedId === task.id}
            onCopy={() => onCopy(task.id, task.reusablePrompt)}
          />
        ))}
      </section>
    </>
  );
}
