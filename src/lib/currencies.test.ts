import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  getCurrencySymbol,
  isSupportedCurrencyCode,
  listSupportedCurrencies,
  normalizeCurrencyCode,
} from "./currencies";

describe("currencies", () => {
  it("returns the current active Frankfurter currency list for server consumers", () => {
    const currencies = listSupportedCurrencies();
    const codes = currencies.map((currencyOption) => currencyOption.code);

    expect(currencies).toHaveLength(SUPPORTED_CURRENCIES.length);
    expect(currencies).toHaveLength(165);
    expect(codes).toContain("ALL");
    expect(codes).toContain("AUD");
    expect(codes).toContain("CNH");
    expect(codes).toContain("ZWG");
    expect(codes).not.toContain("BGN");
    expect(codes).not.toContain("CUC");
    expect(codes).not.toContain("XXX");
    expect(codes).not.toContain("ZWL");
  });

  it("normalizes user input before validation", () => {
    expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
    expect(normalizeCurrencyCode("")).toBeUndefined();
  });

  it("validates supported currency codes", () => {
    expect(isSupportedCurrencyCode("USD")).toBe(true);
    expect(isSupportedCurrencyCode("ALL")).toBe(true);
    expect(isSupportedCurrencyCode("CNH")).toBe(true);
    expect(isSupportedCurrencyCode("ZWG")).toBe(true);
    expect(isSupportedCurrencyCode("CUC")).toBe(false);
    expect(isSupportedCurrencyCode("XXX")).toBe(false);
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
