"use client";

import { useState } from "react";
import { analyze } from "@/lib/analyzer";
import type { AnalysisResult } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { ResultSummary } from "@/components/ResultSummary";
import { TaskCard } from "@/components/TaskCard";
import { WorkflowInput } from "@/components/WorkflowInput";

const EXAMPLE = "每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。";

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [shortError, setShortError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const runAnalysis = () => {
    if (input.trim().length < 10) { setShortError(true); return; }
    setShortError(false); setLoading(true);
    window.setTimeout(() => { setResult(analyze(input)); setLoading(false); }, 320);
  };
  const copyPrompt = async (id: string, prompt: string) => { try { await navigator.clipboard.writeText(prompt); setCopiedId(id); window.setTimeout(() => setCopiedId(null), 1500); } catch { /* clipboard may be unavailable */ } };

  const idle = !result && !loading;
  const inputNode = (
    <WorkflowInput input={input} onChange={(value) => { setInput(value); if (shortError) setShortError(false); }} onExample={() => { setInput(EXAMPLE); setShortError(false); }} onAnalyze={runAnalysis} loading={loading} shortError={shortError} centered={idle} />
  );

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {idle ? (
        <div className="flex flex-1 flex-col justify-center">
          {inputNode}
          <EmptyState kind="idle" compact />
        </div>
      ) : (
        <>
          {inputNode}
          {loading ? <div className="mx-auto max-w-4xl px-4 pb-16 pt-28 text-center sm:px-6 sm:pb-20 sm:pt-36"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" /><p className="mt-4 text-sm text-slate-600">正在梳理你的工作流…</p></div> : result ? result.tasks.length > 0 ? <><ResultSummary summary={result.summary} /><section className="mx-auto max-w-4xl space-y-5 px-4 pb-12 pt-12 sm:px-6 sm:pb-20 sm:pt-14">{result.tasks.map((task) => <TaskCard key={task.id} task={task} copied={copiedId === task.id} onCopy={() => copyPrompt(task.id, task.reusablePrompt)} />)}</section></> : <EmptyState kind="empty" /> : null}
        </>
      )}
    </main>
  );
}
