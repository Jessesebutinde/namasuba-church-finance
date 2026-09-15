# Namasuba Redeemed — Church Finance (Draft Model)

Calm, transparent Sunday finance reporting for **Namasuba Redeemed**.  
Client-side only (Vite + React + TypeScript + Tailwind). Data persists in `localStorage`, with JSON/CSV export/import and PDF/PNG report export.

> **This is a draft model for discussion and possible trial. Final approval and changes belong to the elders and admins collectively.**

## Quick start

```bash
cd namasuba-church-finance
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
npm test      # model engine unit tests (sample math)
npm run build # production build
```

## Features

- **Dashboard** — period filters, income/spend/proposed/balance/savings/debt/named gifts/Sunday count, actual vs proposed chart
- **Sunday entry** — multi income & expense lines, auto totals, remaining, unexplained difference, % by category, balance warning
- **Named gifts** — never auto-apply the general offertory model
- **Comparison** — Category | Actual | Proposed | Difference per Sunday and combined
- **Settings** — church name, currency label (default `k`), no-debt mode, deduct ops before model, trial dates, editable categories & model bands, Admin/Viewer role (optional light password), report statuses, audit log
- **Reports** — on-screen preview, A4 PDF (jsPDF), high-res multi-page PNG (html2canvas), signatures section
- **Sample data** — 6 Sep & 13 Sep 2025 preloaded

## Proposed model (general offertory `G` only)

Operating expenses (e.g. Drinking water) can be deducted before bands. Named ministry gifts are excluded.

| Band | Allocation |
|------|------------|
| G ≤ 40 | Pastor 50%, Inst 50% |
| 40 < G < 70 | P20 I20; rest Debt50 Usher25 Sav25; no-debt → debt→P75/I25 |
| 70 ≤ G < 100 | P30 I30; rest 50:25:25; no-debt → Usher/Sav 50/50 of debt |
| 100 ≤ G < 200 | P50 I30; rest 50:25:25; no-debt usher/sav |
| 200 ≤ G < 300 | P70 I30; 15% dormant ministries; remainder 50:25:25 |
| G ≥ 300 | No auto — joint review (admin override available) |

### Sample verification (ops deduct on)

- **6 Sep** income 80, water 10 → rem 70 → P30 I30 D5 U2.5 S2.5  
- **13 Sep** income 72, water 8 → rem 64 → P30 I30 D2 U1 S1  
- **Combined actual** 152; P74 I60 water18; balance 0  
- **Combined proposed (debt)** P60 I60 water18 D7 U3.5 S3.5  
- **No-debt** U7 S7 D0  

These numbers are covered by `npm test`.

## Stack

- Vite, React 19, TypeScript, Tailwind CSS v4  
- Recharts, jsPDF, html2canvas, Vitest  
- No server / no git remote required

## Local data

Key: `namasuba-church-finance-v1` in browser `localStorage`.  
Use Settings → Export/Import JSON or Export CSV to back up.

## Tone

Labels emphasise *actual distribution*, *proposed model*, *for discussion*, and *trial structure*. Green = balanced, amber = needs review, red = errors only.
