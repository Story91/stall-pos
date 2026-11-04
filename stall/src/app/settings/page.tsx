"use client";

import { BusinessForm } from "@/components/settings/BusinessForm";
import { ResetDemo } from "@/components/settings/ResetDemo";
import { ErrorBox, Screen, ScreenHeader, SectionTitle } from "@/components/ui";
import { useSettings } from "@/hooks/useSettings";
import type { CatalogRow, PayeeRow } from "@/lib/owner/types";
import { formatCents } from "@/lib/sell/format";

const th = "border-b-2 border-ink px-2 py-2 text-left text-base font-semibold whitespace-nowrap";
const td = "border-b border-rule px-2 py-3 align-top text-lg";

export default function SettingsPage() {
  const s = useSettings();

  return (
    <Screen>
      <ScreenHeader title="Settings" detail={s.business?.name ?? " "} />
      {s.loadError && <ErrorBox message={s.loadError} onRetry={s.reload} />}

      <section aria-labelledby="business" className="flex flex-col gap-3">
        <SectionTitle id="business">Business</SectionTitle>
        {s.business ? (
          <BusinessForm key={`${s.business.name}-${s.business.taxRate}`} business={s.business} onSave={s.saveBusiness} />
        ) : (
          !s.loadError && <div aria-busy className="skeleton h-48 rounded-2xl bg-wash" />
        )}
      </section>

      <section aria-labelledby="languages" className="flex flex-col gap-2">
        <SectionTitle id="languages">Languages</SectionTitle>
        <p className="text-lg">
          Stall understands orders and bills in English, Spanish and Polish. Pick the language on the
          Sell screen before you talk; the customer hears the total in that language.
        </p>
      </section>

      <section aria-labelledby="catalog" className="flex flex-col gap-3">
        <SectionTitle id="catalog">Menu</SectionTitle>
        <p className="text-lg text-graphite">Stall learns new items and prices from your sales.</p>
        {s.catalog && <CatalogTable items={s.catalog} />}
      </section>

      <section aria-labelledby="payees" className="flex flex-col gap-3">
        <SectionTitle id="payees">People and suppliers</SectionTitle>
        <p className="text-lg text-graphite">
          The agent pays these through PayPal at close, never more than the daily limit.
        </p>
        {s.payees && <PayeesTable payees={s.payees} />}
      </section>

      <section aria-labelledby="reset" className="flex flex-col gap-3">
        <SectionTitle id="reset">Start the demo over</SectionTitle>
        <ResetDemo onReset={s.resetDemo} />
      </section>
    </Screen>
  );
}

function CatalogTable({ items }: { items: CatalogRow[] }) {
  if (items.length === 0) return <p className="text-lg">No items yet. Ring up a sale and they appear here.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Item</th>
            <th className={th}>Also called</th>
            <th className={`${th} text-right`}>Price</th>
            <th className={th}>Taxed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={`${td} font-semibold`}>{item.name}</td>
              <td className={`${td} text-graphite`}>{item.aliases.join(", ") || "None"}</td>
              <td className={`${td} money text-right`}>
                {item.defaultPriceCents === null ? "Learning" : formatCents(item.defaultPriceCents)}
              </td>
              <td className={td}>{item.taxable ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayeesTable({ payees }: { payees: PayeeRow[] }) {
  if (payees.length === 0) return <p className="text-lg">No one to pay yet.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Role</th>
            <th className={`${th} text-right`}>Day rate</th>
            <th className={`${th} text-right`}>Max a day</th>
            <th className={th}>Auto-pay</th>
            <th className={th}>PayPal email</th>
          </tr>
        </thead>
        <tbody>
          {payees.map((p) => (
            <tr key={p.id}>
              <td className={`${td} font-semibold`}>{p.name}</td>
              <td className={td}>{p.role === "helper" ? "Helper" : "Supplier"}</td>
              <td className={`${td} money text-right`}>
                {p.dailyRateCents === null ? "By bill" : formatCents(p.dailyRateCents)}
              </td>
              <td className={`${td} money text-right`}>{formatCents(p.maxPerDayCents)}</td>
              <td className={td}>{p.autoPay ? "Yes" : "Asks you"}</td>
              <td className={`${td} whitespace-nowrap text-graphite`}>{p.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
