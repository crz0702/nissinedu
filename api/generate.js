// Vercel Serverless Function (Node 18+/22 runtime, native fetch).
// Thin proxy that keeps API keys server-side.
// Primary: Google Gemini. Fallback: Anthropic Claude.
//
// Required env vars (set in Vercel project settings):
//   GEMINI_API_KEY      - Google AI Studio key
//   ANTHROPIC_API_KEY   - Anthropic key (used only if Gemini fails)
// Optional:
//   GEMINI_MODEL        - default "gemini-2.5-flash"
//   ANTHROPIC_MODEL     - default "claude-3-5-sonnet-20241022"

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
const MAX_TEXT_BYTES = 100_000;
const MAX_SCHEMA_BYTES = 20_000;

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    done: () => clearTimeout(timer),
  };
}

function toErrorText(err, fallback) {
  if (err?.name === "AbortError") return `请求超时 (${fallback})`;
  if (typeof err?.message === "string") return err.message;
  return String(err || "unknown");
}

function validatePrompt(prompt, system) {
  if (!prompt || typeof prompt !== "string") {
    return "Missing 'prompt'";
  }
  if (prompt.length > MAX_TEXT_BYTES) return "Prompt too long";
  if (system && typeof system !== "string") return "Invalid 'system'";
  return null;
}

function validateSchema(schema) {
  if (schema === undefined || schema === null) return null;
  if (typeof schema !== "object" || Array.isArray(schema)) return "Invalid 'schema'";
  if (JSON.stringify(schema).length > MAX_SCHEMA_BYTES) return "Schema too large";
  return null;
}

async function callGemini({ system, prompt, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };
  if (schema) body.generationConfig.responseSchema = schema;
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const to = withTimeout(45000);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: to.signal,
    });
  } finally {
    to.done();
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Gemini ${resp.status}: ${detail.slice(0, 300)}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("");
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callAnthropic({ system, prompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const to = withTimeout(60000);
  let resp;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: system || undefined,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: to.signal,
    });
  } finally {
    to.done();
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${detail.slice(0, 300)}`);
  }
  const data = await resp.json();
  const text = data?.content?.map((b) => b.text || "").join("");
  if (!text) throw new Error("Anthropic returned empty response");
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const { prompt, system, schema } = body || {};
  const invalid = validatePrompt(prompt, system);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  const invalidSchema = validateSchema(schema);
  if (invalidSchema) {
    res.status(400).json({ error: invalidSchema });
    return;
  }

  const errors = [];
  try {
    const text = await callGemini({ system, prompt, schema });
    res.status(200).json({ text, provider: "gemini" });
    return;
  } catch (e) {
    errors.push(`gemini: ${toErrorText(e, "45s")}`);
  }

  try {
    const text = await callAnthropic({ system, prompt });
    res.status(200).json({ text, provider: "anthropic" });
    return;
  } catch (e) {
    errors.push(`anthropic: ${toErrorText(e, "60s")}`);
  }

  res.status(502).json({
    error: "両方のAIプロバイダーが応答しませんでした / 两个 AI 服务都未响应",
    detail: errors,
  });
}
