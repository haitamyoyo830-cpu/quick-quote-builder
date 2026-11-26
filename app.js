// Page behavior: storage, the editor, the preview, and files. The rules live in core.js.
(() => {
  "use strict";

  const STORAGE_KEY = "quick-quote-builder.v1";
  const DEMO_FILE = "sample-data/demo-quote.json";
  const MAX_FILE_BYTES = 1024 * 1024;

  const $ = (id) => document.getElementById(id);
  const editor = $("editor");

  let quote = null;
  let undoAction = null;
  let storageBlocked = false; // True while saved data exists that we could not read.

  const today = () => QuoteCore.toISO(new Date());
  const locale = navigator.language || "en-US";
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const money = (cents) => QuoteCore.formatMoney(cents, quote.currency, locale);
  const dueLabel = () => (quote.kind === "Invoice" ? "Due date" : "Valid until");

  // ---------- Storage ----------

  function readStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? QuoteCore.blankQuote(today()) : QuoteCore.parseStored(raw, today());
  }

  function load() {
    try {
      quote = readStorage();
      storageBlocked = false;
    } catch (error) {
      quote = QuoteCore.blankQuote(today());
      storageBlocked = true;
      let hasRaw = false;
      try { hasRaw = localStorage.getItem(STORAGE_KEY) !== null; } catch { /* storage is off */ }
      $("storage-alert-text").textContent = hasRaw
        ? "Your saved quote could not be read. Nothing has been changed. Download the data first, then start fresh or open a saved quote file."
        : "This browser is not letting the page save data, so your quote cannot be kept. Check whether site data is blocked, or use another browser.";
      $("save-raw-button").hidden = !hasRaw;
      $("start-fresh-button").hidden = !hasRaw;
    }
    $("storage-alert").hidden = !storageBlocked;
    for (const fieldset of editor.querySelectorAll("fieldset")) fieldset.disabled = storageBlocked;
    for (const id of ["demo-button", "open-button", "new-button"]) $(id).disabled = storageBlocked;
  }

  // Called after every change. Shows a message if the browser refused to save.
  function save() {
    if (storageBlocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, QuoteCore.serialize(quote));
    } catch (error) {
      showMessage(error.name === "QuotaExceededError"
        ? "Not saved: this browser's storage for the page is full. Use Save file to keep a copy."
        : "Not saved: the browser could not update its storage. Use Save file to keep a copy.");
    }
  }

  // Swaps in a whole new quote and offers to bring the old one back.
  function replaceQuote(next, text) {
    const previous = quote;
    quote = next;
    save();
    fillForm();
    showMessage(text, () => {
      quote = previous;
      save();
      fillForm();
      showMessage("Undone.");
    });
  }

  // ---------- Messages ----------

  function showMessage(text, undo = null) {
    undoAction = undo;
    $("message-text").textContent = text;
    $("undo-button").hidden = !undo;
    $("message").hidden = !text;
  }

  // ---------- Rendering ----------

  // Builds elements with textContent only, so quote data can never become HTML.
  function element(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    const { dataset, ...rest } = props;
    Object.assign(node, rest);
    Object.assign(node.dataset, dataset);
    node.append(...children.filter((child) => child !== null));
    return node;
  }

  function formatDate(iso) {
    if (!QuoteCore.isRealDate(iso)) return "";
    return QuoteCore.fromISO(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  }

  function formatPercent(text) {
    const value = QuoteCore.parseAmount(text);
    return value ? `${QuoteCore.formatHundredths(value, locale)}%` : "";
  }

  function formatQuantity(text) {
    const value = QuoteCore.parseAmount(text);
    return value === null ? text : QuoteCore.formatHundredths(value, locale);
  }

  // Puts the quote into the editor's fields. Used on load, open, undo, and new.
  function fillForm() {
    for (const field of editor.querySelectorAll("[name]")) field.value = quote[field.name];
    renderItems();
    update();
  }

  function renderItems() {
    const rows = quote.items.map((item, index) => {
      const line = `line ${index + 1}`;
      const input = (field, label, extra = {}) => element("input", {
        value: item[field], ariaLabel: `${label}, ${line}`, dataset: { field }, ...extra,
      });
      return element("li", { className: "item", dataset: { id: item.id } },
        input("description", "Description", { maxLength: QuoteCore.DESCRIPTION_LENGTH, className: "description" }),
        input("quantity", "Quantity", { inputMode: "decimal" }),
        input("unitPrice", "Unit price", { inputMode: "decimal", placeholder: "0.00" }),
        element("output", { className: "amount", ariaLabel: `Amount, ${line}` }),
        element("button", { type: "button", className: "remove", textContent: "✕", title: "Remove this line", ariaLabel: `Remove ${line}` }),
        element("span", { className: "field-error item-error" }));
    });
    $("items").replaceChildren(...rows);
    $("add-item-button").disabled = quote.items.length >= QuoteCore.MAX_ITEMS;
  }

  // Refreshes everything that depends on the numbers: amounts, errors, preview, and summary.
  function update() {
    const totals = QuoteCore.calculateTotals(quote);
    const errors = QuoteCore.checkQuote(quote);

    for (const span of editor.querySelectorAll("[data-error-for]")) {
      const key = span.dataset.errorFor;
      span.textContent = errors[key] || "";
      const field = editor.querySelector(`[name="${key}"]`);
      if (field) field.setAttribute("aria-invalid", String(Boolean(errors[key])));
    }
    for (const row of $("items").children) {
      const item = quote.items.find((candidate) => candidate.id === row.dataset.id);
      const messages = [];
      for (const input of row.querySelectorAll("input")) {
        const message = errors[`items.${item.id}.${input.dataset.field}`];
        input.setAttribute("aria-invalid", String(Boolean(message)));
        if (message) messages.push(message);
      }
      row.querySelector(".item-error").textContent = messages.join(" ");
      row.querySelector(".amount").textContent = money(QuoteCore.lineTotal(item));
    }

    $("due-label").textContent = dueLabel();
    const lines = quote.items.filter((item) => item.description || QuoteCore.lineTotal(item)).length;
    $("summary").textContent = `${quote.kind} ${quote.number || "(no number)"} · ${plural(lines, "line")} · Total ${money(totals.total)}`;
    renderPaper(totals);
  }

  function renderPaper(totals) {
    // Placeholders show on screen so the layout makes sense, and are hidden when printed.
    const textOr = (value, placeholder, className = "") => element("p", {
      className: value ? className : `${className} placeholder`.trim(), textContent: value || placeholder,
    });
    const meta = (label, value) => (value
      ? element("div", {}, element("dt", { textContent: label }), element("dd", { textContent: value }))
      : null);
    const totalRow = (label, value, className = "") => element("div", { className },
      element("dt", { textContent: label }), element("dd", { textContent: value }));

    const lines = quote.items.filter((item) => item.description || QuoteCore.lineTotal(item));
    const body = lines.length
      ? lines.map((item) => element("tr", {},
        element("td", { textContent: item.description || "(No description)" }),
        element("td", { className: "num", textContent: formatQuantity(item.quantity) }),
        element("td", { className: "num", textContent: money(QuoteCore.parseAmount(item.unitPrice) ?? 0) }),
        element("td", { className: "num", textContent: money(QuoteCore.lineTotal(item)) })))
      : [element("tr", {}, element("td", { colSpan: 4, className: "placeholder", textContent: "No line items yet." }))];

    const discountLabel = quote.discountType === "percent" && formatPercent(quote.discountValue)
      ? `Discount (${formatPercent(quote.discountValue)})` : "Discount";
    const taxRate = formatPercent(quote.taxRate);

    $("paper").replaceChildren(
      element("header", { className: "paper-head" },
        element("div", {},
          textOr(quote.fromName, "Your business name", "paper-name"),
          quote.fromDetails ? element("p", { className: "pre", textContent: quote.fromDetails }) : null),
        element("div", { className: "paper-meta" },
          element("p", { className: "paper-kind", textContent: quote.kind }),
          element("dl", {},
            meta("Number", quote.number),
            meta("Date", formatDate(quote.issueDate)),
            meta(dueLabel(), formatDate(quote.dueDate))))),
      element("div", { className: "paper-to" },
        element("p", { className: "label", textContent: "Bill to" }),
        textOr(quote.toName, "Client name", "paper-name"),
        quote.toDetails ? element("p", { className: "pre", textContent: quote.toDetails }) : null),
      element("table", { className: "paper-items" },
        element("thead", {}, element("tr", {},
          element("th", { textContent: "Description" }),
          element("th", { className: "num", textContent: "Qty" }),
          element("th", { className: "num", textContent: "Unit price" }),
          element("th", { className: "num", textContent: "Amount" }))),
        element("tbody", {}, ...body)),
      element("dl", { className: "paper-totals" },
        totalRow("Subtotal", money(totals.subtotal)),
        totals.discount ? totalRow(discountLabel, `−${money(totals.discount)}`) : null,
        taxRate ? totalRow(`${quote.taxLabel || "Tax"} (${taxRate})`, money(totals.tax)) : null,
        totalRow(`Total (${quote.currency})`, money(totals.total), "grand")),
      quote.notes
        ? element("div", { className: "paper-notes" },
          element("p", { className: "label", textContent: "Notes" }),
          element("p", { className: "pre", textContent: quote.notes }))
        : null);
  }

  // ---------- Files ----------

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = element("a", { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function openFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showMessage(`${file.name} is larger than 1 MB, so it is probably not a quote file.`);
      return;
    }
    try {
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error("The file is not valid JSON."); }
      replaceQuote(QuoteCore.readQuote(data, today()), `Opened ${file.name}.`);
    } catch (error) {
      showMessage(`Could not open ${file.name}. ${error.message}`);
    }
  }

  // Browsers refuse fetch() on pages opened straight from disk, so the demo
  // falls back to the file picker there. It loads directly from any web server.
  async function loadDemo() {
    try {
      const response = await fetch(DEMO_FILE);
      if (!response.ok) throw new Error(response.statusText);
      replaceQuote(QuoteCore.readQuote(await response.json(), today()), "Loaded the demo quote. Click Undo to go back to yours.");
    } catch {
      showMessage(`This browser won't let the page read the demo by itself. Click Open file and choose ${DEMO_FILE} from the project folder.`);
      $("file-input").click();
    }
  }

  // ---------- Events ----------

  editor.addEventListener("submit", (event) => event.preventDefault());

  editor.addEventListener("input", (event) => {
    const target = event.target;
    const row = target.closest(".item");
    if (row) {
      const item = quote.items.find((candidate) => candidate.id === row.dataset.id);
      item[target.dataset.field] = target.value;
    } else if (target.name in quote) {
      // Switching type also switches an untouched Q- or INV- number prefix.
      if (target.name === "kind") {
        const swapped = quote.number.replace(target.value === "Invoice" ? /^Q-/ : /^INV-/, target.value === "Invoice" ? "INV-" : "Q-");
        quote.number = swapped;
        editor.elements.number.value = swapped;
      }
      quote[target.name] = target.value;
    }
    save();
    update();
  });

  editor.addEventListener("click", (event) => {
    const button = event.target.closest("button.remove");
    if (!button) return;
    const index = quote.items.findIndex((item) => item.id === button.closest(".item").dataset.id);
    const [removed] = quote.items.splice(index, 1);
    save();
    renderItems();
    update();
    const next = $("items").children[Math.min(index, quote.items.length - 1)];
    (next ? next.querySelector(".remove") : $("add-item-button")).focus();
    showMessage(`Removed ${removed.description ? `"${removed.description}"` : "an empty line"}.`, () => {
      quote.items.splice(index, 0, removed);
      save();
      renderItems();
      update();
      showMessage("Line restored.");
    });
  });

  $("add-item-button").addEventListener("click", () => {
    quote.items.push(QuoteCore.blankItem());
    save();
    renderItems();
    update();
    $("items").lastElementChild.querySelector(".description").focus();
  });

  $("new-button").addEventListener("click", () => {
    // Keeps the details that rarely change between clients.
    const next = QuoteCore.blankQuote(today());
    for (const field of ["kind", "currency", "fromName", "fromDetails", "taxLabel", "taxRate", "notes"]) {
      next[field] = quote[field];
    }
    next.number = QuoteCore.nextNumber(quote.number);
    replaceQuote(next, `Started ${next.kind.toLowerCase()} ${next.number}. Your details, currency, tax, and notes were kept.`);
  });

  $("demo-button").addEventListener("click", loadDemo);
  $("open-button").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", (event) => {
    const [file] = event.target.files;
    event.target.value = ""; // Lets the same file be chosen again.
    if (file) openFile(file);
  });

  $("save-button").addEventListener("click", () => {
    const name = QuoteCore.fileName(quote);
    download(QuoteCore.serialize(quote), name, "application/json");
    showMessage(`Saved ${name}. Open it here later to keep working on it.`);
  });

  // The page title becomes the suggested PDF file name.
  const pageTitle = document.title;
  window.addEventListener("beforeprint", () => { document.title = `${quote.kind} ${quote.number}`.trim(); });
  window.addEventListener("afterprint", () => { document.title = pageTitle; });
  $("print-button").addEventListener("click", () => window.print());

  $("undo-button").addEventListener("click", () => {
    const action = undoAction;
    showMessage("");
    if (action) action();
  });

  $("save-raw-button").addEventListener("click", () => {
    download(localStorage.getItem(STORAGE_KEY) ?? "", `unreadable-quote-${today()}.json`, "application/json");
  });

  $("start-fresh-button").addEventListener("click", () => {
    if (!window.confirm("Delete the saved quote that could not be read? Download it first if you might need it.")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      showMessage("The browser would not delete the data.");
      return;
    }
    load();
    fillForm();
    showMessage("Started fresh.");
  });

  // Another tab saved a change: show it here rather than overwrite it later.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    load();
    fillForm();
    showMessage("Updated with changes made in another tab.");
  });

  load();
  fillForm();
})();
