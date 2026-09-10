import type {
  AnalysisSource,
  AnalysisSummary,
  AnalyzeFailureReason,
  TaskAnalysis,
} from "@/lib/types";
import { ResultSummary } from "./ResultSummary";
import { SourceBadge } from "./SourceBadge";
import { TaskCard } from "./TaskCard";

type Props = {
  summary: AnalysisSummary;
  /** 已按优先级降序排列，直接按顺序渲染即可 */
  tasks: TaskAnalysis[];
  /** 结果来源：llm 或本地规则降级 */
  source: AnalysisSource;
  /** 仅因失败降级时存在 */
  degradedReason?: AnalyzeFailureReason;
  /** 当前已复制 Prompt 的任务 id，用于按钮回显「已复制」 */
  copiedId: string | null;
  onCopy: (id: string, prompt: string) => void;
};

/** 分析结果区：概览条 + 来源标注 + 任务卡片列表 */
export function ResultView({
  summary,
  tasks,
  source,
  degradedReason,
  copiedId,
  onCopy,
}: Props) {
  return (
    <>
      <ResultSummary summary={summary} />

      <section className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
        <SourceBadge source={source} degradedReason={degradedReason} />
      </section>

      <section className="mx-auto max-w-4xl space-y-5 px-4 pb-12 pt-5 sm:px-6 sm:pb-20 sm:pt-6">
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
