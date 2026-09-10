"use client";

import { useEffect, useState } from "react";
import { analyze } from "@/lib/analyzer";
import { requestAnalysis, resolveOutcome } from "@/lib/api";
import * as history from "@/lib/history";
import type { AnalysisOutcome, HistoryEntry } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { HistoryPanel } from "@/components/HistoryPanel";
import { LoadingState } from "@/components/LoadingState";
import { LogoMark } from "@/components/LogoMark";
import { ResultView } from "@/components/ResultView";
import { WorkflowInput } from "@/components/WorkflowInput";

/** 「填入示例」按钮的预置文本，与 scripts/smoke.ts 的约定示例一致 */
const EXAMPLE =
  "每天整理销售数据，把表格复制粘贴到周报里；每周汇总各个部门的进度，手动核对每个人的完成情况；每当客户提交工单，需要判断是退款还是换货，然后转给对应客服；每月导出财务报表，筛选出异常交易发给财务。";

const MIN_INPUT_LENGTH = 10;

export default function Home() {
  const [input, setInput] = useState("");
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [shortError, setShortError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(true);

  // 挂载后再读写本地存储：静态导出下首次渲染时不存在 window，
  // 放 useEffect 里可避免服务端渲染阶段访问存储。
  useEffect(() => {
    setHistoryAvailable(history.isAvailable());
    setEntries(history.load());
  }, []);

  const runAnalysis = async () => {
    const text = input;
    if (text.trim().length < MIN_INPUT_LENGTH) {
      setShortError(true);
      return;
    }
    setShortError(false);
    setLoading(true);

    try {
      // 主路径走服务端 LLM；任何失败都在 resolveOutcome 内降级到本地规则引擎
      const response = await requestAnalysis(text);
      const next = resolveOutcome(text, response, analyze);
      setOutcome(next);
      setEntries(history.save(text, next));
      setHistoryAvailable(history.isAvailable());
    } catch {
      // requestAnalysis 与 analyze 均不抛出，此处仅为防御性兜底
      setOutcome({ result: analyze(text), source: "rules", degradedReason: "model_error" });
    } finally {
      setLoading(false);
    }
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

  /** 点击历史条目：还原当时的结果与输入，不重新分析 */
  const handleSelectEntry = (entry: HistoryEntry) => {
    setOutcome(entry.outcome);
    setInput(entry.input);
    setShortError(false);
    setHistoryOpen(false);
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(history.remove(id));
  };

  const handleClearHistory = () => {
    history.clear();
    setEntries([]);
  };

  // 首屏空态：未分析过且不在加载中，输入区垂直居中
  const idle = outcome === null && !loading;
  const hasTasks = outcome !== null && outcome.result.tasks.length > 0;

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
    <>
      {/* header 从 layout 移入此处：历史入口需要交互，状态属于本组件 */}
      <header className="sticky top-0 z-10 h-14 border-b border-slate-200/80 bg-white/95 shadow-[0_2px_12px_rgba(15,23,42,0.03)] backdrop-blur">
        <div className="mx-auto flex h-full max-w-4xl items-center gap-2.5 px-4 sm:px-6">
          <LogoMark />
          <span className="text-base font-semibold tracking-tight text-slate-900">FlowLens</span>

          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            disabled={!historyAvailable}
            title={historyAvailable ? undefined : "当前浏览器环境不支持本地存储"}
            className="ml-auto min-h-9 shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-teal-400 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            历史记录{entries.length > 0 ? ` (${entries.length})` : ""}
          </button>
        </div>
      </header>

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
                summary={outcome.result.summary}
                tasks={outcome.result.tasks}
                source={outcome.source}
                degradedReason={outcome.degradedReason}
                copiedId={copiedId}
                onCopy={copyPrompt}
              />
            )}
            {!loading && outcome !== null && !hasTasks && <EmptyState kind="empty" />}
          </>
        )}
      </main>

      <HistoryPanel
        entries={entries}
        open={historyOpen}
        available={historyAvailable}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectEntry}
        onRemove={handleRemoveEntry}
        onClear={handleClearHistory}
      />
    </>
  );
}
