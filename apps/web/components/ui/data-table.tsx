"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type Row,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * `<DataTable>` — the single table primitive for list views.
 * See DESIGN.md §2.3 (table chrome) and §8 (responsive behavior).
 *
 * Owns: header chrome, sort icons (when sorting is enabled by the
 * consumer's columns), row hover, row selection state, clickable rows,
 * standard empty state. Density toggle is per-call-site.
 *
 * Column-level styling overrides go through TanStack's `meta`:
 *   ```ts
 *   { id: "accounts", header: "Accts", meta: { align: "right", widthClass: "w-16" }, ... }
 *   ```
 *
 * Cellule clic interactif (checkbox, kebab) doit `e.stopPropagation()`
 * pour ne pas déclencher rowHref. Le primitive le fait pour les colonnes
 * automatiques (_select, _actions) ; à toi de le faire dans les
 * `cell:` user-fournis qui contiennent des contrôles cliquables.
 *
 * ## Mobile collapse to cards (`< sm`)
 *
 * Pass `mobileLayout="cards"` to collapse the dense table to a stacked
 * card list below the `sm` breakpoint. Above `sm` the regular table is
 * unchanged. In card mode:
 *   - The first user-column renders as the card's primary block (no
 *     header label).
 *   - The remaining user-columns stack vertically as `header → value`
 *     pairs (or, if the column had `meta.mobileHidden: true`, are
 *     hidden — those fields are expected to be reachable via the row
 *     tap → detail page).
 *   - Selection checkbox (when `selection`) and `rowActions` kebab are
 *     anchored top-right of the card.
 *   - The card is clickable when `rowHref` is set, matching desktop
 *     behavior. Checkbox + kebab still `stopPropagation` so they don't
 *     navigate.
 *
 * Default is `mobileLayout="table"` for back-compat: existing call
 * sites keep the cramped-at-mobile behavior until they opt in.
 */

export type ColumnMeta = {
  align?: "left" | "center" | "right";
  widthClass?: string;
  /**
   * Hide this column in `mobileLayout="cards"` mode. Use for fields
   * that would clutter the card and remain reachable via the row's
   * detail page.
   */
  mobileHidden?: boolean;
};

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "center" | "right";
    widthClass?: string;
    mobileHidden?: boolean;
  }
}

export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  rowKey: (row: T) => string;
  density?: "dense" | "comfortable";
  /** Makes rows clickable — clicking anywhere on the row (other than
   * checkbox / kebab) navigates here. */
  rowHref?: (row: T) => string;
  /** Renders a trailing actions cell (e.g. `<RowActions>`). */
  rowActions?: (row: T) => React.ReactNode;
  /** Adds a leading checkbox column and tracks row selection internally. */
  selection?: boolean;
  /** Render slot above the table. Receives selection info to render
   * "N selected" / Process / Export. */
  toolbar?: (ctx: ToolbarCtx) => React.ReactNode;
  /** Body content when `data` is empty. */
  emptyState?: React.ReactNode;
  /** Initial sorting state. Sorting is enabled automatically whenever
   * any column has `enableSorting !== false` (TanStack's default). */
  defaultSorting?: SortingState;
  /**
   * How to render below the `sm` breakpoint.
   * - `"table"` (default): keep the table layout at every width.
   * - `"cards"`: collapse each row to a card. See DESIGN.md §8.
   */
  mobileLayout?: "table" | "cards";
  className?: string;
};

export type ToolbarCtx = {
  selectedIds: string[];
  total: number;
  clearSelection: () => void;
};

