type Props = { kind: "idle" | "empty"; compact?: boolean };

/** 首屏空态与「无命中」空态的文案 */
const CONTENT = {
  idle: {
    icon: "✦",
    title: "从一段工作描述开始",
    hint: "点击“填入示例”查看一次完整分析，或直接写下你的日常工作。",
  },
  empty: {
    icon: "—",
    title: "未识别到可自动化任务",
    hint: "试着描述更具体的频率、手工步骤或判断规则，通常能帮助我们找到更多线索。",
  },
} as const;

export function EmptyState({ kind, compact = false }: Props) {
  const content = CONTENT[kind];

  return (
    <div
      className={`mx-auto max-w-4xl px-4 text-center sm:px-6${
        compact ? " py-4 sm:py-6" : " pb-16 pt-24 sm:pb-20 sm:pt-32"
      }`}
    >
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 text-2xl text-teal-700 shadow-sm">
        {content.icon}
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{content.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{content.hint}</p>
    </div>
  );
}
