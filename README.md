# Quick Quote Builder

A small browser page for writing quotes and simple invoices and printing them as clean PDFs. It is for freelancers and small businesses who send a few quotes a week and don't want to pay for invoicing software or fight with a word processor template.

There is nothing to install and no account to create. The project is **100% free and open-source** under the [MIT License](LICENSE).

> **Your data stays on your device.** Everything you type is saved in your own browser's local storage. The page has no server, no sign-up, no tracking, and sends nothing over the internet.

## Example

You design websites. Maya from a bakery wants a price for a new site. You open the page, type your studio's details once, add Maya as the client, and list the work: a discovery call, a homepage design, four inner pages, and six and a half hours of online ordering setup. You give a 10% discount and add sales tax. The totals update as you type, and the preview on the right looks like the page Maya will get.

Click **Print or save PDF**, choose **Save as PDF**, and send the file. When Maya says yes, change the type to **Invoice**, set a due date, and print again. Next client? Click **New quote**: your details, currency, tax, and notes stay, and the number goes up by one.

## What it does

- Quotes and invoices, with a number, issue date, and a "valid until" or "due" date.
- Line items with description, quantity, and unit price. Quantities can be decimals, such as 6.5 hours.
- Discount as a percentage or a fixed amount, taken off before tax.
- Any tax name and rate, such as Sales tax 8.25%, VAT 20%, or TVA 20%.
- Currency switcher for **USD**, **EUR**, and **MAD**.
- A live preview that prints on its own, without buttons or form fields, on A4 or Letter.
- Saves as you type, in your browser. Close the tab and it is still there tomorrow.
- **Save file** and **Open file** keep copies of quotes as small `.json` files.
- Undo the last removed line, new quote, opened file, or demo.
- Works in light and dark mode, and on phones.

Amounts accept a dot or a comma for decimals, so `1250.50` and `1250,50` both work. Totals are counted in whole cents, so they never pick up rounding errors such as $0.30000000000000004.

## Run it

You need a current desktop or mobile browser. You do not need an internet connection after downloading.

1. On the GitHub page, click **Code**, then **Download ZIP**.
2. Unzip the file and put the folder somewhere permanent, such as Documents.
3. Double-click `index.html`.

If you use Git:

```bash
git clone https://github.com/haitamyoyo830-cpu/quick-quote-builder.git
```

Then open `index.html` in the new folder.

## Try the demo data

Click **Load demo**. If you opened the page by double-clicking it, most browsers won't let it read files by itself, so a file picker opens instead: choose `sample-data/demo-quote.json`.

The demo is a web studio quoting a bakery. Both businesses are fictional, their names start with "Demo:", and the emails use `example.com`. Click **Undo** straight after loading to go back to your own quote.

## Privacy: where your data lives

- **Saved in your browser only.** The current quote lives in your browser's local storage, on your device, in plain text.
- **No servers, no accounts, no tracking.** The page makes no network requests. There is no analytics, no cookies, and nothing to sign up for.
- **You choose what to share.** A quote only leaves your computer when you save a PDF or a `.json` file and send it yourself.

Things to know:

- **Clearing browser data deletes your quote.** So can private windows, browser cleanup tools, and resetting your browser.
- A different browser, browser profile, or device starts with an empty quote.
- The browser keeps one quote at a time. Click **Save file** before **New quote** if you want to come back to the old one, or keep the PDF.

## Change your currency

The switcher changes the currency symbol and code on the quote. It does not convert amounts, because exchange rates change daily and the page never goes online. Type your prices in the currency you choose. Numbers are formatted the way your browser's language setting expects, for example `$1,234.50` or `1 234,50 €`.

## Limitations

- One person, one browser. There is no sync or sharing.
- One quote is kept in the browser at a time. Use **Save file** to keep others.
- No online payments, reminders, or emailing. Print the PDF and send it yourself.
- Data is not encrypted. Anyone who can use your browser profile can read it.
- Some browsers share local storage between all HTML files opened from disk. Don't open HTML files you don't trust in the same browser profile.
- This is not accounting or tax software. Check the tax rules where you work.

## Change it

It is plain HTML, CSS, and JavaScript with no build step and no dependencies. Edit a file and reload the page.

- `core.js`: amounts, totals, discounts, tax, dates, and the saved file format
- `app.js`: saving, the editor, the preview, and files
- `styles.css`: colors, layout, and the print layout
- `sample-data/demo-quote.json`: the demo quote

To have **Load demo** work without a file picker, serve the folder with any local web server, for example:

```bash
python3 -m http.server
```

Then open http://localhost:8000.

The optional tests need [Node.js](https://nodejs.org) 20 or newer. From the project folder:

```bash
node --test
```

## Related

[Simple Follow-up Tracker](https://github.com/haitamyoyo830-cpu/simple-followup-tracker) shows which leads and clients you need to get back to. Use it to follow up on the quotes you send from here.

## License

Free and open-source under the [MIT License](LICENSE). You can use it for your own business, change it, and share it.