export function DataTable<T>({
  data,
  columns: userColumns,
  rowKey,
  density = "dense",
  rowHref,
  rowActions,
  selection = false,
  toolbar,
  emptyState,
  defaultSorting,
  mobileLayout = "table",
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const [rowSelection, setRowSelection] = React.useState<
    Record<string, boolean>
  >({});
  const [sorting, setSorting] = React.useState<SortingState>(
    defaultSorting ?? [],
  );

  const columns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    const cols: ColumnDef<T, unknown>[] = [];
    if (selection) {
      cols.push({
        id: "_select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={
              table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
            }
            onChange={(v) => table.toggleAllRowsSelected(v)}
            aria-label="Select all on page"
          />
        ),
        cell: ({ row }) => (
          <span
            onClick={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            <Checkbox
              checked={row.getIsSelected()}
              onChange={(v) => row.toggleSelected(v)}
              aria-label="Select row"
            />
          </span>
        ),
        enableSorting: false,
        meta: { widthClass: "w-10" },
      });
    }
    cols.push(...userColumns);
    if (rowActions) {
      cols.push({
        id: "_actions",
        header: () => null,
        cell: ({ row }) => (
          <span
            onClick={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            {rowActions(row.original)}
          </span>
        ),
        enableSorting: false,
        meta: { widthClass: "w-10" },
      });
    }
    return cols;
  }, [userColumns, selection, rowActions]);

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    enableRowSelection: selection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: rowKey,
  });

  const selectedIds = React.useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  const cellPad = density === "dense" ? "py-2" : "py-3";

  return (
    <div className={cn("space-y-2", className)}>
      {toolbar
        ? toolbar({ selectedIds, total: data.length, clearSelection })
        : null}
      {mobileLayout === "cards" ? (
        <div className="sm:hidden">
          {table.getRowModel().rows.length === 0 ? (
            <div className="rounded-lg border bg-card si-body py-8 px-4 text-center text-muted-foreground">
              {emptyState ?? "No results."}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {table.getRowModel().rows.map((row) => (
                <DataCard
                  key={row.id}
                  row={row}
                  rowHref={rowHref}
                  onNavigate={(href) => router.push(href)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
      <div
        className={cn(
          // `overflow-x-auto` lets the row-actions kebab stay reachable
          // when column content is wider than the viewport (e.g. long
          // connector names, ID-bearing sub-lines). The horizontal
          // scrollbar is preferable to clipping the action cell at the
          // right edge. `rounded-lg` is preserved via `border` +
          // `overflow-x-auto` (no `overflow-hidden`) — corners stay
          // clean because the table-row borders draw inside the box.
          "overflow-x-auto rounded-lg border bg-card",
          mobileLayout === "cards" && "hidden sm:block",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | ColumnMeta
                    | undefined;
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  const headerContent = header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      );
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "si-micro py-2 uppercase tracking-wider text-muted-foreground",
                        meta?.align === "right" && "text-right",
                        meta?.align === "center" && "text-center",
                        meta?.widthClass,
                      )}
                    >
                      {canSort && !header.isPlaceholder ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="group inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {headerContent}
                          <SortIcon dir={dir} />
                        </button>
                      ) : (
                        headerContent
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-16 si-body text-center text-muted-foreground"
                >
                  {emptyState ?? "No results."}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <DataRow
                  key={row.id}
                  row={row}
                  rowHref={rowHref}
                  cellPad={cellPad}
                  onNavigate={(href) => router.push(href)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ArrowUp className="h-3 w-3" aria-hidden />;
  if (dir === "desc") return <ArrowDown className="h-3 w-3" aria-hidden />;
  return (
    <ArrowUpDown
      aria-hidden
      className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50"
    />
  );
}

function DataRow<T>({
  row,
  rowHref,
  cellPad,
  onNavigate,
}: {
  row: Row<T>;
  rowHref?: (row: T) => string;
  cellPad: string;
  onNavigate: (href: string) => void;
}) {
  const href = rowHref?.(row.original);
  return (
    <TableRow
      data-state={row.getIsSelected() ? "selected" : undefined}
      className={cn(
        row.getIsSelected() && "bg-accent/40 hover:bg-accent/40",
        href &&
          "cursor-pointer hover:bg-[var(--si-row-hover)]",
      )}
      onClick={href ? () => onNavigate(href) : undefined}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
        return (
          <TableCell
            key={cell.id}
            className={cn(
              cellPad,
              meta?.align === "right" && "text-right",
              meta?.align === "center" && "text-center",
              meta?.widthClass,
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/**
 * Mobile card layout for a row. The first non-system cell renders as
 * the card's primary block; the rest stack as `header → value` pairs.
 * `_select` and `_actions` cells (added by the primitive) are pulled
 * out and anchored to the top-right of the card.
 */
function DataCard<T>({
  row,
  rowHref,
  onNavigate,
}: {
  row: Row<T>;
  rowHref?: (row: T) => string;
  onNavigate: (href: string) => void;
}) {
  const href = rowHref?.(row.original);
  const cells = row.getVisibleCells();

  const selectCell = cells.find((c) => c.column.id === "_select");
  const actionsCell = cells.find((c) => c.column.id === "_actions");
  const contentCells = cells.filter(
    (c) =>
      c.column.id !== "_select" &&
      c.column.id !== "_actions" &&
      !(c.column.columnDef.meta as ColumnMeta | undefined)?.mobileHidden,
  );

  const [primary, ...rest] = contentCells;

  const interactive = Boolean(href);

  return (
    <li>
      <div
        role={interactive ? "link" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? () => onNavigate(href!) : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNavigate(href!);
                }
              }
            : undefined
        }
        data-state={row.getIsSelected() ? "selected" : undefined}
        className={cn(
          "rounded-lg border bg-card p-4",
          row.getIsSelected() && "border-primary/40 bg-accent/30",
          interactive &&
            "cursor-pointer transition-colors hover:bg-[var(--si-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {primary
              ? flexRender(
                  primary.column.columnDef.cell,
                  primary.getContext(),
                )
              : null}
          </div>
          {(selectCell || actionsCell) && (
            <div className="flex shrink-0 items-center gap-1">
              {selectCell
                ? flexRender(
                    selectCell.column.columnDef.cell,
                    selectCell.getContext(),
                  )
                : null}
              {actionsCell
                ? flexRender(
                    actionsCell.column.columnDef.cell,
                    actionsCell.getContext(),
                  )
                : null}
            </div>
          )}
        </div>
        {rest.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            {rest.map((cell) => {
              const meta = cell.column.columnDef.meta as
                | ColumnMeta
                | undefined;
              const headerDef = cell.column.columnDef.header;
              const label =
                typeof headerDef === "string" ? headerDef : null;
              return (
                <div key={cell.id} className="flex min-w-0 flex-col gap-0.5">
                  {label ? (
                    <dt className="si-micro uppercase tracking-wider text-muted-foreground">
                      {label}
                    </dt>
                  ) : null}
                  <dd
                    className={cn(
                      "si-body min-w-0",
                      meta?.align === "right" && "text-right",
                      meta?.align === "center" && "text-center",
                    )}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </li>
  );
}
