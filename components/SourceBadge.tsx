import type { AnalysisSource, AnalyzeFailureReason } from "@/lib/types";

type Props = {
  source: AnalysisSource;
  /** 仅因失败降级时存在 */
  degradedReason?: AnalyzeFailureReason;
};

/** 降级原因的中文说明 —— 只给用户能理解的原因，不暴露堆栈或供应商原始报错（spec N8） */
const REASON_TEXT: Record<AnalyzeFailureReason, string> = {
  too_long: "输入过长",
  timeout: "AI 响应超时",
  model_error: "AI 暂不可用",
  invalid_output: "AI 返回内容异常",
};

/** 结果来源标注 */
export function SourceBadge({ source, degradedReason }: Props) {
  if (source === "llm") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
        AI 分析
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      本地规则分析
      {degradedReason && (
        <span className="font-normal text-amber-700">· {REASON_TEXT[degradedReason]}</span>
      )}
    </span>
  );
}
