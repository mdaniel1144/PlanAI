import { test as base, expect, type APIRequestContext } from "@playwright/test";
export type { Page, APIRequestContext } from "@playwright/test";
type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;
export const test = base.extend<object, { editorState: StorageState }>({
  editorState: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({
        baseURL: "http://127.0.0.1:4187",
        extraHTTPHeaders: { "X-Habitat-Request": "1" },
      });
      const response = await request.post("/api/auth/login", {
        data: {
          email: "editor@example.test",
          password: "Editor test passphrase 42!",
        },
      });
      expect(response.status()).toBe(200);
      await use(await request.storageState());
      await request.dispose();
    },
    { scope: "worker" },
  ],
  storageState: async ({ editorState }, use) => {
    await use(editorState);
  },
  request: async ({ playwright, baseURL, editorState }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: editorState,
      extraHTTPHeaders: { "X-Habitat-Request": "1" },
    });
    await use(request);
    await request.dispose();
  },
});
export { expect };
