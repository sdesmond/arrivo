import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  getCurrencySymbol,
  isSupportedCurrencyCode,
  listSupportedCurrencies,
  normalizeCurrencyCode,
} from "./currencies";

describe("currencies", () => {
  it("returns a large ISO currency list for server consumers", () => {
    expect(listSupportedCurrencies()).toHaveLength(SUPPORTED_CURRENCIES.length);
  });

  it("normalizes user input before validation", () => {
    expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
    expect(normalizeCurrencyCode("")).toBeUndefined();
  });

  it("validates supported currency codes", () => {
    expect(isSupportedCurrencyCode("USD")).toBe(true);
    expect(isSupportedCurrencyCode("ZZZ")).toBe(false);
  });

  it("resolves currency symbols for known codes and falls back to the code for unrecognized ones", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("ZZZ")).toBe("ZZZ");
  });

  it("falls back to the code when Intl rejects a malformed currency code", () => {
    expect(getCurrencySymbol("INVALID")).toBe("INVALID");
  });
});
