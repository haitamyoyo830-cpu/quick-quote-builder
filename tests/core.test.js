// Optional developer tests. Run from the project folder with: node --test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core.js");

const TODAY = "2026-03-10";
const item = (quantity, unitPrice, description = "Work") => ({ id: `id-${quantity}-${unitPrice}`.replace(/[^A-Za-z0-9]/g, "-"), description, quantity, unitPrice });
const makeQuote = (fields) => ({ ...core.blankQuote(TODAY), items: [], ...fields });

test("amounts accept dots or commas and become whole hundredths", () => {
  assert.equal(core.parseAmount("12"), 1200);
  assert.equal(core.parseAmount("12.5"), 1250);
  assert.equal(core.parseAmount("1250,75"), 125075);
  assert.equal(core.parseAmount(" 7 "), 700);
  assert.equal(core.parseAmount("3."), 300);
  for (const bad of ["", "-5", "1.234", "1,000.50", "abc", "1e3"]) {
    assert.equal(core.parseAmount(bad), null, bad);
  }
});

test("line totals avoid floating point errors and round to the cent", () => {
  assert.equal(core.lineTotal(item("3", "0.10")), 30);
  assert.equal(core.lineTotal(item("3", "19.99")), 5997);
  assert.equal(core.lineTotal(item("1.5", "33.33")), 5000); // 49.995 rounds up
  assert.equal(core.lineTotal(item("", "50")), 0);
  assert.equal(core.lineTotal(item("2", "oops")), 0);
});

test("a percentage discount comes off before tax", () => {
  const totals = core.calculateTotals(makeQuote({
    items: [item("2", "100"), item("1", "50.50")],
    discountType: "percent", discountValue: "10", taxRate: "20",
  }));
  assert.deepEqual(totals, { subtotal: 25050, discount: 2505, taxable: 22545, tax: 4509, total: 27054 });
});

test("a fixed discount can never push the total below zero", () => {
  const quote = makeQuote({ items: [item("1", "80")], discountType: "amount", discountValue: "100", taxRate: "10" });
  assert.deepEqual(core.calculateTotals(quote), { subtotal: 8000, discount: 8000, taxable: 0, tax: 0, total: 0 });
  assert.match(core.checkQuote(quote).discountValue, /larger than the subtotal/);
});

test("a blank quote has no errors and adds up to zero", () => {
  const quote = core.blankQuote(TODAY);
  assert.deepEqual(core.checkQuote(quote), {});
  assert.equal(core.calculateTotals(quote).total, 0);
  assert.equal(quote.dueDate, "2026-04-09");
});

test("each bad field is reported by name, and bad lines count as zero", () => {
  const good = item("2", "40");
  const bad = { id: "bad", description: "x".repeat(301), quantity: "0", unitPrice: "12.345" };
  const quote = makeQuote({
    items: [good, bad], issueDate: "2026-03-10", dueDate: "2026-03-01",
    discountType: "percent", discountValue: "150", taxRate: "abc",
  });
  assert.deepEqual(Object.keys(core.checkQuote(quote)).sort(), [
    "discountValue", "dueDate", "items.bad.description", "items.bad.quantity", "items.bad.unitPrice", "taxRate",
  ]);
  assert.equal(core.calculateTotals(quote).subtotal, 8000);
});

test("impossible dates are rejected", () => {
  const errors = core.checkQuote(makeQuote({ issueDate: "2026-02-30", dueDate: "2026-13-01" }));
  assert.deepEqual(Object.keys(errors).sort(), ["dueDate", "issueDate"]);
});

test("money is formatted for each supported currency", () => {
  assert.equal(core.formatMoney(123450, "USD"), "$1,234.50");
  assert.equal(core.formatMoney(123450, "EUR"), "€1,234.50");
  assert.match(core.formatMoney(123450, "MAD"), /^MAD\s1,234\.50$/);
  assert.deepEqual(core.CURRENCIES, ["USD", "EUR", "MAD"]);
});

test("quote numbers count up and keep their leading zeros", () => {
  assert.equal(core.nextNumber("Q-007"), "Q-008");
  assert.equal(core.nextNumber("INV-2026-099"), "INV-2026-100");
  assert.equal(core.nextNumber("Acme"), "Acme-2");
  assert.equal(core.nextNumber(""), "Q-001");
});

test("saved data round-trips, and damaged data throws", () => {
  const quote = makeQuote({ items: [item("2", "45.50", 'Quote " and, comma\nsecond line')], notes: "Zoë Ñandú" });
  assert.deepEqual(core.parseStored(core.serialize(quote), TODAY), quote);
  for (const raw of ["not json", "null", '{"version":2,"quote":{}}', '{"version":1,"quote":{"items":{}}}']) {
    assert.throws(() => core.parseStored(raw, TODAY));
  }
});

test("opened files resolve relative dates and refuse unknown options", () => {
  const read = (fields) => core.readQuote({ version: 1, quote: { items: [], ...fields } }, TODAY);
  const quote = read({ issueDate: "today", dueDate: "today+14", currency: "eur", kind: "invoice" });
  assert.equal(quote.issueDate, TODAY);
  assert.equal(quote.dueDate, "2026-03-24");
  assert.equal(quote.currency, "EUR");
  assert.equal(quote.kind, "Invoice");
  assert.throws(() => read({ currency: "GBP" }), /Unknown currency/);
  assert.throws(() => read({ discountType: "half" }), /Unknown discount type/);
});

test("repeated or unsafe line ids are replaced on open", () => {
  const quote = core.readQuote({ version: 1, quote: { items: [item("1", "5"), item("1", "5"), { id: "<b>", quantity: "1" }] } }, TODAY);
  assert.equal(new Set(quote.items.map((line) => line.id)).size, 3);
  assert.ok(quote.items.every((line) => /^[A-Za-z0-9-]+$/.test(line.id)));
});

test("file names are safe and follow the quote number", () => {
  assert.equal(core.fileName(makeQuote({ kind: "Invoice", number: "INV/2026 #4" })), "invoice-inv-2026-4.json");
});

test("the demo file opens cleanly and adds up", () => {
  const raw = fs.readFileSync(path.join(__dirname, "../sample-data/demo-quote.json"), "utf8");
  const quote = core.readQuote(JSON.parse(raw), TODAY);
  assert.deepEqual(core.checkQuote(quote), {});
  assert.equal(quote.items.length, 6);
  assert.equal(quote.issueDate, TODAY);
  assert.deepEqual(core.calculateTotals(quote), {
    subtotal: 309750, discount: 30975, taxable: 278775, tax: 22999, total: 301774,
  });
  assert.ok(quote.fromName.startsWith("Demo:") && quote.toName.startsWith("Demo:"));
});
