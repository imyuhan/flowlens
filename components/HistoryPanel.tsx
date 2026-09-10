import { useState } from "react";
import { HISTORY_LIMIT } from "@/lib/history";
import type { AnalysisSource, HistoryEntry } from "@/lib/types";

type Props = {
  entries: HistoryEntry[];
  open: boolean;
  /** 本地存储是否可用；false 时面板给出说明而非空态 */
  available: boolean;
  onClose: () => void;
  onSelect: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

/** 时间戳格式化为「MM-DD HH:mm」 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 把输入压成单行摘要 */
function summarize(text: string, max = 40): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

const SOURCE_LABEL: Record<AnalysisSource, string> = {
  llm: "AI 分析",
  rules: "本地规则",
};

/** 历史记录抽屉：桌面端右侧滑出，移动端全屏 */
export function HistoryPanel({
  entries,
  open,
  available,
  onClose,
  onSelect,
  onRemove,
  onClear,
}: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (!open) return null;

  const hasEntries = available && entries.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* 遮罩：点击关闭 */}
      <button
        type="button"
        aria-label="关闭历史记录"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/30 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-label="历史记录"
        className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-md"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">历史记录</h2>

          <div className="flex shrink-0 items-center gap-1">
            {hasEntries &&
              (confirmingClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClear();
                      setConfirmingClear(false);
                    }}
                    className="min-h-9 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700"
                  >
                    确认清空
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="min-h-9 rounded-lg px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  className="min-h-9 rounded-lg px-3 text-xs font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
                >
                  清空全部
                </button>
              ))}

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!available ? (
            <p className="px-6 py-12 text-center text-sm leading-6 text-slate-500">
              当前浏览器环境不支持本地存储，历史记录暂不可用。
              <br />
              分析功能不受影响。
            </p>
          ) : entries.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm leading-6 text-slate-500">
              还没有历史记录。完成一次分析后会自动保存在这里。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(entry)}
                    className="min-w-0 flex-1 px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="tabular-nums">{formatTime(entry.createdAt)}</span>
                      <span
                        className={
                          entry.outcome.source === "llm"
                            ? "font-medium text-teal-700"
                            : "font-medium text-amber-700"
                        }
                      >
                        {SOURCE_LABEL[entry.outcome.source]}
                      </span>
                      <span>· {entry.outcome.result.tasks.length} 个任务</span>
                    </span>
                    <span className="mt-1 block break-words text-sm leading-6 text-slate-700">
                      {summarize(entry.input)}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="删除这条记录"
                    onClick={() => onRemove(entry.id)}
                    className="mr-2 mt-3 shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasEntries && (
          <footer className="shrink-0 border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            最多保留 {HISTORY_LIMIT} 条，超出后自动淘汰最旧的记录
          </footer>
        )}
      </aside>
    </div>
  );
}
