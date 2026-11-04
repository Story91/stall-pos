import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { exportQuery, exportSalesCsv } from "@/lib/export";
import { toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

/** Paid sales between two business dates (inclusive) as a CSV download. */
export async function GET(request: Request): Promise<Response> {
  try {
    requireOwner(request);
    const query = exportQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    const csv = await exportSalesCsv(db, query);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stall-${query.from}_${query.to}.csv"`,
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}
