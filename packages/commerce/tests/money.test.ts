import test from "node:test";
import assert from "node:assert/strict";
import { currencyDigits, majorAmount, maxMinorUnits, minorUnits } from "../src/catalog/money";

test("each currency uses its own minor units, not an assumed two decimals (#7)", () => {
  assert.deepEqual(["USD", "JPY", "KWD"].map(currencyDigits), [2, 0, 3]);
  assert.equal(minorUnits("19.99", "USD"), 1999);
  assert.equal(minorUnits("150", "USD"), 15000);
  assert.equal(minorUnits("1500.0", "JPY"), 1500, "Shopify writes yen with a trailing .0");
  assert.equal(minorUnits("2.5", "KWD"), 2500);
  assert.equal(minorUnits("0.29", "USD"), 29);
});

test("an amount finer than its currency, or not a decimal, is rejected", () => {
  for (const [amount, currency] of [
    ["1500.5", "JPY"],
    ["19.999", "USD"],
    ["-1", "USD"],
    ["1e3", "USD"],
    ["", "USD"],
  ]) {
    assert.throws(() => minorUnits(amount, currency), Error, `${amount} ${currency}`);
  }
});

test("a price ceiling rounds down to what the currency can express", () => {
  assert.equal(maxMinorUnits(19.999, "USD"), 1999);
  assert.equal(maxMinorUnits(19.9999, "USD"), 1999, "never rounds up to 20.00");
  assert.equal(maxMinorUnits(0.1 + 0.2, "USD"), 30);
  assert.equal(maxMinorUnits(1500.9, "JPY"), 1500);
  assert.equal(maxMinorUnits(100, "KWD"), 100000);
  assert.equal(maxMinorUnits(0, "USD"), 0);
  assert.equal(maxMinorUnits(1e21, "USD"), Number.MAX_SAFE_INTEGER);
});

test("minor units format back to the decimal Shopify filters expect", () => {
  assert.equal(majorAmount(1999, "USD"), "19.99");
  assert.equal(majorAmount(5, "USD"), "0.05");
  assert.equal(majorAmount(1500, "JPY"), "1500");
  assert.equal(majorAmount(2500, "KWD"), "2.500");
});
