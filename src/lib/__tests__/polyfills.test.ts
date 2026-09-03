import { describe, it, expect } from "vitest";
import "../polyfills";

describe("Web Crypto Polyfill", () => {
  it("garante que crypto.randomUUID() está sempre definido e retorna UUID v4 válido", () => {
    expect(typeof crypto.randomUUID).toBe("function");
    const uuid = crypto.randomUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
