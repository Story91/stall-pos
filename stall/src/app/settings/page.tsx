"use client";

import { BusinessForm } from "@/components/settings/BusinessForm";
import { ResetDemo } from "@/components/settings/ResetDemo";
import { LanguagePicker } from "@/components/sell/LanguagePicker";
import { ErrorBox, Screen, ScreenHeader, SectionTitle } from "@/components/ui";
import { useSettings } from "@/hooks/useSettings";
import type { CatalogRow, PayeeRow } from "@/lib/owner/types";
import { daysAgo } from "@/lib/dates";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { writeLanguage } from "@/lib/sell/languageStore";
import { formatCents } from "@/lib/sell/format";

const th = "border-b-2 border-ink px-2 py-2 text-left text-base font-semibold whitespace-nowrap";
const td = "border-b border-rule px-2 py-3 align-top text-lg";

export default function SettingsPage() {
  const s = useSettings();
  const t = useT();
  const language = useLanguage();

  return (
    <Screen>
      <ScreenHeader title={t.settings.title} detail={s.business?.name ?? " "} />
      {s.loadError && <ErrorBox message={s.loadError} onRetry={s.reload} />}

      <section aria-labelledby="business" className="flex flex-col gap-3">
        <SectionTitle id="business">{t.settings.business}</SectionTitle>
        {s.business ? (
          <BusinessForm key={`${s.business.name}-${s.business.taxRate}`} business={s.business} onSave={s.saveBusiness} />
        ) : (
          !s.loadError && <div aria-busy className="skeleton h-48 rounded-2xl bg-wash" />
        )}
      </section>

      <section aria-labelledby="languages" className="flex flex-col gap-3">
        <SectionTitle id="languages">{t.settings.languages}</SectionTitle>
        <LanguagePicker value={language} onChange={writeLanguage} />
        <p className="text-lg">{t.settings.languagesHint}</p>
      </section>

      <section aria-labelledby="catalog" className="flex flex-col gap-3">
        <SectionTitle id="catalog">{t.settings.menu}</SectionTitle>
        <p className="text-lg text-graphite">{t.settings.menuHint}</p>
        {s.catalog && <CatalogTable items={s.catalog} />}
      </section>

      <section aria-labelledby="payees" className="flex flex-col gap-3">
        <SectionTitle id="payees">{t.settings.payees}</SectionTitle>
        <p className="text-lg text-graphite">{t.settings.payeesHint}</p>
        {s.payees && <PayeesTable payees={s.payees} />}
      </section>

      <section aria-labelledby="export" className="flex flex-col gap-3">
        <SectionTitle id="export">{t.settings.export}</SectionTitle>
        <p className="text-lg text-graphite">{t.settings.exportHint}</p>
        {s.business ? (
          <ExportLinks today={s.business.today} />
        ) : (
          !s.loadError && <div aria-busy className="skeleton h-12 rounded-2xl bg-wash" />
        )}
      </section>

      <section aria-labelledby="reset" className="flex flex-col gap-3">
        <SectionTitle id="reset">{t.settings.reset}</SectionTitle>
        <ResetDemo onReset={s.resetDemo} />
      </section>
    </Screen>
  );
}

function ExportLinks({ today }: { today: string }) {
  const t = useT();
  const monthStart = `${today.slice(0, 8)}01`;
  const last30Start = daysAgo(today, 29);
  const links = [
    { key: "month", label: t.settings.monthToDate, from: monthStart, to: today },
    { key: "last30", label: t.settings.last30, from: last30Start, to: today },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <li key={link.key}>
          <a
            className="text-lg font-semibold underline"
            href={`/api/export?from=${link.from}&to=${link.to}`}
            download
          >
            {t.settings.exportRange(link.label, link.from, link.to)}
          </a>
        </li>
      ))}
    </ul>
  );
}

function CatalogTable({ items }: { items: CatalogRow[] }) {
  const t = useT();
  const c = t.settings.catalog;
  if (items.length === 0) return <p className="text-lg">{c.empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{c.item}</th>
            <th className={th}>{c.aliases}</th>
            <th className={`${th} text-right`}>{c.price}</th>
            <th className={th}>{c.taxed}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={`${td} font-semibold`}>{item.name}</td>
              <td className={`${td} text-graphite`}>{item.aliases.join(", ") || c.none}</td>
              <td className={`${td} money text-right`}>
                {item.defaultPriceCents === null ? c.learning : formatCents(item.defaultPriceCents)}
              </td>
              <td className={td}>{item.taxable ? t.common.yes : t.common.no}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayeesTable({ payees }: { payees: PayeeRow[] }) {
  const t = useT();
  const c = t.settings.people;
  if (payees.length === 0) return <p className="text-lg">{c.empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{c.name}</th>
            <th className={th}>{c.role}</th>
            <th className={`${th} text-right`}>{c.dayRate}</th>
            <th className={`${th} text-right`}>{c.maxDay}</th>
            <th className={th}>{c.autoPay}</th>
            <th className={th}>{c.email}</th>
          </tr>
        </thead>
        <tbody>
          {payees.map((p) => (
            <tr key={p.id}>
              <td className={`${td} font-semibold`}>{p.name}</td>
              <td className={td}>{p.role === "helper" ? t.common.helper : t.common.supplier}</td>
              <td className={`${td} money text-right`}>
                {p.dailyRateCents === null ? c.byBill : formatCents(p.dailyRateCents)}
              </td>
              <td className={`${td} money text-right`}>{formatCents(p.maxPerDayCents)}</td>
              <td className={td}>{p.autoPay ? t.common.yes : c.asksYou}</td>
              <td className={`${td} whitespace-nowrap text-graphite`}>{p.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
