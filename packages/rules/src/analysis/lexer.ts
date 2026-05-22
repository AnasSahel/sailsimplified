/**
 * Minimal BeanShell / Java lexer — the structural foundation of `analyzeSource`.
 *
 * Connector rules are BeanShell scripts (Java syntax, loosely typed). We do
 * **not** build a statement-tree AST: heuristic detectors (deprecated calls,
 * API-in-loop, dead code) only need a token stream plus brace nesting, and
 * epic B's intent classifier consumes the same stream. A full parser would be
 * more than either consumer needs and a maintenance liability against the
 * permissive grammar BeanShell actually accepts.
 *
 * What this gives every consumer:
 *   - a flat `Token[]` (identifiers, keywords, literals, operators, comments),
 *   - 1-based line numbers + char offsets for fix-in-editor location,
 *   - brace `depth` per token, so block structure is recoverable without a
 *     parse tree (matching braces share a depth — see `depth` below).
 *
 * Pure: `tokenize(script)` has no I/O and no state beyond the returned array.
 */

/** Lexical category. Whitespace is dropped; comments are kept (epic B reads them). */
export type TokenKind =
  | "identifier"
  | "keyword"
  | "number"
  | "string"
  | "char"
  | "punct"
  | "comment";

export type Token = {
  kind: TokenKind;
  /** Raw source text of the token (quotes/escapes preserved for literals). */
  value: string;
  /** 1-based line of the token's first character. */
  line: number;
  /** 0-based char offset of the token start in the script. */
  start: number;
  /** Char offset one past the token end. */
  end: number;
  /**
   * Brace nesting depth. A `{` carries the depth of the block it opens *from*
   * (the outer depth); the next token is one deeper. Its matching `}` carries
   * the same depth as its `{`, so the first `}` after an open brace with an
   * equal depth is the match. Interior tokens sit at `braceDepth + 1`.
   */
  depth: number;
};

/**
 * Java + BeanShell reserved words. Primitive type names are included so a
 * `int x = ...` declaration is distinguishable from an `obj.method()` call.
 * `var` is BeanShell-loose typing; included for completeness.
 */
const KEYWORDS = new Set<string>([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "var",
]);

/** Multi-char operators, longest first so the scanner is greedy-correct. */
const OPERATORS = [
  ">>>=", "<<=", ">>=", ">>>", "...", "->", "::",
  "==", "!=", "<=", ">=", "&&", "||", "++", "--",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>",
];

const isIdentStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
const isIdentPart = (c: string) => isIdentStart(c) || (c >= "0" && c <= "9");
const isDigit = (c: string) => c >= "0" && c <= "9";

/**
 * Tokenize a BeanShell/Java source string. Resilient by design: an unknown
 * character is emitted as a one-char `punct` token rather than throwing, so a
 * malformed script still yields a usable (if imperfect) stream — detectors
 * degrade, they don't crash.
 */
export function tokenize(script: string): Token[] {
  const tokens: Token[] = [];
  const n = script.length;
  let i = 0;
  let line = 1;
  let depth = 0;

  const push = (kind: TokenKind, start: number, end: number, tokenDepth: number) => {
    tokens.push({ kind, value: script.slice(start, end), line, start, end, depth: tokenDepth });
  };

  while (i < n) {
    const c = script[i];

    // Newlines / whitespace — track line, drop the token.
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") { i++; continue; }

    // Line comment.
    if (c === "/" && script[i + 1] === "/") {
      const start = i;
      i += 2;
      while (i < n && script[i] !== "\n") i++;
      push("comment", start, i, depth);
      continue;
    }

    // Block comment (handles newlines inside).
    if (c === "/" && script[i + 1] === "*") {
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && !(script[i] === "*" && script[i + 1] === "/")) {
        if (script[i] === "\n") line++;
        i++;
      }
      i = Math.min(i + 2, n);
      tokens.push({
        kind: "comment",
        value: script.slice(start, i),
        line: startLine,
        start,
        end: i,
        depth,
      });
      continue;
    }

    // String literal.
    if (c === '"') {
      const start = i;
      i++;
      while (i < n && script[i] !== '"') {
        if (script[i] === "\\") i++; // skip escaped char
        if (script[i] === "\n") line++;
        i++;
      }
      i = Math.min(i + 1, n); // closing quote
      push("string", start, i, depth);
      continue;
    }

    // Char literal.
    if (c === "'") {
      const start = i;
      i++;
      while (i < n && script[i] !== "'") {
        if (script[i] === "\\") i++;
        i++;
      }
      i = Math.min(i + 1, n);
      push("char", start, i, depth);
      continue;
    }

    // Number (incl. hex, decimals, type suffixes).
    if (isDigit(c) || (c === "." && isDigit(script[i + 1] ?? ""))) {
      const start = i;
      if (c === "0" && (script[i + 1] === "x" || script[i + 1] === "X")) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(script[i])) i++;
      } else {
        while (i < n && /[0-9._]/.test(script[i])) i++;
        if (script[i] === "e" || script[i] === "E") {
          i++;
          if (script[i] === "+" || script[i] === "-") i++;
          while (i < n && isDigit(script[i])) i++;
        }
      }
      while (i < n && /[lLfFdD]/.test(script[i])) i++; // suffix
      push("number", start, i, depth);
      continue;
    }

    // Identifier / keyword.
    if (isIdentStart(c)) {
      const start = i;
      i++;
      while (i < n && isIdentPart(script[i])) i++;
      const word = script.slice(start, i);
      push(KEYWORDS.has(word) ? "keyword" : "identifier", start, i, depth);
      continue;
    }

    // Braces — adjust depth so matching braces share a depth.
    if (c === "{") {
      push("punct", i, i + 1, depth);
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth = Math.max(0, depth - 1);
      push("punct", i, i + 1, depth);
      i++;
      continue;
    }

    // Multi-char operator.
    let matched = false;
    for (const op of OPERATORS) {
      if (script.startsWith(op, i)) {
        push("punct", i, i + op.length, depth);
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single-char punctuation / operator / unknown — one token, never throw.
    push("punct", i, i + 1, depth);
    i++;
  }

  return tokens;
}
