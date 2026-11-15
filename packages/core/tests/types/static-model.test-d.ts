import type { Store } from "@virentia/core";
import { staticModel, type InstanceOf } from "@virentia/core/models";
import { mutation, query } from "../../lib";

const Editor = staticModel({ setup() { return {
  load: query({ handler: async (id: number) => ({ id }) }),
  save: mutation({ handler: async (name: string) => ({ name }) }),
}; } });
declare const editor: InstanceOf<typeof Editor>;
const result: Promise<{ id: number }> = editor.load(1);
const data: Store<{ id: number } | null> = editor.load.data;
const saved: Promise<{ name: string }> = editor.save("typed");
editor.load.refresh(); editor.load.reset();
// @ts-expect-error namespace binding preserves query input types
editor.load("1");
// @ts-expect-error namespace binding preserves mutation input types
editor.save(1);
// @ts-expect-error query data is still a readonly store
editor.load.data.value = { id: 2 };
void [result, data, saved];
