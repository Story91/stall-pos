"use client";

import { AG_GRID_LOCALE_EN, AG_GRID_LOCALE_ES, AG_GRID_LOCALE_PL } from "@ag-grid-community/locale";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type IRowNode,
  type ProcessCellForExportParams,
  type ValueGetterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  rowMatchesView,
  totalsOf,
  type HistoryRow,
  type HistoryStatus,
  type HistoryView,
  type ViewColumn,
} from "@/lib/historyView";
import type { Messages } from "@/lib/i18n";
import { useLanguage, useT } from "@/lib/i18n/useT";
import type { Language } from "@/lib/parse/schema";
import { clockTime, formatCents, plainAmount, shortDate } from "@/lib/sell/format";

ModuleRegistry.registerModules([AllCommunityModule]);

const GRID_LOCALES = { en: AG_GRID_LOCALE_EN, es: AG_GRID_LOCALE_ES, pl: AG_GRID_LOCALE_PL } satisfies Record<
  Language,
  Record<string, string>
>;

/** The app's street-signage palette applied through the AG Grid Theming API: ink header, marigold accents. */
const stallTheme = themeQuartz.withParams({
  browserColorScheme: "light",
  fontFamily: "var(--font-barlow), system-ui, sans-serif",
  fontSize: 16,
  headerFontSize: 15,
  headerFontWeight: 700,
  backgroundColor: "#ffffff",
  foregroundColor: "#000000",
  accentColor: "#000000",
  borderColor: "#d4d4d4",
  headerBackgroundColor: "#000000",
  headerTextColor: "#ffffff",
  headerCellHoverBackgroundColor: "#262626",
  oddRowBackgroundColor: "#fafafa",
  rowHoverColor: "#fff1c7",
  selectedRowBackgroundColor: "#fff1c7",
  pinnedRowBackgroundColor: "#ffb703",
  pinnedRowFontWeight: 700,
  pinnedRowBorder: { width: 2, color: "#000000" },
  pinnedColumnBorder: { width: 2, color: "#000000" },
  wrapperBorder: { width: 2, color: "#000000" },
  wrapperBorderRadius: 16,
  rowHeight: 60,
  headerHeight: 48,
  cellHorizontalPadding: 10,
  iconSize: 18,
});

type GridRow = HistoryRow & { netCents?: number };

const TOTAL_ID = "__total";
// One signed amount right after who/what, so a 375 px phone shows money without scrolling sideways;
// separate In and Out (with their number filters) follow for a wider screen.
const COLUMN_ORDER = ["at", "who", "amount", "kind", "method", "status", "inCents", "outCents"] as const;

const STATUS_STYLE: Record<HistoryStatus, string> = {
  paid: "bg-wash text-ink",
  paid_cash: "bg-wash text-ink",
  PENDING: "border-2 border-ink text-ink",
  SUCCESS: "bg-ink text-paper",
  FAILED: "bg-ink text-marigold",
  UNCLAIMED: "bg-marigold text-ink",
};
const WARN: ReadonlySet<HistoryStatus> = new Set(["FAILED", "UNCLAIMED"]);

/** "2026-11-04" as a Date at local midnight: what AG Grid's date filter compares against. */
function localMidnight(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** "14:05" in the business timezone, for the CSV (spreadsheets sort it as text). */
function clock24(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(
    new Date(iso),
  );
}

function isTotal(node: IRowNode<GridRow> | null | undefined): boolean {
  return node?.rowPinned === "bottom";
}

function WarnGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor">
      <path d="M12 2 1 21h22L12 2zm-1 7h2v6h-2V9zm0 8h2v2h-2v-2z" />
    </svg>
  );
}

