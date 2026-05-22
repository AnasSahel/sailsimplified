"use client";

import * as React from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AlertCircle, GitBranch } from "lucide-react";

import "@xyflow/react/dist/style.css";

import { cn } from "@/lib/utils";

import { TypePill } from "../../../_components/type-pill";
import type { SelectableTransform } from "./types";

/**
 * Mini-graph for the Definition tab's "Depends on" section (#328).
 *
 * Renders a 1-hop directed graph: `current` at the top, each direct
 * `reference` target as a child below, with arrows. Click a child →
 * pivot the drawer to that transform. Missing references render in a
 * rose-tinted card to mirror the v2.0 text-list fallback behavior.
 *
 * Scoped intentionally to 1 hop, not the full graph: the dedicated
 * `transform-graph.tsx` already covers the deep-tree view if needed.
 * Here we want a quick visual at a glance, fast to parse without
 * scrolling.
 *
 * Cycle safety: a transform that references back to its parent shows
 * up as a regular node — navigating to it loads ITS own 1-hop deps,
 * which would include the parent. The drawer simply re-renders, no
 * recursion involved.
 *
 * Layout: vertical (top → bottom) via dagre. ReactFlow's `fitView`
 * auto-scales to keep everything visible in the ~440px-wide drawer.
 */

const NODE_W = 156;
const NODE_H = 48;
const HEIGHT = 260;

export type DependsOnGraphProps = {
  current: SelectableTransform;
  /** Direct downstream transform IDs (deduped, 1-hop only). */
  deps: ReadonlyArray<string>;
  /** Lookup for resolving a dep id → its full record (name/type). */
  transformsByName: ReadonlyMap<string, SelectableTransform>;
  /** Pivot the drawer to the clicked target id. */
  onNavigate: (targetId: string) => void;
};

type DepNodeData = {
  label: string;
  /** SailPoint transform type — drives the TypePill rendering. */
  type: string;
  /** True for the central node; non-clickable, highlighted border. */
  isCurrent: boolean;
  /** True when the referenced id doesn't exist in `transformsByName`. */
  isMissing?: boolean;
};

function layoutNodes(
  nodes: ReadonlyArray<{ id: string; data: DepNodeData }>,
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
): Node<DepNodeData>[] {
  const g = new dagre.graphlib.Graph();
  // TB: current on top, deps stacked horizontally below. dagre handles
  // breaking onto rows when there are too many siblings — though we
  // clamp at 6 above which we fall back to the text list.
  g.setGraph({ rankdir: "TB", ranksep: 48, nodesep: 16, edgesep: 8 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "depNode",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: n.data,
    } satisfies Node<DepNodeData>;
  });
}

function NodeCard({ data }: NodeProps<Node<DepNodeData>>) {
  const Icon = data.isMissing ? AlertCircle : GitBranch;
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 shadow-sm transition-colors",
        data.isCurrent
          ? "border-foreground ring-2 ring-foreground/20"
          : data.isMissing
            ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
            : "hover:border-foreground/40",
      )}
      title={
        data.isMissing
          ? `${data.label} — reference missing`
          : `${data.label} · ${data.type}`
      }
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />
      <Icon
        className={cn(
          "h-3 w-3 shrink-0",
          data.isMissing
            ? "text-rose-700 dark:text-rose-300"
            : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-mono text-[10px] font-medium leading-tight",
            data.isMissing && "text-rose-900 dark:text-rose-100",
          )}
        >
          {data.label}
        </p>
        {!data.isMissing && (
          <p className="-mt-0.5 truncate">
            <TypePill type={data.type} />
          </p>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { depNode: NodeCard };

function GraphInner({
  current,
  deps,
  transformsByName,
  onNavigate,
}: DependsOnGraphProps) {
  const { nodes, edges } = React.useMemo(() => {
    const builtNodes: Array<{ id: string; data: DepNodeData }> = [
      {
        id: current.id,
        data: {
          label: current.name,
          type: current.type,
          isCurrent: true,
        },
      },
    ];
    const builtEdges: Array<{ id: string; source: string; target: string }> = [];

    for (const refId of deps) {
      const target = transformsByName.get(refId);
      // Synthetic id for missing references so dagre + reactflow still
      // get a unique key. We prefix with `missing:` to avoid collision
      // with a real transform id.
      const nodeId = target?.id ?? `missing:${refId}`;
      builtNodes.push({
        id: nodeId,
        data: {
          label: target?.name ?? refId,
          type: target?.type ?? "missing",
          isCurrent: false,
          isMissing: !target,
        },
      });
      builtEdges.push({
        id: `e-${current.id}-${nodeId}`,
        source: current.id,
        target: nodeId,
      });
    }

    return { nodes: builtNodes, edges: builtEdges };
  }, [current, deps, transformsByName]);

  const flowNodes = React.useMemo(() => layoutNodes(nodes, edges), [nodes, edges]);

  const flowEdges = React.useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "hsl(220 14% 50%)",
        },
        style: { stroke: "hsl(220 14% 64%)", strokeWidth: 1.5 },
      })),
    [edges],
  );

  function handleNodeClick(_e: React.MouseEvent, node: Node<DepNodeData>) {
    if (node.data.isCurrent || node.data.isMissing) return;
    onNavigate(node.id);
  }

  return (
    <div
      className="overflow-hidden rounded-md border bg-card"
      style={{ height: HEIGHT }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={1.2}
        // Pan/zoom kept on so the user can explore a denser graph if
        // the threshold ever drifts above the comfortable count.
      >
        <Background variant={BackgroundVariant.Dots} gap={14} size={1} />
      </ReactFlow>
    </div>
  );
}

export function DependsOnGraph(props: DependsOnGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

/**
 * Visual ceiling above which the mini-graph turns into a text list —
 * deep-tree exploration is out of scope here (dedicated full-page graph
 * exists in `transform-graph.tsx`). 6 was picked because a TB layout
 * with 6 siblings at NODE_W=156 fits readably in ~440px after `fitView`
 * scaling.
 */
export const DEPENDS_ON_GRAPH_THRESHOLD = 6;
