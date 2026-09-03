/**
 * Regression tests for useAllClientDocumentCounts.
 *
 * Guards the P0 perf fix: ONE query for all document counts, plus
 * incremental realtime updates (no full refetch on the normal path).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---- Mocks ----------------------------------------------------------------

const AUTH = { user: { id: "owner-1" }, dataOwnerId: "owner-1" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => AUTH,
}));

type RealtimeHandler = (payload: any) => void;
const state: {
  rows: Array<{ client_id: string }>;
  selectCalls: number;
  eqFilters: string[];
  handler: RealtimeHandler | null;
  removedChannels: number;
} = { rows: [], selectCalls: 0, eqFilters: [], handler: null, removedChannels: 0 };

vi.mock("@/integrations/supabase/userClient", () => {
  const channel: any = {};
  channel.on = vi.fn((_evt: string, opts: any, cb: RealtimeHandler) => {
    state.handler = cb;
    state.eqFilters.push(opts.filter);
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);

  const query: any = {};
  query.select = vi.fn(() => { state.selectCalls++; return query; });
  query.eq = vi.fn(() => query);
  query.then = (resolve: any) => resolve({ data: state.rows, error: null });

  return {
    supabase: {
      from: vi.fn(() => query),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(() => { state.removedChannels++; }),
    },
  };
});

import { useAllClientDocumentCounts } from "@/features/clients/hooks/useAllClientDocumentCounts";

beforeEach(() => {
  state.rows = [];
  state.selectCalls = 0;
  state.eqFilters = [];
  state.handler = null;
  state.removedChannels = 0;
});
afterEach(() => vi.clearAllMocks());

function fire(payload: any) {
  if (!state.handler) throw new Error("realtime handler was not registered");
  act(() => state.handler!(payload));
}

describe("useAllClientDocumentCounts — initial load", () => {
  it("aggregates rows into per-client counts with a single select", async () => {
    state.rows = [
      { client_id: "a" }, { client_id: "a" }, { client_id: "a" },
      { client_id: "b" },
    ];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(result.current.counts.a).toBe(3));
    expect(result.current.counts.b).toBe(1);
    expect(result.current.counts.c).toBeUndefined();
    expect(state.selectCalls).toBe(1);
  });

  it("returns an empty map when no rows exist", async () => {
    state.rows = [];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(state.selectCalls).toBe(1));
    expect(result.current.counts).toEqual({});
  });

  it("filters realtime events by owner_id", async () => {
    renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(state.eqFilters.length).toBe(1));
    expect(state.eqFilters[0]).toBe("owner_id=eq.owner-1");
  });

  it("does not fetch when disabled=false", async () => {
    renderHook(() => useAllClientDocumentCounts(false));
    // one microtask cycle
    await Promise.resolve();
    expect(state.selectCalls).toBe(0);
  });
});

describe("useAllClientDocumentCounts — realtime INSERT", () => {
  it("increments only the affected client and does NOT refetch", async () => {
    state.rows = [{ client_id: "a" }];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(result.current.counts.a).toBe(1));
    const before = state.selectCalls;

    fire({ eventType: "INSERT", new: { client_id: "a" }, old: null });
    expect(result.current.counts.a).toBe(2);

    fire({ eventType: "INSERT", new: { client_id: "b" }, old: null });
    expect(result.current.counts.b).toBe(1);
    expect(result.current.counts.a).toBe(2);

    expect(state.selectCalls).toBe(before); // no full refetch
  });
});

describe("useAllClientDocumentCounts — realtime DELETE", () => {
  it("decrements and removes the entry once it hits zero", async () => {
    state.rows = [{ client_id: "a" }, { client_id: "a" }, { client_id: "b" }];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(result.current.counts.a).toBe(2));
    const before = state.selectCalls;

    fire({ eventType: "DELETE", old: { client_id: "a" }, new: null });
    expect(result.current.counts.a).toBe(1);
    fire({ eventType: "DELETE", old: { client_id: "a" }, new: null });
    expect(result.current.counts.a).toBeUndefined();
    // b was untouched
    expect(result.current.counts.b).toBe(1);
    expect(state.selectCalls).toBe(before);
  });

  it("deleting a client without docs does not throw or produce negatives", async () => {
    state.rows = [];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(state.selectCalls).toBe(1));
    fire({ eventType: "DELETE", old: { client_id: "ghost" }, new: null });
    expect(result.current.counts.ghost).toBeUndefined();
  });
});

describe("useAllClientDocumentCounts — realtime UPDATE", () => {
  it("moves the count when client_id changes", async () => {
    state.rows = [{ client_id: "a" }];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(result.current.counts.a).toBe(1));
    fire({ eventType: "UPDATE", old: { client_id: "a" }, new: { client_id: "b" } });
    expect(result.current.counts.a).toBeUndefined();
    expect(result.current.counts.b).toBe(1);
  });

  it("does not alter counts when client_id is unchanged", async () => {
    state.rows = [{ client_id: "a" }, { client_id: "a" }];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(result.current.counts.a).toBe(2));
    fire({ eventType: "UPDATE", old: { client_id: "a" }, new: { client_id: "a" } });
    expect(result.current.counts.a).toBe(2);
  });
});

describe("useAllClientDocumentCounts — payload fallback", () => {
  it("falls back to refetch when the payload has no ids", async () => {
    state.rows = [{ client_id: "a" }];
    const { result } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(result.current.counts.a).toBe(1));
    const before = state.selectCalls;

    // Missing new AND old ⇒ neither INSERT/DELETE/UPDATE branch matches ⇒ fallback refetch.
    state.rows = [{ client_id: "a" }, { client_id: "a" }];
    fire({ eventType: "INSERT", new: null, old: null });
    await waitFor(() => expect(state.selectCalls).toBe(before + 1));
    await waitFor(() => expect(result.current.counts.a).toBe(2));
  });
});

describe("useAllClientDocumentCounts — subscription lifecycle", () => {
  it("removes the channel on unmount", async () => {
    const { unmount } = renderHook(() => useAllClientDocumentCounts());
    await waitFor(() => expect(state.handler).not.toBeNull());
    expect(state.removedChannels).toBe(0);
    unmount();
    expect(state.removedChannels).toBe(1);
  });
});
