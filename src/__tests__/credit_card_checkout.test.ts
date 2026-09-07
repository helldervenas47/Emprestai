import { describe, it, expect } from "vitest";
import { detectCardBrand } from "@/components/billing/CreditCardPaymentForm";

describe("Credit Card Payment & Brand Detection", () => {
  it("detects Visa cards accurately", () => {
    expect(detectCardBrand("4111 1111 1111 1111")).toBe("Visa");
    expect(detectCardBrand("4000000000000000")).toBe("Visa");
  });

  it("detects Mastercard cards accurately", () => {
    expect(detectCardBrand("5105 1051 0510 5105")).toBe("Mastercard");
    expect(detectCardBrand("5555 5555 5555 5555")).toBe("Mastercard");
    expect(detectCardBrand("2221 0000 0000 0000")).toBe("Mastercard");
  });

  it("detects American Express cards accurately", () => {
    expect(detectCardBrand("3400 0000 0000 000")).toBe("American Express");
    expect(detectCardBrand("3700 0000 0000 000")).toBe("American Express");
  });

  it("detects Elo cards accurately", () => {
    expect(detectCardBrand("4011 7800 0000 0000")).toBe("Elo");
    expect(detectCardBrand("5067 0000 0000 0000")).toBe("Elo");
    expect(detectCardBrand("6504 0000 0000 0000")).toBe("Elo");
  });

  it("detects Hipercard cards accurately", () => {
    expect(detectCardBrand("6062 8200 0000 0000")).toBe("Hipercard");
    expect(detectCardBrand("3841 0000 0000 0000")).toBe("Hipercard");
  });

  it("returns empty string for unknown card brands", () => {
    expect(detectCardBrand("1234 5678 9012 3456")).toBe("");
    expect(detectCardBrand("")).toBe("");
  });
});
