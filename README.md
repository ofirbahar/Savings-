# Savings Planner

A personal money planner that runs entirely in your browser. It answers one question first:
**after what I earned and spent this month, how much can I save and invest?**

## What it does

- **Overview** – what is left this month, how your income was used, a suggested plan for the
  leftover (emergency fund, goals, investing), six months of income vs. spending, and a 50/30/20 check.
- **Transactions** – income, expenses, savings and investments; monthly repeating items; search and
  filters; CSV import and export.
- **Budgets** – a monthly limit per category with progress and over-budget warnings.
- **Goals** – savings targets with an optional date and the monthly amount needed to get there.
- **Invest** – a projection of what regular investing could grow into (an illustration, not advice).
- **Settings** – currency, your own categories, backup and restore.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

To put it online, enable GitHub Pages for this repository (Settings → Pages → deploy from branch).

## Your data

Everything is stored in `localStorage` on your device. Nothing is sent to a server. Clearing browser
data removes it, so use **Settings → Back up** regularly; the backup file restores on any device.

The app opens with clearly marked example numbers. Press **Start with my own data** to clear them.
