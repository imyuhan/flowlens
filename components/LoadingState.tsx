/** 分析进行中的加载态 */
export function LoadingState() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-28 text-center sm:px-6 sm:pb-20 sm:pt-36">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <p className="mt-4 text-sm text-slate-600">正在梳理你的工作流…</p>
      {/* spec N12：单次调用可能耗时数十秒，界面须持续给出反馈 */}
      <p className="mt-1 text-xs text-slate-400">AI 分析通常需要 10–30 秒，任务较多时会更久</p>
    </div>
  );
}
