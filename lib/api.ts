/**
 * 客户端分析接口封装
 *
 * 负责调用同源的分析接口，并把它的一切失败（网络错误、超时、非 2xx、
 * 响应体损坏、结构不符）归一为 AnalyzeResponse —— **永不抛出**。
 * 上层据此决定是否降级到本地规则引擎。
 */

import type {
  AnalysisOutcome,
  AnalysisResult,
  AnalyzeFailureReason,
  AnalyzeResponse,
} from "./types";

/**
 * 单次分析的最长等待时间（spec N2）。
 *
 * 必须**大于**服务端的上游超时（55 秒），否则服务端还在等待时客户端已先降级，
 * 用户看到的会是 `timeout` 而不是真正的失败原因。
 */
const TIMEOUT_MS = 65_000;

const ENDPOINT = "/api/analyze";

/** 失败原因白名单：只接受已知取值，防止被任意字符串污染 */
const FAILURE_REASONS: readonly AnalyzeFailureReason[] = [
  "too_long",
  "timeout",
  "model_error",
  "invalid_output",
];

function isFailureReason(value: unknown): value is AnalyzeFailureReason {
  return typeof value === "string" && (FAILURE_REASONS as readonly string[]).includes(value);
}

/** 判断成功响应体里是否含有结构可用的结果 */
function isResultPayload(value: unknown): value is AnalysisResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AnalysisResult>;
  return (
    typeof candidate.summary === "object" &&
    candidate.summary !== null &&
    Array.isArray(candidate.tasks)
  );
}

/** 判断异常是否为超时触发的 abort */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * 请求一次分析。
 *
 * 调用方需自行完成前置校验（如输入长度）；本函数只负责传输与失败归类。
 *
 * @param text 用户输入的工作描述
 * @returns 成功时含完整结果，失败时含归一后的原因
 */
export async function requestAnalysis(text: string): Promise<AnalyzeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: "model_error" };
    }

    // 响应体不是合法 JSON 时会抛出，交由下方 catch 归一
    const payload: unknown = await response.json();

    if (typeof payload !== "object" || payload === null) {
      return { ok: false, reason: "model_error" };
    }

    const body = payload as { ok?: unknown; result?: unknown; reason?: unknown };

    if (body.ok === true && isResultPayload(body.result)) {
      return { ok: true, result: body.result };
    }

    if (body.ok === false && isFailureReason(body.reason)) {
      return { ok: false, reason: body.reason };
    }

    return { ok: false, reason: "model_error" };
  } catch (error) {
    // 超时与网络异常都收敛到此处
    return { ok: false, reason: isAbortError(error) ? "timeout" : "model_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把接口响应合成为一次分析的完整产出。
 *
 * 抽成纯函数的原因：降级决策是本模块最需要被验证的行为，
 * 放在组件里就无法直接测试。localAnalyze 由调用方注入（通常就是规则引擎）。
 *
 * @param text 本次分析的输入
 * @param response 接口响应
 * @param localAnalyze 本地兜底分析函数
 */
export function resolveOutcome(
  text: string,
  response: AnalyzeResponse,
  localAnalyze: (text: string) => AnalysisResult,
): AnalysisOutcome {
  if (response.ok) {
    return { result: response.result, source: "llm" };
  }

  return {
    result: localAnalyze(text),
    source: "rules",
    degradedReason: response.reason,
  };
}
