// Cloudflare Worker entry for the same frontend/API contract as api/generate.js.
// Static files are served by the ASSETS binding; /api/generate is handled here.

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const MAX_TEXT_BYTES = 100_000;
const MAX_SCHEMA_BYTES = 20_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    done: () => clearTimeout(timer),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryProviderStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
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

async function callGemini({ system, prompt, schema }, env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");

  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };
  if (schema) body.generationConfig.responseSchema = schema;
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const maxAttempts = 2;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const to = withTimeout(45000);
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: to.signal,
      });
    } catch (err) {
      lastError = err;
      throw err;
    } finally {
      to.done();
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      const attemptLabel = attempt > 1 ? ` after ${attempt} attempts` : "";
      lastError = new Error(`Gemini ${resp.status}${attemptLabel}: ${detail.slice(0, 300)}`);
      if (attempt < maxAttempts && shouldRetryProviderStatus(resp.status)) {
        await sleep(900 * attempt);
        continue;
      }
      throw lastError;
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("");
    if (!text) throw new Error("Gemini returned empty response");
    return text;
  }

  throw lastError || new Error("Gemini failed");
}

async function callAnthropic({ system, prompt }, env) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const model = env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
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
        model,
        max_tokens: 8192,
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

async function handleGenerate(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { prompt, system, schema } = body || {};
  const invalid = validatePrompt(prompt, system);
  if (invalid) return json({ error: invalid }, 400);

  const invalidSchema = validateSchema(schema);
  if (invalidSchema) return json({ error: invalidSchema }, 400);

  const errors = [];
  try {
    const text = await callGemini({ system, prompt, schema }, env);
    return json({ text, provider: "gemini" });
  } catch (e) {
    errors.push(`gemini: ${toErrorText(e, "45s")}`);
  }

  try {
    const text = await callAnthropic({ system, prompt }, env);
    return json({ text, provider: "anthropic" });
  } catch (e) {
    errors.push(`anthropic: ${toErrorText(e, "60s")}`);
  }

  return json(
    {
      error: "両方のAIプロバイダーが応答しませんでした / 两个 AI 服务都未响应",
      detail: errors,
    },
    502,
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/generate") {
      return handleGenerate(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
