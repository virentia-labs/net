import { scope } from "@virentia/core";
import { query } from "@virentia/net-core";
import { ScopeProvider } from "@virentia/react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import { useQuery } from "../lib/index";

function wrapperFor(appScope: ReturnType<typeof scope>) {
  return ({ children }: { children: ReactNode }) =>
    createElement(ScopeProvider, { scope: appScope }, children);
}

describe("useQuery", () => {
  test("exposes data/pending and a scope-bound run", async () => {
    const userQuery = query({ handler: async (id: string) => `user:${id}` });
    const app = scope();

    const { result } = renderHook(() => useQuery(userQuery), { wrapper: wrapperFor(app) });

    expect(result.current.data).toBeNull();
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await result.current.run("42");
    });

    await waitFor(() => expect(result.current.data).toBe("user:42"));
    expect(result.current.error).toBeNull();
  });

  test("surfaces error and clears it via reset", async () => {
    const failing = query({
      handler: async (): Promise<string> => {
        throw new Error("boom");
      },
    });
    const app = scope();

    const { result } = renderHook(() => useQuery(failing), { wrapper: wrapperFor(app) });

    await act(async () => {
      await result.current.run(undefined as never).catch(() => {});
    });

    await waitFor(() => expect((result.current.error as Error)?.message).toBe("boom"));

    await act(async () => {
      await result.current.reset();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
