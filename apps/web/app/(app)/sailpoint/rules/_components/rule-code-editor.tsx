"use client";

import * as React from "react";

import { highlightBeanShell } from "./beanshell-highlight";

/** Nearest ancestor that actually scrolls vertically (the drawer body). */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Editable BeanShell editor (#352) — the v1 highlight primitive made
 * editable, per the epic #350 decision (no new editor framework). A
 * transparent `<textarea>` is layered over a syntax-highlighted `<pre>`
 * that paints the same tokens as the read-only `RuleCodePanel`. The
 * textarea owns the caret + selection (visible) while its glyphs are
 * `color: transparent`, so the user sees the highlighted layer behind.
 *
 * Both layers share identical font / line-height / padding and
 * `white-space: pre-wrap`, so wrapped lines land in the same place and the
 * overlay stays in register without scroll-syncing gymnastics. The drawer
 * body owns the vertical scroll; this block grows with its content.
 *
 * Tab inserts two spaces (BeanShell convention here) rather than moving
 * focus, so the editor behaves like a code field.
 */
export function RuleCodeEditor({
  value,
  onChange,
  hasErrors = false,
  ariaLabel = "Rule source code",
  initialCaretLine,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Paint a red ring when server-side validation failed. */
  hasErrors?: boolean;
  ariaLabel?: string;
  /** 1-based line to focus + place the caret on at mount (fix-in-editor, #363). */
  initialCaretLine?: number;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  // Trailing newline keeps the highlighted layer at least as tall as the
  // textarea when the buffer ends on a blank line (so the caret has room).
  const html = React.useMemo(
    () => highlightBeanShell(value) + "\n",
    [value],
  );

  // On open via "fix in editor", drop the caret at the start of the target
  // line and scroll it into view. Runs once on mount — `initialCaretLine` is
  // fixed for the editor's lifetime (the drawer remounts it per fix).
  //
  // The textarea grows with its content (overflow hidden); the *drawer body*
  // is the scroll container. So we can't scroll the textarea — we walk up to
  // the nearest scrollable ancestor and scroll it via bounding rects (robust
  // regardless of which element is the offsetParent), in a rAF so the layout
  // has settled after mount.
  React.useEffect(() => {
    if (!initialCaretLine) return;
    const ta = taRef.current;
    if (!ta) return;
    const offset =
      value.split("\n").slice(0, initialCaretLine - 1).join("\n").length +
      (initialCaretLine > 1 ? 1 : 0);
    ta.focus();
    ta.setSelectionRange(offset, offset);

    requestAnimationFrame(() => {
      const scroller = findScrollParent(ta);
      if (!scroller) return;
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 18;
      const taTop = ta.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const caretTop = scroller.scrollTop + taTop + (initialCaretLine - 1) * lineHeight;
      scroller.scrollTop = Math.max(0, caretTop - scroller.clientHeight / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart, selectionEnd } = ta;
      const next =
        value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
      onChange(next);
      // Restore caret just after the inserted indent on the next tick.
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 2;
      });
    }
  }

  const shared =
    "m-0 min-h-[12rem] w-full whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed";

  return (
    <div
      className={
        "relative overflow-hidden rounded-md bg-neutral-900 ring-1 " +
        (hasErrors ? "ring-rose-500/70" : "ring-neutral-700")
      }
    >
      <pre
        aria-hidden
        className={shared + " pointer-events-none text-neutral-200"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label={ariaLabel}
        className={
          shared +
          " absolute inset-0 resize-none overflow-hidden border-0 bg-transparent text-transparent caret-neutral-100 outline-none focus:ring-0"
        }
      />
    </div>
  );
}
