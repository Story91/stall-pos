import { describe, expect, it } from "vitest";
import { batchIdFor, obligationBatchId } from "@/lib/close/agent";
import { obligationBatchId as pure } from "@/lib/close/batchId";

describe("obligationBatchId", () => {
  it("is 30 chars, deterministic, and shaped st-{s|b}-{25 hex}", () => {
    const id = obligationBatchId("biz-1", "shift", "0b7d1c3e-aaaa-bbbb-cccc-1234567890ab");
    expect(id).toHaveLength(30);
    expect(id).toMatch(/^st-[sb]-[0-9a-f]{25}$/);
    expect(obligationBatchId("biz-1", "shift", "0b7d1c3e-aaaa-bbbb-cccc-1234567890ab")).toBe(id);
  });

  it("differs per kind, per id and per business", () => {
    const a = obligationBatchId("biz-1", "shift", "x");
    expect(obligationBatchId("biz-1", "bill", "x")).not.toBe(a);
    expect(obligationBatchId("biz-1", "shift", "y")).not.toBe(a);
    expect(obligationBatchId("biz-2", "shift", "x")).not.toBe(a);
    expect(obligationBatchId("biz-1", "bill", "x")).toMatch(/^st-b-/);
    expect(a).toMatch(/^st-s-/);
  });

  it("is one implementation shared by the agent module", () => {
    expect(obligationBatchId).toBe(pure);
    const outcome = { obligation: { kind: "bill", id: "x" } } as never;
    expect(batchIdFor("biz-1", outcome)).toBe(pure("biz-1", "bill", "x"));
  });
});
