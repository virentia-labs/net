import { scope } from "@virentia/core";
import { query } from "@virentia/net-core";
import { provideScope } from "@virentia/vue";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, test } from "vitest";

import { useQuery, type UseQueryResult } from "../lib/index";

describe("useQuery", () => {
  test("exposes data as a ref and a scope-bound run", async () => {
    const userQuery = query({ handler: async (id: string) => `user:${id}` });
    const app = scope();

    let api!: UseQueryResult<string, string, unknown>;

    const Child = defineComponent({
      setup() {
        api = useQuery(userQuery);
        return () => h("div", String(api.data.value));
      },
    });
    const Parent = defineComponent({
      setup() {
        provideScope(app);
        return () => h(Child);
      },
    });

    const wrapper = mount(Parent);
    expect(api.data.value).toBeNull();
    expect(api.pending.value).toBe(false);

    await api.run("7");
    await flushPromises();

    expect(api.data.value).toBe("user:7");
    expect(wrapper.text()).toContain("user:7");
  });
});