function buildColumns(t: Messages, language: Language, tz: string | undefined): ColDef<GridRow>[] {
  const h = t.history;
  const money = (colId: "inCents" | "outCents"): ColDef<GridRow> => ({
    colId,
    field: colId,
    headerName: h.columns[colId],
    width: 86,
    // Narrow enough that a 375 px phone shows both In and Out; the filter lives in the menu.
    suppressHeaderFilterButton: true,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    // The owner thinks in dollars: "greater than 20" means $20.00.
    filterValueGetter: (p: ValueGetterParams<GridRow>) => (p.data ? p.data[colId] / 100 : null),
    valueFormatter: (p) =>
      typeof p.value === "number" && (p.value !== 0 || isTotal(p.node)) ? formatCents(p.value) : "",
    cellClass: "money text-xl",
    cellClassRules:
      colId === "outCents"
        ? { "line-through text-graphite": (p) => p.data?.status === "FAILED" && !isTotal(p.node) }
        : undefined,
    tooltipValueGetter: (p) => (p.data?.status === "FAILED" && colId === "outCents" ? h.failedNote : undefined),
  });

  const columns: ColDef<GridRow>[] = [
    {
      colId: "at",
      field: "at",
      headerName: h.columns.at,
      pinned: "left",
      width: 96,
      // Room for the header word; the date filter stays in the column menu.
      suppressHeaderFilterButton: true,
      sort: "desc",
      filter: "agDateColumnFilter",
      filterValueGetter: (p) => (p.data ? localMidnight(p.data.date) : null),
      filterParams: {
        comparator: (filterDate: Date, cellValue: Date | null) =>
          cellValue === null ? -1 : cellValue.getTime() - filterDate.getTime(),
      },
      getQuickFilterText: (p) => (p.data ? `${shortDate(p.data.date, language)} ${p.data.date}` : ""),
      cellRenderer: (p: ICellRendererParams<GridRow>) =>
        isTotal(p.node) ? (
          <span className="font-display text-xl font-extrabold uppercase">{h.total}</span>
        ) : p.data ? (
          <div className="flex h-full flex-col justify-center leading-tight">
            <span className="text-sm text-graphite">{shortDate(p.data.date, language)}</span>
            <span className="font-semibold">{clockTime(p.data.at, tz, language)}</span>
          </div>
        ) : null,
    },
    {
      colId: "kind",
      field: "kind",
      headerName: h.columns.kind,
      width: 112,
      filter: "agTextColumnFilter",
      filterValueGetter: (p) => (p.data ? h.kind[p.data.kind] : ""),
      getQuickFilterText: (p) => (p.data ? h.kind[p.data.kind] : ""),
      valueFormatter: (p) => (p.data && !isTotal(p.node) ? h.kind[p.data.kind] : ""),
      cellRenderer: (p: ICellRendererParams<GridRow>) =>
        p.data && !isTotal(p.node) ? (
          <span className="flex items-center gap-2 font-semibold">
            <span
              aria-hidden
              className={`size-3 shrink-0 ${p.data.kind === "sale" ? "rounded-full bg-marigold ring-2 ring-ink" : "rotate-45 bg-ink"}`}
            />
            {h.kind[p.data.kind]}
          </span>
        ) : null,
    },
    {
      colId: "who",
      headerName: h.columns.who,
      flex: 1,
      minWidth: 140,
      // The totals row keeps one row id, so its value must change for the cell to redraw the new net.
      valueGetter: (p) =>
        !p.data ? "" : isTotal(p.node) ? `${p.data.inCents}/${p.data.outCents}` : (p.data.who ?? p.data.items),
      filter: "agTextColumnFilter",
      filterValueGetter: (p) =>
        p.data ? [p.data.who ?? "", p.data.items, p.data.invoiceNumber ?? ""].join(" ") : "",
      getQuickFilterText: (p) =>
        p.data ? [p.data.who ?? "", p.data.items, p.data.invoiceNumber ?? ""].join(" ") : "",
      tooltipValueGetter: (p) => (p.data && !isTotal(p.node) ? p.data.items : undefined),
      cellRenderer: (p: ICellRendererParams<GridRow>) => {
        const row = p.data;
        if (!row) return null;
        if (isTotal(p.node)) {
          return (
            <div className="flex h-full flex-col justify-center leading-tight">
              <span className="money">{h.columns.inCents} {formatCents(row.inCents)}</span>
              <span className="money">{h.columns.outCents} {formatCents(row.outCents)}</span>
            </div>
          );
        }
        const top = row.kind === "payout" ? (row.who ?? t.payouts.unknownPayee) : row.items;
        const bottom = row.kind === "payout" ? row.items : row.invoiceNumber;
        return (
          <div className="flex h-full min-w-0 flex-col justify-center leading-tight">
            <span className="truncate font-semibold">{top}</span>
            {bottom && <span className="truncate text-sm text-graphite">{bottom}</span>}
          </div>
        );
      },
    },
    {
      colId: "method",
      field: "method",
      headerName: h.columns.method,
      width: 112,
      filter: "agTextColumnFilter",
      filterValueGetter: (p) => (p.data ? h.method[p.data.method] : ""),
      getQuickFilterText: (p) => (p.data ? h.method[p.data.method] : ""),
      valueFormatter: (p) => (p.data && !isTotal(p.node) ? h.method[p.data.method] : ""),
    },
    {
      colId: "status",
      field: "status",
      headerName: h.columns.status,
      width: 140,
      filter: "agTextColumnFilter",
      filterValueGetter: (p) => (p.data ? h.status[p.data.status] : ""),
      getQuickFilterText: (p) => (p.data ? h.status[p.data.status] : ""),
      valueFormatter: (p) => (p.data && !isTotal(p.node) ? h.status[p.data.status] : ""),
      cellRenderer: (p: ICellRendererParams<GridRow>) =>
        p.data && !isTotal(p.node) ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-base font-bold leading-6 ${STATUS_STYLE[p.data.status]}`}
          >
            {WARN.has(p.data.status) && <WarnGlyph />}
            {h.status[p.data.status]}
          </span>
        ) : null,
    },
    {
      colId: "amount",
      headerName: h.columns.amount,
      width: 104,
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      // Signed: a sale adds, a payout takes away. The totals row shows the net.
      valueGetter: (p) =>
        !p.data ? null : isTotal(p.node) ? (p.data.netCents ?? 0) : p.data.inCents - p.data.outCents,
      filterValueGetter: (p: ValueGetterParams<GridRow>) => (p.data ? (p.data.inCents - p.data.outCents) / 100 : null),
      valueFormatter: (p) => {
        if (typeof p.value !== "number") return "";
        const sign = p.value < 0 ? "−" : isTotal(p.node) ? "" : "+";
        return `${sign}${formatCents(Math.abs(p.value))}`;
      },
      cellClass: "money text-xl",
      cellClassRules: {
        "line-through text-graphite": (p) => p.data?.status === "FAILED" && !isTotal(p.node),
        "text-graphite": (p) => typeof p.value === "number" && p.value < 0 && !isTotal(p.node),
      },
      tooltipValueGetter: (p) => (p.data?.status === "FAILED" ? h.failedNote : undefined),
    },
    money("inCents"),
    money("outCents"),
  ];
  // Money sits right after who/what so a phone shows it without scrolling sideways.
  return COLUMN_ORDER.map((id) => columns.find((column) => column.colId === id)!);
}

type Props = {
  rows: HistoryRow[];
  tz?: string;
  view: HistoryView | null;
  search: string;
  loading: boolean;
  fileName: string;
  /** The rows left after every filter (AI view, column filters, search), whenever they change. */
  onVisibleRows(rows: HistoryRow[]): void;
};

/**
 * The ledger on AG Grid Community: sortable, filterable columns, a quick search,
 * an AI view applied as an external filter plus sort, a pinned totals row that
 * follows the filters, and CSV export of exactly what is on screen.
 */
export function HistoryGrid({ rows, tz, view, search, loading, fileName, onVisibleRows }: Props) {
  const t = useT();
  const language = useLanguage();
  const [api, setApi] = useState<GridApi<GridRow> | null>(null);
  const viewRef = useRef<HistoryView | null>(view);
  const reportRef = useRef(onVisibleRows);

  useEffect(() => {
    reportRef.current = onVisibleRows;
  }, [onVisibleRows]);

  const columnDefs = useMemo(() => buildColumns(t, language, tz), [t, language, tz]);
  const defaultColDef = useMemo<ColDef<GridRow>>(
    () => ({ sortable: true, resizable: true, filter: true, minWidth: 80, suppressMovable: true }),
    [],
  );

  const isExternalFilterPresent = useCallback(() => viewRef.current !== null, []);
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<GridRow>) => (node.data && viewRef.current ? rowMatchesView(node.data, viewRef.current) : true),
    [],
  );

  // Totals and the summary always describe what passes the filters, so the AI
  // answer, a column filter and the search box all agree with the bottom row.
  const recompute = useCallback((gridApi: GridApi<GridRow>) => {
    const visible: HistoryRow[] = [];
    gridApi.forEachNodeAfterFilter((node) => {
      if (node.data && !node.group) visible.push(node.data);
    });
    const totals = totalsOf(visible);
    const totalRow: GridRow = {
      id: TOTAL_ID,
      kind: "sale",
      date: "",
      at: "",
      who: null,
      items: "",
      method: "paypal",
      status: "paid",
      inCents: totals.inCents,
      outCents: totals.outCents,
      netCents: totals.netCents,
      taxCents: 0,
      tipCents: 0,
      invoiceNumber: null,
    };
    gridApi.setGridOption("pinnedBottomRowData", visible.length > 0 ? [totalRow] : []);
    reportRef.current(visible);
  }, []);

  // A new AI view replaces any hand-set column filters and sort, then re-filters.
  useEffect(() => {
    viewRef.current = view;
    if (!api) return;
    if (view) api.setFilterModel(null);
    const sort: { colId: ViewColumn; sort: "asc" | "desc" } = view?.sort
      ? { colId: view.sort.column, sort: view.sort.direction }
      : { colId: "at", sort: "desc" };
    api.applyColumnState({ state: [sort], defaultState: { sort: null } });
    api.onFilterChanged();
  }, [api, view]);

  const exportCsv = () => {
    if (!api) return;
    const h = t.history;
    api.exportDataAsCsv({
      fileName,
      processCellCallback: (p: ProcessCellForExportParams<GridRow>) => {
        const row = p.node?.data;
        if (!row) return "";
        const total = isTotal(p.node);
        switch (p.column.getColId() as ViewColumn) {
          case "at":
            return total ? h.total : `${row.date} ${clock24(row.at, tz)}`;
          case "kind":
            return total ? "" : h.kind[row.kind];
          case "who":
            if (total) return h.net(plainSigned(row.netCents ?? 0));
            return row.kind === "payout"
              ? `${row.who ?? t.payouts.unknownPayee}: ${row.items}`
              : [row.items, row.invoiceNumber].filter(Boolean).join(" · ");
          case "method":
            return total ? "" : h.method[row.method];
          case "status":
            return total ? "" : h.status[row.status];
          case "inCents":
          case "outCents": {
            const cents = row[p.column.getColId() as "inCents" | "outCents"];
            return cents === 0 && !total ? "" : plainAmount(cents);
          }
          default:
            return p.formatValue(p.value);
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="h-[62dvh] min-h-[26rem] w-full" role="region" aria-label={t.history.gridLabel}>
        <AgGridReact<GridRow>
          // Remount on a language change: the grid reads localeText once.
          key={language}
          theme={stallTheme}
          localeText={GRID_LOCALES[language]}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => `${p.data.kind}-${p.data.id}`}
          quickFilterText={search}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          loading={loading}
          tooltipShowDelay={300}
          animateRows
          suppressDragLeaveHidesColumns
          onGridReady={(event: GridReadyEvent<GridRow>) => setApi(event.api)}
          onModelUpdated={(event) => recompute(event.api)}
        />
      </div>
      <button
        type="button"
        onClick={exportCsv}
        disabled={!api || rows.length === 0}
        className="flex min-h-14 items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-paper text-xl font-bold disabled:opacity-40"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        {t.history.exportCsv}
      </button>
    </div>
  );
}

/** "-12.50" / "12.50": the net can go below zero when payouts beat sales. */
function plainSigned(cents: number): string {
  return cents < 0 ? `-${plainAmount(-cents)}` : plainAmount(cents);
}
