// Rules with no page access: amounts, totals, dates, and the saved file format.
// The browser reads this as the global QuoteCore; the tests load it with require().
const QuoteCore = (() => {
  "use strict";

  const KINDS = ["Quote", "Invoice"];
  const CURRENCIES = ["USD", "EUR", "MAD"];
  const DISCOUNT_TYPES = ["percent", "amount"];
  const MAX_ITEMS = 100;

  const TEXT_FIELDS = {
    number: 40, fromName: 120, fromDetails: 1000, toName: 120, toDetails: 1000,
    taxLabel: 30, notes: 3000,
  };
  const DESCRIPTION_LENGTH = 300;

  // Money is kept in whole cents and quantities and rates in hundredths, so
  // 0.1 + 0.2 never turns into 0.30000000000000004 on a client's invoice.
  // These caps keep every multiplication inside JavaScript's exact integer range.
  const MAX_QUANTITY = 999999; // 9,999.99
  const MAX_PRICE = 99999999; // 999,999.99
  const MAX_PERCENT = 10000; // 100%

  // ---------- Dates (always YYYY-MM-DD, in the user's own time zone) ----------

  function toISO(date) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function fromISO(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function isRealDate(text) {
    // The round trip rejects dates such as 2026-02-30, which Date would roll into March.
    return /^(19|20|21)\d\d-\d\d-\d\d$/.test(text) && toISO(fromISO(text)) === text;
  }

  function addDays(iso, days) {
    const date = fromISO(iso);
    date.setDate(date.getDate() + days);
    return toISO(date);
  }

  // Lets a file say "today", "today+30", or "today-2" so demo data never goes stale.
  function resolveDate(text, today) {
    const match = /^today(?:\s*([+-])\s*(\d{1,4}))?$/i.exec(text);
    if (!match) return text;
    const days = Number(match[2] || 0);
    return addDays(today, match[1] === "-" ? -days : days);
  }

  // ---------- Amounts ----------

  // Reads "12", "12.5", or "12,50" as hundredths (1200, 1250, 1250).
  // Returns null for blanks, negatives, thousands separators, or more than 2 decimals.
  function parseAmount(text) {
    const match = /^(\d{1,9})(?:[.,](\d{0,2}))?$/.exec(String(text ?? "").replace(/\s/g, ""));
    if (!match) return null;
    return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  }

  // Rounds half up. Only ever called with positive numbers.
  const divideRounded = (value, by) => Math.round(value / by);

  function formatMoney(cents, currency, locale = "en-US") {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  }

  function formatHundredths(value, locale = "en-US") {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 100);
  }

  // ---------- Quotes ----------

  function newId() {
    // crypto.randomUUID is missing on plain-http pages; getRandomValues is not.
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function blankItem() {
    return { id: newId(), description: "", quantity: "1", unitPrice: "" };
  }

  function blankQuote(today) {
    return {
      kind: "Quote",
      number: "Q-001",
      issueDate: today,
      dueDate: addDays(today, 30),
      currency: "USD",
      fromName: "",
      fromDetails: "",
      toName: "",
      toDetails: "",
      items: [blankItem()],
      discountType: "percent",
      discountValue: "",
      taxLabel: "Tax",
      taxRate: "",
      notes: "",
    };
  }

  // Amount in cents for one line, or 0 while the line is incomplete.
  function lineTotal(item) {
    const quantity = parseAmount(item.quantity);
    const price = parseAmount(item.unitPrice);
    if (quantity === null || price === null || quantity > MAX_QUANTITY || price > MAX_PRICE) return 0;
    return divideRounded(quantity * price, 100);
  }

  // Discount comes off first, then tax is charged on what is left.
  // Every result is in cents. Fields that are blank or not valid count as 0.
  function calculateTotals(quote) {
    const subtotal = quote.items.reduce((sum, item) => sum + lineTotal(item), 0);

    const rawDiscount = parseAmount(quote.discountValue) ?? 0;
    let discount = quote.discountType === "percent"
      ? divideRounded(subtotal * Math.min(rawDiscount, MAX_PERCENT), 10000)
      : rawDiscount;
    discount = Math.min(discount, subtotal);

    const taxable = subtotal - discount;
    const rate = Math.min(parseAmount(quote.taxRate) ?? 0, MAX_PERCENT);
    const tax = divideRounded(taxable * rate, 10000);

    return { subtotal, discount, taxable, tax, total: taxable + tax };
  }

  // Returns problems the user can fix, keyed by field. Line items use
  // "items.<id>.<field>". An empty object means the quote is ready to send.
  function checkQuote(quote) {
    const errors = {};

    for (const [field, max] of Object.entries(TEXT_FIELDS)) {
      if (quote[field].length > max) errors[field] = `Use ${max} characters or fewer.`;
    }
    for (const field of ["issueDate", "dueDate"]) {
      if (quote[field] && !isRealDate(quote[field])) errors[field] = "Use a real date.";
    }
    if (!errors.issueDate && !errors.dueDate && quote.issueDate && quote.dueDate
      && quote.dueDate < quote.issueDate) {
      errors.dueDate = "This date is before the issue date.";
    }

    for (const item of quote.items) {
      const key = (field) => `items.${item.id}.${field}`;
      if (item.description.length > DESCRIPTION_LENGTH) {
        errors[key("description")] = `Use ${DESCRIPTION_LENGTH} characters or fewer.`;
      }
      const quantity = parseAmount(item.quantity);
      if (item.quantity && (quantity === null || quantity === 0 || quantity > MAX_QUANTITY)) {
        errors[key("quantity")] = "Enter a quantity from 0.01 to 9999.99, with at most 2 decimals.";
      }
      const price = parseAmount(item.unitPrice);
      if (item.unitPrice && (price === null || price > MAX_PRICE)) {
        errors[key("unitPrice")] = "Price must be a number up to 999999.99, with at most 2 decimals.";
      }
    }
    if (quote.items.length > MAX_ITEMS) errors.items = `Use ${MAX_ITEMS} lines or fewer.`;

    const discount = parseAmount(quote.discountValue);
    if (quote.discountValue) {
      if (discount === null) {
        errors.discountValue = "Enter a number with at most 2 decimals, or leave it blank.";
      } else if (quote.discountType === "percent" && discount > MAX_PERCENT) {
        errors.discountValue = "A percentage discount can't be more than 100.";
      } else if (quote.discountType === "amount" && discount > calculateTotals(quote).subtotal) {
        errors.discountValue = "The discount is larger than the subtotal.";
      }
    }
    const rate = parseAmount(quote.taxRate);
    if (quote.taxRate && (rate === null || rate > MAX_PERCENT)) {
      errors.taxRate = "Enter a rate from 0 to 100, or leave it blank.";
    }
    return errors;
  }

  // ---------- Saved data and files ----------

  function serialize(quote) {
    return JSON.stringify({ version: 1, quote }, null, 2);
  }

  // Turns parsed JSON into a clean quote, or throws with a reason the user can read.
  // Used for both browser storage and opened files.
  function readQuote(data, today) {
    if (!data || data.version !== 1 || !data.quote || typeof data.quote !== "object") {
      throw new Error("This is not a Quick Quote Builder file.");
    }
    const input = data.quote;
    const text = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();
    const quote = blankQuote(today);

    for (const field of [...Object.keys(TEXT_FIELDS), "discountValue", "taxRate"]) {
      if (field in input) quote[field] = text(input[field]);
    }
    quote.issueDate = resolveDate(text(input.issueDate), today);
    quote.dueDate = resolveDate(text(input.dueDate), today);

    const pick = (value, allowed, name) => {
      const match = allowed.find((option) => option.toLowerCase() === text(value).toLowerCase());
      if (!match) throw new Error(`Unknown ${name} "${text(value)}". Use one of: ${allowed.join(", ")}.`);
      return match;
    };
    quote.kind = pick(input.kind ?? "Quote", KINDS, "document type");
    quote.currency = pick(input.currency ?? "USD", CURRENCIES, "currency");
    quote.discountType = pick(input.discountType ?? "percent", DISCOUNT_TYPES, "discount type");

    if (!Array.isArray(input.items)) throw new Error("The file has no list of line items.");
    if (input.items.length > MAX_ITEMS) throw new Error(`The file has more than ${MAX_ITEMS} line items.`);
    const ids = new Set();
    quote.items = input.items.map((raw) => {
      const item = {
        id: text(raw?.id),
        description: text(raw?.description),
        quantity: text(raw?.quantity),
        unitPrice: text(raw?.unitPrice),
      };
      if (!/^[A-Za-z0-9-]{1,64}$/.test(item.id) || ids.has(item.id)) item.id = newId();
      ids.add(item.id);
      return item;
    });
    return quote;
  }

  function parseStored(raw, today) {
    return readQuote(JSON.parse(raw), today);
  }

  // "Q-007" becomes "Q-008" and "2026-99" becomes "2026-100". Keeps leading zeros.
  function nextNumber(number) {
    const match = /^(.*?)(\d+)$/.exec(number.trim());
    if (!match) return number.trim() ? `${number.trim()}-2` : "Q-001";
    const next = String(Number(match[2]) + 1).padStart(match[2].length, "0");
    return match[1] + next;
  }

  // A file name built from the quote number, safe on every operating system.
  function fileName(quote) {
    const base = `${quote.kind}-${quote.number}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${base || "quote"}.json`;
  }

  return {
    KINDS, CURRENCIES, DISCOUNT_TYPES, MAX_ITEMS, TEXT_FIELDS, DESCRIPTION_LENGTH,
    toISO, fromISO, isRealDate, addDays, parseAmount, formatMoney, formatHundredths,
    blankItem, blankQuote, lineTotal, calculateTotals, checkQuote,
    serialize, readQuote, parseStored, nextNumber, fileName,
  };
})();

if (typeof module !== "undefined") module.exports = QuoteCore;
