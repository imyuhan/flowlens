import type { AnalysisSummary } from "@/lib/types";

/** 概览条：三个统计项，值由 summary 现算 */
function buildItems(summary: AnalysisSummary): [string, string][] {
  return [
    ["可自动化任务", `${summary.automatableCount} 个`],
    ["平均优先级分", `${summary.averageScore} 分`],
    ["预计每周节省", `${summary.estimatedHoursPerWeek} 小时`],
  ];
}

export function ResultSummary({ summary }: { summary: AnalysisSummary }) {
  return (
    <section className="border-b border-teal-100 bg-[#eef5f2]">
      <div className="mx-auto grid max-w-4xl grid-cols-1 divide-y divide-teal-100 px-4 py-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
        {buildItems(summary).map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 py-5 sm:block sm:px-5 sm:first:pl-0 sm:last:pr-0"
          >
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-teal-900">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
