import type { Metadata } from "next";
import "./globals.css";
import { LogoMark } from "@/components/LogoMark";

export const metadata: Metadata = {
  title: "FlowLens · AI 工作流分析",
  description: "识别重复、耗时、规则明确的工作，找到值得自动化的机会。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="sticky top-0 z-10 h-14 border-b border-slate-200/80 bg-white/95 shadow-[0_2px_12px_rgba(15,23,42,0.03)] backdrop-blur">
          <div className="mx-auto flex h-full max-w-4xl items-center gap-2.5 px-4 sm:px-6">
            <LogoMark />
            <span className="text-base font-semibold tracking-tight text-slate-900">FlowLens</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
