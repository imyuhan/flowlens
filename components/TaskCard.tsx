import type { TaskAnalysis } from "@/lib/types";
import { ScoreBar } from "./ScoreBar";

type Props = { task: TaskAnalysis; copied: boolean; onCopy: () => void };

/** 维度标签的展示顺序、中文名与配色（分数为 0 的维度不展示） */
const DIMENSIONS = [
  ["重复", "repetition", "bg-sky-100 text-sky-800"],
  ["耗时", "timeCost", "bg-amber-100 text-amber-800"],
  ["规则", "ruleClarity", "bg-violet-100 text-violet-800"],
] as const;

export function TaskCard({ task, copied, onCopy }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      {/* 卡片头：任务名与原文在左，优先级评分在右 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-teal-700">
            TASK {task.id.replace("task-", "").padStart(2, "0")}
          </p>
          <h2 className="break-words text-xl font-bold text-slate-900">{task.title}</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
            {task.rawText}
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-48">
          <p className="mb-2 text-xs font-medium text-slate-500">优先级</p>
          <ScoreBar score={task.priorityScore} />
        </div>
      </div>

      {/* 判定依据：LLM 路径产出语义理由；规则路径为空数组，此时仅显示下方关键词标签 */}
      {task.rationale.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium text-slate-500">判定依据</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {task.rationale.map((item) => (
              <span
                key={item}
                className="break-words rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-100"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 命中标签：三维度得分 + 命中的关键词 */}
      <div className="mt-6 flex flex-wrap gap-2">
        {DIMENSIONS.filter(([, key]) => task.dimensions[key] > 0).map(([label, key, color]) => (
          <span key={label} className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
            {label} {task.dimensions[key]}
          </span>
        ))}
        {task.matchedKeywords.map((word) => (
          <span key={word} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            #{word}
          </span>
        ))}
      </div>

      {/* 双栏：左自动化建议，右标准作业流程 */}
      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold text-slate-900">自动化建议</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {task.automationSuggestions.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-teal-600">✓</span>
                <span className="break-words">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-900">标准作业流程</h3>
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
            <p>
              <b className="text-slate-800">触发：</b>
              {task.sop.trigger}
            </p>
            <p>
              <b className="text-slate-800">输入：</b>
              {task.sop.inputs.join("、")}
            </p>
            <div>
              <b className="text-slate-800">步骤：</b>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {task.sop.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <p>
              <b className="text-slate-800">输出：</b>
              {task.sop.output}
            </p>
          </div>
        </section>
      </div>

      {/* 可复用 Prompt 与复制按钮 */}
      <section className="mt-7 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">可复用 Prompt</h3>
          <button
            type="button"
            onClick={onCopy}
            className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:border-teal-400 hover:text-teal-700"
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-xs leading-6 text-slate-600">
          {task.reusablePrompt}
        </pre>
      </section>
    </article>
  );
}
