import type { Env } from "./db";

type GeminiCandidate = {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
};

export function aiProvider(env: Env) {
  if (env.GEMINI_API_KEY) return "gemini" as const;
  if (env.OPENAI_API_KEY && env.OPENAI_MODEL) return "openai" as const;
  return null;
}

export async function generateWithGemini(
  env: Env,
  system: string,
  input: unknown,
  schema?: Record<string, unknown>,
) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini is not configured.");
  const model = String(env.GEMINI_MODEL || "gemini-2.5-flash");
  if (!/^[a-zA-Z0-9._-]+$/.test(model))
    throw new Error("The Gemini model name is invalid.");
  const vertexExpress = env.GEMINI_BACKEND === "vertex-express";
  const response = await fetch(
    vertexExpress
      ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(String(env.GEMINI_API_KEY))}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: vertexExpress
        ? { "Content-Type": "application/json" }
        : {
            "x-goog-api-key": String(env.GEMINI_API_KEY),
            "Content-Type": "application/json",
          },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: schema
          ? { responseMimeType: "application/json", responseSchema: schema }
          : { temperature: 0.3 },
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `Gemini is unavailable (HTTP ${response.status}). No draft was saved or sent. Check the local key, API access and model name.`,
    );
  const data = (await response.json()) as { candidates?: GeminiCandidate[] };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text || candidate?.finishReason === "SAFETY")
    throw new Error("Gemini returned no usable draft. Nothing was sent.");
  return text;
}
