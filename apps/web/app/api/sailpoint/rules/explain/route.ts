import { headers } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

import { auth } from "@/lib/auth";
import {
  getCachedExplanation,
  hashSourceCode,
  saveCachedExplanation,
} from "@/lib/explain-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Anthropic client (lazy singleton) ─────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
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

function buildUserContent(
  type: string,
  signature: RuleSignature | null | undefined,
  sourceCode: string,
  sourceAnalysis: SourceAnalysisSummary | null | undefined,
): Anthropic.MessageParam["content"] {
  // Static rule context block — eligible for prompt caching because this
  // content is identical on every re-explain of the same rule source.
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

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: ruleContext,
      // Prompt-cache the static rule context: same source → same hash → same
      // cached prefix, so repeated explains of the same rule skip input
      // tokens entirely.
      cache_control: { type: "ephemeral" },
    } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
  ];

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
      content.push({
        type: "text",
        text: `Static analysis facts (ground truth from local lexer):\n${facts.map((f) => `  - ${f}`).join("\n")}`,
        cache_control: { type: "ephemeral" },
      } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } });
    }
  }

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
 * generated by Claude Sonnet 4.6. Responses are cached in libsql keyed by
 * the SHA-256 of `sourceCode` — identical source never re-calls Claude.
 *
 * Request body:
 *   `{ type, sourceCode, signature?, sourceAnalysis? }`
 *
 * Privacy / data-egress:
 *   The `sourceCode` field is tenant BeanShell and is sent to Anthropic.
 *   This route is intentionally gated behind explicit user action (the
 *   "Explain with AI" button) and MUST NOT be called automatically on page
 *   load. The one-time data-egress notice is enforced client-side (epic #377).
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

  // Cache hit — stream the cached explanation without calling Claude
  const sourceHash = hashSourceCode(sourceCode);
  try {
    const cached = await getCachedExplanation(scopeKey, sourceHash);
    if (cached) {
      return streamCachedText(cached);
    }
  } catch (err) {
    // Cache read failure is non-fatal — fall through to Claude
    console.error("[rules/explain] cache read failed:", err);
  }

  // Stream from Claude
  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: buildUserContent(type, signature, sourceCode, sourceAnalysis),
      },
    ],
  });

  const encoder = new TextEncoder();
  let fullText = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
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
    cancel() {
      stream.abort();
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
