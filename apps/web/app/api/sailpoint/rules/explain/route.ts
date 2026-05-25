import { headers } from "next/headers";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import { auth } from "@/lib/auth";
import {
  getCachedExplanation,
  hashSourceCode,
  saveCachedExplanation,
} from "@/lib/explain-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Model id passed to the AI SDK Anthropic provider. The provider abstracts
 * the API surface, but the model string is still Anthropic-specific. A future
 * runtime-selectable provider (issue #399) replaces this constant with a
 * per-org config lookup.
 */
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

/** Guard: BeanShell scripts above this size are refused to bound cost. ~50 KB */
const MAX_SOURCE_BYTES = 50_000;

/** Rate limit: max requests per window, per userId. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

const SYSTEM_PROMPT = `You are an expert at reading BeanShell connector rules for SailPoint IdentityNow. \
Your task is to explain a given rule in plain language that a SailPoint administrator can understand \
— not a Java developer. Focus on:
1. What the rule does (its purpose and high-level logic).
2. Its inputs (what data it reads) and outputs (what it returns or writes).
3. Any notable risks, edge cases, or patterns to be aware of (null-deref paths, API calls inside loops, hardcoded IDs).

Be concise. Use bullet points for the three sections above. \
Do not repeat the source code verbatim. Do not explain BeanShell syntax basics. \
If static analysis facts are provided, treat them as ground truth and reference them in your explanation.`;

// ── Rate limiter (in-memory, per-process) ─────────────────────────────────────

const requestLog = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const prev = requestLog.get(userId) ?? [];
  const recent = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  requestLog.set(userId, [...recent, now]);
  return true;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

type SignatureParam = {
  name: string;
  type?: string | null;
  description?: string | null;
};

type RuleSignature = {
  input?: SignatureParam[];
  output?: SignatureParam | null;
};

type SourceAnalysisSummary = {
  lineCount?: number;
  apiCallCount?: number;
  loopCount?: number;
  nullDerefCount?: number;
  unusedLocalCount?: number;
  maxDepth?: number;
  branches?: number;
};

/**
 * One block of `user` message content for the AI SDK. The shape is the
 * provider-portable text-part format with `providerOptions` for
 * provider-specific behaviour (here: Anthropic prompt caching).
 */
type TextPart = {
  type: "text";
  text: string;
  providerOptions?: {
    anthropic?: { cacheControl?: { type: "ephemeral" } };
  };
};

const cachedPart = (text: string): TextPart => ({
  type: "text",
  text,
  // Prompt-cache the static rule context: same source → same hash → same
  // cached prefix, so repeated explains of the same rule skip input
  // tokens entirely. Provider-specific option, ignored by non-Anthropic
  // providers when we add them (#399).
  providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
});

function buildUserContent(
  type: string,
  signature: RuleSignature | null | undefined,
  sourceCode: string,
  sourceAnalysis: SourceAnalysisSummary | null | undefined,
): TextPart[] {
  let ruleContext = `Connector rule type: ${type}\n\n`;

  if (signature) {
    if (signature.input?.length) {
      ruleContext += "Inputs:\n";
      for (const p of signature.input) {
        ruleContext += `  - ${p.name}${p.type ? ` (${p.type})` : ""}${p.description ? `: ${p.description}` : ""}\n`;
      }
    }
    if (signature.output) {
      const o = signature.output;
      ruleContext += `Output: ${o.name}${o.type ? ` (${o.type})` : ""}${o.description ? ` — ${o.description}` : ""}\n`;
    }
    ruleContext += "\n";
  }

  ruleContext += `Source code:\n\`\`\`beanshell\n${sourceCode}\n\`\`\``;

  const content: TextPart[] = [cachedPart(ruleContext)];

  if (sourceAnalysis) {
    const facts: string[] = [];
    if (sourceAnalysis.lineCount !== undefined)
      facts.push(`Lines: ${sourceAnalysis.lineCount}`);
    if (sourceAnalysis.apiCallCount !== undefined)
      facts.push(`API calls: ${sourceAnalysis.apiCallCount}`);
    if (sourceAnalysis.loopCount !== undefined)
      facts.push(`Loops: ${sourceAnalysis.loopCount}`);
    if (sourceAnalysis.nullDerefCount !== undefined)
      facts.push(
        `Potential null-deref paths: ${sourceAnalysis.nullDerefCount}`,
      );
    if (sourceAnalysis.unusedLocalCount !== undefined)
      facts.push(`Unused locals: ${sourceAnalysis.unusedLocalCount}`);
    if (sourceAnalysis.maxDepth !== undefined)
      facts.push(`Max nesting depth: ${sourceAnalysis.maxDepth}`);
    if (sourceAnalysis.branches !== undefined)
      facts.push(`Branch count (cyclomatic proxy): ${sourceAnalysis.branches}`);

    if (facts.length > 0) {
      content.push(
        cachedPart(
          `Static analysis facts (ground truth from local lexer):\n${facts.map((f) => `  - ${f}`).join("\n")}`,
        ),
      );
    }
  }

  // Final instruction — NOT cached (changes the cache key for no reason, and
  // is cheap).
  content.push({
    type: "text",
    text: "Please explain this rule following the three-section format (purpose, inputs/outputs, risks).",
  });

  return content;
}

// ── Streaming helper ──────────────────────────────────────────────────────────

function streamCachedText(text: string): Response {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Explain-Cache": "hit",
    },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * `POST /api/sailpoint/rules/explain`
 *
 * Accepts a connector rule's context and streams a plain-language explanation
 * generated by the configured AI provider (Anthropic Claude Sonnet 4.6 by
 * default — see #399 for runtime provider selection). Responses are cached
 * in libsql keyed by the SHA-256 of `sourceCode` — identical source never
 * re-calls the model.
 *
 * Request body:
 *   `{ type, sourceCode, signature?, sourceAnalysis? }`
 *
 * Privacy / data-egress:
 *   The `sourceCode` field is tenant BeanShell and is sent to the configured
 *   model provider (Anthropic by default). This route is intentionally gated
 *   behind explicit user action (the "Explain with AI" button) and MUST NOT
 *   be called automatically on page load. The one-time data-egress notice is
 *   enforced client-side (epic #377).
 *
 * Implementation (#398): wraps the provider via Vercel AI SDK (`streamText`
 * + `@ai-sdk/anthropic`). Switching providers is a one-line change at the
 * `model: anthropic(...)` call site once #399 lands the per-org config.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json(
      { error: "Unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const userId = session.user.id;
  const scopeKey =
    (session.session as { activeOrganizationId?: string | null })
      .activeOrganizationId ?? userId;

  // Rate limit
  if (!checkRateLimit(userId)) {
    return Response.json(
      { error: "Too many explain requests. Wait a moment and try again." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid request body." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("sourceCode" in body) ||
    typeof (body as Record<string, unknown>).sourceCode !== "string"
  ) {
    return Response.json(
      { error: "`sourceCode` (string) is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const {
    type = "Unknown",
    sourceCode,
    signature,
    sourceAnalysis,
  } = body as {
    type?: string;
    sourceCode: string;
    signature?: RuleSignature | null;
    sourceAnalysis?: SourceAnalysisSummary | null;
  };

  if (!sourceCode.trim()) {
    return Response.json(
      { error: "Source code is empty — nothing to explain." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (sourceCode.length > MAX_SOURCE_BYTES) {
    return Response.json(
      {
        error: `Script is too large (${Math.round(sourceCode.length / 1024)} KB). Maximum is ${Math.round(MAX_SOURCE_BYTES / 1024)} KB.`,
      },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Cache hit — stream the cached explanation without calling the model
  const sourceHash = hashSourceCode(sourceCode);
  try {
    const cached = await getCachedExplanation(scopeKey, sourceHash);
    if (cached) {
      return streamCachedText(cached);
    }
  } catch (err) {
    // Cache read failure is non-fatal — fall through to the model
    console.error("[rules/explain] cache read failed:", err);
  }

  // Stream from the model via AI SDK
  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserContent(type, signature, sourceCode, sourceAnalysis),
      },
    ],
    maxOutputTokens: MAX_TOKENS,
  });

  const encoder = new TextEncoder();
  let fullText = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        // Cache the completed explanation
        if (fullText) {
          saveCachedExplanation(scopeKey, sourceHash, fullText, MODEL).catch(
            (err) => console.error("[rules/explain] cache write failed:", err),
          );
        }
        controller.close();
      } catch (err) {
        console.error("[rules/explain] stream error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Explain-Cache": "miss",
    },
  });
}
