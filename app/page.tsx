"use client";

import { useState } from "react";
import { analyze } from "@/lib/analyzer";
import type { AnalysisResult } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ResultView } from "@/components/ResultView";
import { WorkflowInput } from "@/components/WorkflowInput";

/** 「填入示例」按钮的预置文本，与 scripts/smoke.ts 的约定示例一致 */
const EXAMPLE =
  "每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。";

const MIN_INPUT_LENGTH = 10;

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [shortError, setShortError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const runAnalysis = () => {
    if (input.trim().length < MIN_INPUT_LENGTH) {
      setShortError(true);
      return;
    }
    setShortError(false);
    setLoading(true);
    window.setTimeout(() => {
      setResult(analyze(input));
      setLoading(false);
    }, 320);
  };

  const copyPrompt = async (id: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* 剪贴板不可用（非 HTTPS 或用户拒绝授权）时静默忽略 */
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (shortError) setShortError(false);
  };

  const handleExample = () => {
    setInput(EXAMPLE);
    setShortError(false);
  };

  // 首屏空态：未分析过且不在加载中，输入区垂直居中
  const idle = !result && !loading;
  const hasTasks = result !== null && result.tasks.length > 0;

  const inputNode = (
    <WorkflowInput
      input={input}
      onChange={handleInputChange}
      onExample={handleExample}
      onAnalyze={runAnalysis}
      loading={loading}
      shortError={shortError}
      centered={idle}
    />
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
          {loading && <LoadingState />}
          {!loading && hasTasks && (
            <ResultView
              summary={result.summary}
              tasks={result.tasks}
              copiedId={copiedId}
              onCopy={copyPrompt}
            />
          )}
          {!loading && result !== null && !hasTasks && <EmptyState kind="empty" />}
        </>
      )}
    </main>
  );
}
