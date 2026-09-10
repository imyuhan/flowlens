type Props = { input: string; onChange: (value: string) => void; onExample: () => void; onAnalyze: () => void; loading: boolean; shortError: boolean; centered?: boolean };

export function WorkflowInput({ input, onChange, onExample, onAnalyze, loading, shortError, centered = false }: Props) {
  return (
    <section className={centered ? "w-full bg-white" : "border-b border-slate-200 bg-white"}>
      <div className={`mx-auto w-full max-w-4xl px-4 sm:px-6${centered ? " py-8 sm:py-10" : " pb-12 pt-16 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-24"}`}>
        <div className="mb-7 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">把日常工作，变成清晰的自动化机会</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">描述你和团队每天、每周反复处理的工作。FlowLens 会找出重复、耗时且规则明确的环节。</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4">
          <textarea value={input} onChange={(e) => onChange(e.target.value)} placeholder="例如：每天整理销售数据，把表格复制粘贴到周报里……" className="min-h-44 w-full resize-none rounded-lg border border-slate-200 bg-white p-4 text-base leading-7 text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          {shortError && <p className="mt-2 text-sm font-medium text-rose-600">内容太短了，请至少输入 10 个字再开始分析。</p>}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={onExample} className="min-h-11 rounded-lg px-3 text-left text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-teal-700">填入示例</button>
            <button type="button" onClick={onAnalyze} disabled={loading} className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60">{loading ? "分析中…" : "开始分析  →"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
