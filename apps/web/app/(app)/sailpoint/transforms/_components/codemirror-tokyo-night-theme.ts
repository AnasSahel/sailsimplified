/**
 * CodeMirror 6 theme + syntax highlight tuned to match the Tokyo Night
 * palette used by `CodeFrame` / `CodeViewer` / `RuleCodeEditor` (#421).
 *
 * The chrome around the editor is dark `#0d1117`; CM6's built-in `dark`
 * theme renders the body on `#282c34`, leaving a visible seam. This
 * theme aligns the editor surface to `#0d1117` and the token colours to
 * the same `highlightJson` / `highlightBeanShell` family.
 *
 * Returns a single `Extension` (array of theme + syntax highlighting) so
 * callers can drop it into their `extensions` list and skip the
 * `theme="dark"` prop of `@uiw/react-codemirror`.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

const BG = "#0d1117";
const FG = "#c0caf5";
const GUTTER_FG = "#3b4261";
const SELECTION = "#283457";
const ACTIVE_LINE = "rgba(255,255,255,0.03)";
const BORDER = "#21262d";

const KEYWORD = "#7aa2f7";
const TYPE = "#f7768e";
const STRING = "#9ece6a";
const NUMBER = "#ff9e64";
const COMMENT = "#6b7280";
const PROPERTY = "#7aa2f7";

const tokyoNightTheme = EditorView.theme(
  {
    "&": {
      color: FG,
      backgroundColor: BG,
    },
    ".cm-content": {
      caretColor: FG,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: FG,
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: SELECTION,
      },
    ".cm-activeLine": {
      backgroundColor: ACTIVE_LINE,
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: FG,
    },
    ".cm-gutters": {
      backgroundColor: BG,
      color: GUTTER_FG,
      border: "none",
      borderRight: `1px solid ${BORDER}`,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "12px",
      paddingRight: "8px",
    },
    ".cm-foldGutter .cm-gutterElement": {
      color: GUTTER_FG,
    },
    ".cm-tooltip": {
      backgroundColor: "#161b22",
      border: `1px solid ${BORDER}`,
      color: FG,
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: SELECTION,
      color: FG,
    },
    ".cm-panels": {
      backgroundColor: "#161b22",
      color: FG,
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(122,162,247,0.25)",
      outline: `1px solid ${KEYWORD}`,
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "rgba(247,118,142,0.18)",
      outline: "none",
    },
  },
  { dark: true },
);

const tokyoNightSyntax = HighlightStyle.define([
  { tag: t.keyword, color: KEYWORD },
  { tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: KEYWORD },
  { tag: [t.bool, t.null, t.atom], color: NUMBER },
  { tag: t.number, color: NUMBER },
  { tag: [t.string, t.special(t.string)], color: STRING },
  { tag: t.regexp, color: STRING },
  { tag: [t.escape, t.character], color: NUMBER },
  { tag: [t.propertyName, t.attributeName], color: PROPERTY },
  { tag: [t.typeName, t.className, t.namespace], color: TYPE },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: PROPERTY },
  { tag: [t.variableName, t.labelName], color: FG },
  { tag: [t.operator, t.derefOperator, t.punctuation, t.separator, t.bracket], color: FG },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: COMMENT, fontStyle: "italic" },
  { tag: [t.heading, t.strong], color: KEYWORD, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: KEYWORD, textDecoration: "underline" },
  { tag: t.invalid, color: TYPE },
]);

export const tokyoNightCodeMirror: Extension = [
  tokyoNightTheme,
  syntaxHighlighting(tokyoNightSyntax),
];
