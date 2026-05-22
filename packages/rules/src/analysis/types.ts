/**
 * `SourceAnalysis` — the structured facts a single pass over a connector
 * rule's BeanShell `sourceCode` produces. It is the **shared foundation**:
 *
 *   - the source detectors (#361 correctness, #362 perf/hygiene) read it,
 *   - epic B's rule→transform migration advisor reuses the same facts (its
 *     intent classifier doesn't reinvent an engine — that's why this model is
 *     kept general, not detector-shaped).
 *
 * Everything carries a `line` + char `start` so a finding can deep-link into
 * the editor (fix-in-editor, #363). Offsets index the raw `script` string.
 *
 * Heuristic by contract: built from a token stream + brace depth, not a parse
 * tree (see `lexer.ts`). Facts are best-effort signals, not a sound analysis —
 * detectors phrase findings as "likely", and a false positive is a tolerable
 * smell, never a thrown error.
 */
import type { Token } from "./lexer.ts";

/** A method invocation: `receiver.method(...)`, a bare `method(...)`, or `new Type(...)`. */
export type ApiCall = {
  /** The identifier immediately before `(` — the method (or constructed type). */
  method: string;
  /** The dotted receiver chain, e.g. `context` in `context.getObjectByName(...)`. Empty for a bare call or constructor. */
  receiver: string;
  /** Best-effort full callee: `receiver.method`, or `method` when bare. */
  qualified: string;
  /** `true` when preceded by `new` (a constructor, not a method call). */
  isConstructor: boolean;
  line: number;
  start: number;
  /** Brace depth at the call site (interior of a block is `> 0`). */
  depth: number;
};

/** A loop and the char range of its body (so an API call can be tested for containment). */
export type Loop = {
  kind: "for" | "while" | "do";
  /** Line of the loop keyword. */
  line: number;
  /** Char offset where the body begins (the `{`, or the first token of a brace-less single-statement body). */
  bodyStart: number;
  /** Char offset one past the body end (after the matching `}`, or the terminating `;`). */
  bodyEnd: number;
  /** `true` when the body is a single statement with no braces. */
  braceless: boolean;
};

/** Classification of a string literal for the hardcoded-IDs / secrets detector. */
export type LiteralClass = "id" | "secret" | "string";

export type StringLiteral = {
  /** The string contents with surrounding quotes stripped (escapes left as-is). */
  value: string;
  class: LiteralClass;
  line: number;
  start: number;
};

/**
 * A dereference (`variable.something`) of a local whose value came from a
 * method call (a potentially-null origin) with no `!= null` / `== null` guard
 * seen between the assignment and the dereference. Heuristic — the null-safety
 * detector phrases it as a likely NPE risk, not a proof.
 */
export type NullDeref = {
  variable: string;
  /** Line of the unguarded dereference. */
  line: number;
  start: number;
  /** Line where `variable` was assigned from a call. */
  originLine: number;
  /**
   * Best-effort qualified name of the call the value came from
   * (e.g. `context.getObjectByName`, `Instant.now`). The null-safety detector
   * uses this to fire only for calls that actually return null (ISC lookups) —
   * keeping the analysis general while the nullable-call *policy* lives in the
   * detector, not here.
   */
  originCall: string;
};

/** A declared local and how many times it is referenced after its declaration (0 ⇒ unused). */
export type LocalVar = {
  name: string;
  line: number;
  start: number;
  references: number;
};

/** A statement that ends control flow in its block — anything after it at the same depth is unreachable. */
export type Terminator = {
  kind: "return" | "throw" | "break" | "continue";
  line: number;
  start: number;
  depth: number;
};

/** Coarse control-flow shape — enough for dead-code reasoning and B's complexity heuristics. */
export type ControlFlow = {
  /** Deepest brace nesting reached. */
  maxDepth: number;
  /** Number of branch points (`if` + `case`) — a rough cyclomatic proxy. */
  branches: number;
  terminators: ReadonlyArray<Terminator>;
};

/**
 * The complete structured view of one connector rule's source. `tokens` is
 * exposed so detectors that need raw adjacency (e.g. unreachable-code scans
 * after a terminator) work off the same stream rather than re-lexing.
 */
export type SourceAnalysis = {
  /** The analysed script, verbatim (so consumers can slice snippets by offset). */
  script: string;
  /** 1-based count of lines. */
  lineCount: number;
  tokens: ReadonlyArray<Token>;
  apiCalls: ReadonlyArray<ApiCall>;
  loops: ReadonlyArray<Loop>;
  literals: ReadonlyArray<StringLiteral>;
  nullDerefs: ReadonlyArray<NullDeref>;
  locals: ReadonlyArray<LocalVar>;
  controlFlow: ControlFlow;
};
