/**
 * `analyzeSource(script) → SourceAnalysis`.
 *
 * One lex + a handful of linear scans over the token stream. No parse tree:
 * structure is recovered from brace `depth` and small local lookaheads (see
 * `lexer.ts`). Every extracted fact is a heuristic signal carrying a line +
 * offset; downstream detectors decide severity and wording.
 *
 * Functional by house style: a top-level `analyzeSource` composing small pure
 * helpers, no class, no shared mutable state across calls.
 */
import { tokenize, type Token } from "./lexer.ts";
import type {
  ApiCall,
  ControlFlow,
  Loop,
  LocalVar,
  NullDeref,
  SourceAnalysis,
  StringLiteral,
  Terminator,
} from "./types.ts";

const PRIMITIVE_TYPES = new Set([
  "int", "boolean", "long", "double", "float", "char", "byte", "short", "void",
]);

const TERMINATOR_KEYWORDS = new Set(["return", "throw", "break", "continue"]);

/** Variable-name fragments that mark an assignment target / setter as secret-bearing. */
const SECRET_NAME = /pass(word|wd)?|secret|token|api[_-]?key|credential|priv(ate)?key|passphrase/i;

/** A 32-char ISC `cc`-style id, a UUID, or a long hex blob — treated as a hardcoded id. */
const ID_VALUE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Strip surrounding double-quotes from a string token's raw text. */
function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"')) {
    return raw.slice(1, raw.endsWith('"') ? -1 : undefined);
  }
  return raw;
}

/** Code tokens only (comments dropped) — paired with their index in the full stream. */
function codeTokensOf(tokens: ReadonlyArray<Token>): Token[] {
  return tokens.filter((t) => t.kind !== "comment");
}

/**
 * Find the char offset just past the body of a loop/branch header whose `(`
 * starts at code-token index `headerParenIdx`. Walks parens, then: if the next
 * token is `{`, returns just past the matching `}`; otherwise treats the body
 * as a single statement up to the next `;`.
 */
function bodyRangeAfterHeader(
  code: Token[],
  headerParenIdx: number,
): { bodyStart: number; bodyEnd: number; braceless: boolean } | null {
  let depthParen = 0;
  let i = headerParenIdx;
  for (; i < code.length; i++) {
    const v = code[i].value;
    if (code[i].kind === "punct" && v === "(") depthParen++;
    else if (code[i].kind === "punct" && v === ")") {
      depthParen--;
      if (depthParen === 0) { i++; break; }
    }
  }
  if (i >= code.length) return null;
  const first = code[i];
  if (first.kind === "punct" && first.value === "{") {
    const braceDepth = first.depth;
    for (let j = i + 1; j < code.length; j++) {
      if (code[j].kind === "punct" && code[j].value === "}" && code[j].depth === braceDepth) {
        return { bodyStart: first.start, bodyEnd: code[j].end, braceless: false };
      }
    }
    return { bodyStart: first.start, bodyEnd: code[code.length - 1].end, braceless: false };
  }
  // Braceless single-statement body: up to the next `;`.
  for (let j = i; j < code.length; j++) {
    if (code[j].kind === "punct" && code[j].value === ";") {
      return { bodyStart: first.start, bodyEnd: code[j].end, braceless: true };
    }
  }
  return { bodyStart: first.start, bodyEnd: code[code.length - 1].end, braceless: true };
}

/** Method/constructor invocations: identifier (or `new Type`) immediately before `(`. */
function extractApiCalls(code: Token[]): ApiCall[] {
  const calls: ApiCall[] = [];
  for (let i = 0; i < code.length; i++) {
    const t = code[i];
    const next = code[i + 1];
    if (t.kind !== "identifier" || !next || next.kind !== "punct" || next.value !== "(") {
      continue;
    }
    // Walk back over a `.`-separated receiver chain.
    const chain: string[] = [];
    let j = i - 1;
    while (j >= 1 && code[j].kind === "punct" && code[j].value === "." && code[j - 1].kind === "identifier") {
      chain.unshift(code[j - 1].value);
      j -= 2;
    }
    const isConstructor = j >= 0 && code[j].kind === "keyword" && code[j].value === "new";
    const receiver = chain.join(".");
    calls.push({
      method: t.value,
      receiver: isConstructor ? "" : receiver,
      qualified: receiver ? `${receiver}.${t.value}` : t.value,
      isConstructor,
      line: t.line,
      start: t.start,
      depth: t.depth,
    });
  }
  return calls;
}

