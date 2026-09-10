/**
 * 分析接口：Cloudflare Pages Function
 *
 * 职责刻意保持极简 —— 只做「校验输入 → 调用 Workers AI → 校验输出」。
 * 规则兜底不在这里：兜底放在客户端，这样服务端本身不可达时它仍然生效。
 *
 * 凭证：使用运行时绑定 env.AI，**没有任何 API key** 需要保管或轮换。
 */

import { RESULT_SCHEMA, SYSTEM_PROMPT } from "./prompt";
import { normalizeResult } from "./validate";

interface Env {
  AI: Ai;
}

/**
 * 模型名。Workers AI 的模型目录变动频繁，此值为初始选择，
 * 待 task.md T15 按中文质量与 JSON 合规率实测后定稿。
 */
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** 输入长度上限（去空白后计），超出直接拒绝、不消耗额度（spec F6） */
const MAX_INPUT_LENGTH = 2000;

/** 归一化的失败响应 */
function fail(reason: "too_long" | "model_error" | "invalid_output"): Response {
  return Response.json({ ok: false, reason });
}

/**
 * 从 Workers AI 的返回中取出文本内容。
 *
 * 不同模型与输出模式的返回结构不一致（原生返回 `response`，
 * OpenAI 兼容模式返回 `choices[0].message.content`），这里做统一提取。
 */
function extractText(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (typeof response !== "object" || response === null) return null;

  const record = response as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === "string") return message.content;
  }

  return null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as { text?: unknown } | null;
    const text = body?.text;

    if (typeof text !== "string" || text.trim().length === 0) {
      return fail("model_error");
    }

    // 超长输入在调用模型之前就拒绝，避免白白消耗免费额度
    if (text.trim().length > MAX_INPUT_LENGTH) {
      return fail("too_long");
    }

    // Ai 的泛型签名与自定义 response_format 不兼容，这里按实际调用形态收窄
    const ai = context.env.AI as unknown as {
      run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
    };

    const response = await ai.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "flowlens_analysis", schema: RESULT_SCHEMA },
      },
    });

    const raw = extractText(response);
    if (!raw) return fail("invalid_output");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail("invalid_output");
    }

    const result = normalizeResult(parsed);
    if (!result) return fail("invalid_output");

    return Response.json({ ok: true, result });
  } catch {
    // 模型报错、JSON Mode 无法满足、绑定缺失等一律归一
    return fail("model_error");
  }
};
