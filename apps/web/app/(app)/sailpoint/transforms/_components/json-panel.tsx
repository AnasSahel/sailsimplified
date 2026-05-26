"use client";

import { CodeViewer } from "../../../_components/code-viewer";

/**
 * Read-only JSON viewer for transform definitions — list-drawer (saved
 * transform) and editor-drawer (live draft).
 *
 * Thin wrapper around the shared `CodeViewer` (#414): the chrome (window
 * dots, language badge, line numbers, Copy button, lines/size footer) is
 * unified across all read-only code displays in the app.
 */
export function JsonPanel({ value }: { value: string }) {
  return <CodeViewer value={value} language="json" filename="transform.json" />;
}
