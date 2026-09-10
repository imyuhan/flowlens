import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowLens · AI 工作流分析",
  description: "识别重复、耗时、规则明确的工作，找到值得自动化的机会。",
};

// header 已移入 app/page.tsx：历史入口需要交互，而历史状态属于页面，
// 放在同一组件内可直接共享，无需 Context 或状态提升。
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