/** `for` / `while` / `do` loops with their body char ranges. */
function extractLoops(code: Token[]): Loop[] {
  const loops: Loop[] = [];
  for (let i = 0; i < code.length; i++) {
    const t = code[i];
    if (t.kind !== "keyword") continue;
    if (t.value === "for" || t.value === "while") {
      // Header paren follows the keyword.
      const parenIdx = code[i + 1]?.value === "(" ? i + 1 : -1;
      if (parenIdx < 0) continue;
      const body = bodyRangeAfterHeader(code, parenIdx);
      if (body) loops.push({ kind: t.value, line: t.line, ...body });
    } else if (t.value === "do") {
      // Body starts right after `do`.
      const first = code[i + 1];
      if (!first) continue;
      if (first.kind === "punct" && first.value === "{") {
        const braceDepth = first.depth;
        for (let k = i + 2; k < code.length; k++) {
          if (code[k].kind === "punct" && code[k].value === "}" && code[k].depth === braceDepth) {
            loops.push({ kind: "do", line: t.line, bodyStart: first.start, bodyEnd: code[k].end, braceless: false });
            break;
          }
        }
      }
    }
  }
  return loops;
}

/** Classify + collect every string literal. */
function extractLiterals(code: Token[]): StringLiteral[] {
  const out: StringLiteral[] = [];
  for (let i = 0; i < code.length; i++) {
    const t = code[i];
    if (t.kind !== "string") continue;
    const value = unquote(t.value);

    // Secret if assigned to / passed into a secret-named target.
    // LHS:  name = "..."   →  code[i-1] === "=", code[i-2] identifier.
    // Arg:  setX("...")    →  code[i-1] === "(", code[i-2] identifier (method).
    const prev = code[i - 1];
    const target = code[i - 2];
    const isAssignedOrArg =
      prev && prev.kind === "punct" && (prev.value === "=" || prev.value === "(");
    const targetName =
      isAssignedOrArg && target && target.kind === "identifier" ? target.value : "";

    let cls: StringLiteral["class"] = "string";
    if (targetName && SECRET_NAME.test(targetName)) cls = "secret";
    else if (ID_VALUE.test(value.trim())) cls = "id";

    out.push({ value, class: cls, line: t.line, start: t.start });
  }
  return out;
}

/**
 * Unguarded dereferences of locals assigned from a call. For each `name = ...
 * call(...) ;`, mark `name` nullable; if a later `name.` appears with no
 * `name == null` / `name != null` guard between origin and use, flag it once.
 */
