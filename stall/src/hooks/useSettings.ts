"use client";

import { useCallback, useEffect, useState } from "react";
import { failureText, ownerCall, send } from "@/lib/owner/api";
import type { BusinessView, CatalogRow, PayeeRow } from "@/lib/owner/types";

export function useSettings() {
  const [business, setBusiness] = useState<BusinessView | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[] | null>(null);
  const [payees, setPayees] = useState<PayeeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    const calls = [
      ownerCall<BusinessView>("/api/business"),
      ownerCall<CatalogRow[]>("/api/catalog"),
      ownerCall<PayeeRow[]>("/api/payees"),
    ] as const;
    return Promise.all(calls).then(([biz, items, people]) => {
      const failed = [biz, items, people].find((r) => !r.ok);
      if (failed && !failed.ok) return setLoadError(failureText(failed));
      if (biz.ok) setBusiness(biz.data);
      if (items.ok) setCatalog(items.data);
      if (people.ok) setPayees(people.data);
      setLoadError(null);
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBusiness = async (patch: { name: string; taxRate: number }) => {
    const result = await ownerCall<BusinessView>("/api/business", send("PATCH", patch));
    if (!result.ok) return { ok: false as const, message: failureText(result) };
    setBusiness(result.data);
    return { ok: true as const };
  };

  const resetDemo = async () => {
    const result = await ownerCall("/api/reset-demo", send("POST"));
    if (!result.ok) return { ok: false as const, message: failureText(result) };
    await load();
    return { ok: true as const };
  };

  return { business, catalog, payees, loadError, reload: () => void load(), saveBusiness, resetDemo };
}
