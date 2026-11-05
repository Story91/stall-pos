"use client";

import { useState } from "react";
import { AskBox } from "@/components/history/AskBox";
import { HistoryGrid } from "@/components/history/HistoryGrid";
import { ErrorBox, Screen, ScreenHeader } from "@/components/ui";
import { useHistory } from "@/hooks/useHistory";
import {
  describeView,
  historySummary,
  HISTORY_RANGES,
  rangeDates,
  type HistoryRow,
} from "@/lib/historyView";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { shortDate } from "@/lib/sell/format";

export default function HistoryPage() {
  const h = useHistory();
  const t = useT();
  const language = useLanguage();
  // What the grid shows after every filter; the sentence above it is built from these rows.
  const [visible, setVisible] = useState<HistoryRow[] | null>(null);

  const dates = h.business ? rangeDates(h.range, h.business.today) : null;
  const detail =
    h.business && dates
      ? `${dates.from === dates.to ? shortDate(dates.to, language) : `${shortDate(dates.from, language)} – ${shortDate(dates.to, language)}`}, ${h.business.name}`
      : " ";
  const rows = h.data?.rows ?? [];
  const firstLoad = !h.data && !h.loadError;

  return (
    <Screen>
      <ScreenHeader title={t.history.title} detail={detail} />

      <RangeChips value={h.range} onPick={h.pickRange} />

      <AskBox
        question={h.question}
        onQuestion={h.setQuestion}
        onAsk={h.ask}
        asking={h.asking}
        error={h.askError}
        mic={h.voice.mic}
        micSupported={h.voice.micSupported}
        onPressStart={h.voice.pressStart}
        onPressEnd={h.voice.pressEnd}
      />

      {h.loadError && <ErrorBox message={h.loadError} onRetry={h.reload} />}

      {firstLoad ? (
        <HistorySkeleton />
      ) : h.data && rows.length === 0 && !h.loading ? (
        <>
          {h.view && <ViewStrip chips={describeView(h.view, t)} onClear={h.clearView} />}
          <p className="rounded-2xl border-2 border-dashed border-ink p-4 text-lg">{t.history.empty}</p>
        </>
      ) : h.data ? (
        <section aria-labelledby="ledger" className="flex flex-col gap-3">
          <h2 id="ledger" className="sr-only">
            {t.history.gridLabel}
          </h2>
          {h.view && <ViewStrip chips={describeView(h.view, t)} onClear={h.clearView} />}
          <p aria-live="polite" className="font-display text-2xl font-bold leading-tight">
            {visible ? historySummary(visible, language) : " "}
          </p>
          <label className="flex flex-col gap-1 text-base font-medium">
            {t.history.search}
            <input
              type="search"
              value={h.search}
              onChange={(e) => h.setSearch(e.target.value)}
              placeholder={t.history.searchPlaceholder}
              autoComplete="off"
              className="min-h-14 w-full rounded-xl border-2 border-ink bg-paper px-3 text-lg focus:bg-marigold-soft focus:outline-none"
            />
          </label>
          <HistoryGrid
            rows={rows}
            tz={h.business?.tz}
            view={h.view}
            search={h.search}
            loading={h.loading}
            fileName={`${t.history.exportName}-${dates?.from ?? ""}_${dates?.to ?? ""}.csv`}
            onVisibleRows={setVisible}
          />
        </section>
      ) : null}
    </Screen>
  );
}

function RangeChips({ value, onPick }: { value: string; onPick(range: (typeof HISTORY_RANGES)[number]): void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t.history.rangeLabel} className="grid grid-cols-3 gap-2">
      {HISTORY_RANGES.map((range) => {
        const on = range === value;
        return (
          <button
            key={range}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(range)}
            className={`min-h-14 rounded-xl border-2 border-ink text-xl font-bold ${
              on ? "bg-ink text-paper" : "bg-paper text-ink active:bg-wash"
            }`}
          >
            {t.history.ranges[range]}
          </button>
        );
      })}
    </div>
  );
}

/** How the question was read, as chips the owner can check at a glance, and a way back to everything. */
function ViewStrip({ chips, onClear }: { chips: string[]; onClear(): void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-ink p-3">
      <p className="text-base font-semibold text-graphite">{t.history.ask.showing}</p>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip} className="rounded-full bg-marigold px-3 py-1 text-lg font-bold text-ink">
            {chip}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClear}
        className="min-h-12 self-start rounded-xl px-1 text-lg font-semibold underline underline-offset-4"
      >
        {t.history.ask.clear}
      </button>
    </div>
  );
}

function HistorySkeleton() {
  const t = useT();
  return (
    <div aria-busy aria-label={t.history.loading} className="flex flex-col gap-3">
      <div className="skeleton h-8 w-3/4 rounded-lg bg-wash" />
      <div className="skeleton h-14 rounded-xl bg-wash" />
      <div className="skeleton h-[26rem] rounded-2xl bg-wash" />
    </div>
  );
}