function extractNullDerefs(code: Token[]): NullDeref[] {
  type Origin = { line: number; offset: number };
  const nullableOrigin = new Map<string, Origin>();
  const guarded = new Set<string>();
  const out: NullDeref[] = [];
  const flagged = new Set<string>();

  for (let i = 0; i < code.length; i++) {
    const t = code[i];

    // Assignment from a call → nullable origin.
    if (t.kind === "punct" && t.value === "=" && code[i - 1]?.kind === "identifier"
        && code[i - 2]?.value !== "=" && code[i + 1]?.value !== "=") {
      const name = code[i - 1].value;
      // RHS up to `;` contains a *method* call? (identifier `(`, not `new X(`).
      // A constructor never returns null, so it does not make the LHS nullable.
      let hasCall = false;
      for (let j = i + 1; j < code.length && code[j].value !== ";"; j++) {
        if (code[j].kind === "identifier" && code[j + 1]?.kind === "punct" && code[j + 1]?.value === "("
            && code[j - 1]?.value !== "new") {
          hasCall = true;
          break;
        }
      }
      if (hasCall) {
        nullableOrigin.set(name, { line: code[i - 1].line, offset: t.start });
        guarded.delete(name);
        flagged.delete(name);
      }
      continue;
    }

    // Null guard: `name == null` / `name != null` / `null == name` / `null != name`.
    if (t.kind === "identifier" && nullableOrigin.has(t.value)) {
      const op = code[i + 1];
      const rhs = code[i + 2];
      if (op && (op.value === "==" || op.value === "!=") && rhs?.value === "null") {
        guarded.add(t.value);
        continue;
      }
    }
    if (t.kind === "keyword" && t.value === "null") {
      const op = code[i + 1];
      const rhs = code[i + 2];
      if (op && (op.value === "==" || op.value === "!=") && rhs?.kind === "identifier"
          && nullableOrigin.has(rhs.value)) {
        guarded.add(rhs.value);
        continue;
      }
    }

    // Dereference: `name.` — flag once if nullable, unguarded, not yet reported.
    if (t.kind === "identifier" && nullableOrigin.has(t.value) && !guarded.has(t.value)
        && !flagged.has(t.value)
        && code[i + 1]?.kind === "punct" && code[i + 1]?.value === ".") {
      const origin = nullableOrigin.get(t.value)!;
      if (t.start > origin.offset) {
        out.push({ variable: t.value, line: t.line, start: t.start, originLine: origin.line });
        flagged.add(t.value);
      }
    }
  }
  return out;
}

/** Declared locals + their post-declaration reference count (0 ⇒ unused). */
function extractLocals(code: Token[]): LocalVar[] {
  const declared: { name: string; line: number; start: number; declIdx: number }[] = [];
  for (let i = 0; i < code.length; i++) {
    const t = code[i];
    const name = code[i + 1];
    const after = code[i + 2];
    if (!name || name.kind !== "identifier" || !after) continue;
    const typedDecl =
      (t.kind === "identifier" || (t.kind === "keyword" && PRIMITIVE_TYPES.has(t.value)));
    const declarator =
      after.kind === "punct" && (after.value === "=" || after.value === ";" || after.value === ":");
    // Guard against `obj.method` (preceding `.`) and against control keywords.
    const prevDot = code[i - 1]?.kind === "punct" && code[i - 1]?.value === ".";
    if (typedDecl && declarator && !prevDot && !PRIMITIVE_TYPES.has(name.value)) {
      declared.push({ name: name.value, line: name.line, start: name.start, declIdx: i + 1 });
    }
  }
  return declared.map((d) => {
    let refs = 0;
    for (let k = 0; k < code.length; k++) {
      if (k !== d.declIdx && code[k].kind === "identifier" && code[k].value === d.name) refs++;
    }
    return { name: d.name, line: d.line, start: d.start, references: refs };
  });
}

/** Terminators + coarse control-flow shape. */
function extractControlFlow(code: Token[]): ControlFlow {
  const terminators: Terminator[] = [];
  let maxDepth = 0;
  let branches = 0;
  for (const t of code) {
    if (t.depth > maxDepth) maxDepth = t.depth;
    if (t.kind !== "keyword") continue;
    if (TERMINATOR_KEYWORDS.has(t.value)) {
      terminators.push({
        kind: t.value as Terminator["kind"],
        line: t.line,
        start: t.start,
        depth: t.depth,
      });
    } else if (t.value === "if" || t.value === "case") {
      branches++;
    }
  }
  return { maxDepth, branches, terminators };
}

export function analyzeSource(script: string): SourceAnalysis {
  const tokens = tokenize(script);
  const code = codeTokensOf(tokens);
  return {
    script,
    lineCount: script.length === 0 ? 0 : script.split("\n").length,
    tokens,
    apiCalls: extractApiCalls(code),
    loops: extractLoops(code),
    literals: extractLiterals(code),
    nullDerefs: extractNullDerefs(code),
    locals: extractLocals(code),
    controlFlow: extractControlFlow(code),
  };
}
