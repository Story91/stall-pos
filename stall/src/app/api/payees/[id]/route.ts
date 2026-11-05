import { db } from "@/db";
import { requireOwner } from "@/lib/auth";
import { maskEmail } from "@/lib/sell/format";
import { readJson, toResponse } from "@/lib/salesApi";
import { updatePayee } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Settings: change a person's day rate, daily limit or auto-pay. The close reads these as hard limits. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    requireOwner(request);
    const { id } = await ctx.params;
    const row = await updatePayee(db, id, await readJson(request));
    return Response.json({ ...row, email: maskEmail(row.email) });
  } catch (error) {
    return toResponse(error);
  }
}
