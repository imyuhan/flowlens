/**
 * 分析接口：Cloudflare Pages Function
 *
 * 职责刻意保持极简 —— 只做「校验输入 → 调用模型服务 → 校验输出」。
 * 规则兜底不在这里：兜底放在客户端，这样服务端本身不可达时它仍然生效。
 *
 * 模型服务通过 **OpenAI 兼容协议**调用，默认指向阿里云百炼（北京）。
 * endpoint / 模型名 / key 全部来自环境变量，因此更换服务商无需改代码：
 *   - 生产：Cloudflare Pages 项目的环境变量
 *   - 本地：项目根目录的 .dev.vars（已忽略，勿提交）
 *
 * 该服务只支持 response_format 的 json_object 模式（不支持 json_schema），
 * 所以结构约束靠 prompt 描述 + validate.ts 的运行时校验共同保证。
 */

import { SYSTEM_PROMPT } from "./prompt";
import { normalizeResult } from "./validate";

interface Env {
  /** 必填：模型服务的 API key */
  OPENAI_API_KEY?: string;
  /** 可选：OpenAI 兼容端点，默认阿里云百炼（北京） */
  OPENAI_BASE_URL?: string;
  /** 可选：模型名 */
  OPENAI_MODEL?: string;
}

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus-2025-07-28";

/** 输入长度上限（去空白后计），超出直接拒绝、不消耗额度（spec F6） */
const MAX_INPUT_LENGTH = 2000;

/** 上游请求的超时，须小于客户端的 30 秒，否则客户端先超时、降级原因会失真 */
const UPSTREAM_TIMEOUT_MS = 25_000;

/** 归一化的失败响应 */
function fail(reason: "too_long" | "model_error" | "invalid_output"): Response {
  return Response.json({ ok: false, reason });
}

/** 上游返回体中本服务用到的部分 */
interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      // 未配置 key：不要把它当成可恢复错误重试，直接降级
      console.error("OPENAI_API_KEY 未配置，无法调用模型服务");
      return fail("model_error");
    }

    const body = (await context.request.json()) as { text?: unknown } | null;
    const text = body?.text;

    if (typeof text !== "string" || text.trim().length === 0) {
      return fail("model_error");
    }

    // 超长输入在调用模型之前就拒绝，避免白白消耗额度
    if (text.trim().length > MAX_INPUT_LENGTH) {
      return fail("too_long");
    }

    const baseUrl = (context.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const model = context.env.OPENAI_MODEL || DEFAULT_MODEL;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          // 该服务仅支持 json_object；prompt 中已包含 "JSON" 字样（接口要求）
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      // 记录状态码便于排查，但不把上游原始报错透给客户端（spec N8）
      console.error("模型服务返回非 2xx：", upstream.status);
      return fail("model_error");
    }

    const payload = (await upstream.json()) as ChatCompletion;
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return fail("invalid_output");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail("invalid_output");
    }

    const result = normalizeResult(parsed);
    if (!result) return fail("invalid_output");

    return Response.json({ ok: true, result });
  } catch (error) {
    // 网络异常、abort、请求体解析失败等一律归一
    console.error("调用模型服务失败：", error instanceof Error ? error.message : "未知错误");
    return fail("model_error");
  }
};
