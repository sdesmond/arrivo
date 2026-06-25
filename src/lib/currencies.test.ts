import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CURRENCIES,
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
});
