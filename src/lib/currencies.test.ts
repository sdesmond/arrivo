import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  getCurrencySymbol,
  isSupportedCurrencyCode,
  listSupportedCurrencies,
  normalizeCurrencyCode,
} from "./currencies";

describe("currencies", () => {
  it("returns country currencies that Frankfurter v2 supports today and back to January 1, 2020", () => {
    const currencies = listSupportedCurrencies();
    const codes = currencies.map((currencyOption) => currencyOption.code);

    expect(currencies).toHaveLength(SUPPORTED_CURRENCIES.length);
    expect(currencies).toHaveLength(151);
    expect(codes).toContain("AED");
    expect(codes).toContain("ALL");
    expect(codes).toContain("AUD");
    expect(codes).toContain("CAD");
    expect(codes).toContain("GEL");
    expect(codes).toContain("GBP");
    expect(codes).toContain("GNF");
    expect(codes).toContain("ZMW");
    expect(codes).not.toContain("CNH");
    expect(codes).not.toContain("MRO");
    expect(codes).not.toContain("XAU");
    expect(codes).not.toContain("XDR");
  });

  it("normalizes user input before validation", () => {
    expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
    expect(normalizeCurrencyCode("")).toBeUndefined();
  });

  it("validates supported currency codes", () => {
    expect(isSupportedCurrencyCode("USD")).toBe(true);
    expect(isSupportedCurrencyCode("GBP")).toBe(true);
    expect(isSupportedCurrencyCode("ALL")).toBe(true);
    expect(isSupportedCurrencyCode("AED")).toBe(true);
    expect(isSupportedCurrencyCode("ZMW")).toBe(true);
    expect(isSupportedCurrencyCode("CNH")).toBe(false);
    expect(isSupportedCurrencyCode("XAU")).toBe(false);
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
