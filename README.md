# EZTrack

A personal expense tracker: track day-to-day spending against a running balance,
organized by category, with month-over-month history.

Multi-user and hosted — you, and anyone you share it with, each get your own
balance, categories, and history.

---

## Tech stack

| Layer | Choice |
|---|---|
| Mobile app | React Native + Expo (SDK 57), Expo Router, TanStack Query |
| Backend | Django 5.2 + Django REST Framework |
| Database | PostgreSQL |
| Auth | Email + password, JWT (`djangorestframework-simplejwt`) |
| Hosting | Render (`render.yaml` blueprint included) |

---

## How the balance works (the one design decision worth reading)

The balance is **derived, never delta-patched.**

The tempting implementation is to adjust the stored balance by whatever changed:
subtract on add, add back on delete, apply the difference on edit. That's three
separate arithmetic paths, each of which can be wrong — and when one is wrong, the
balance is corrupted permanently and silently, with no way to detect or repair it,
because the stored number is the only record of itself.

Instead, after **any** write to the ledger, the server recomputes:

```
balance = sum(all income) - sum(all expenses)
```

That's one code path that's correct by construction. The balance becomes a pure
function of the ledger, so it cannot drift — any bug elsewhere is fixed by simply
calling `recalculate_balance()` again. It lives in
[backend/expenses/services.py](backend/expenses/services.py), and it's the only
place the balance is ever written.

Two consequences worth knowing:

- **There's an `Income` model.** The balance has to be able to go *up*, or there's
  no way to reconstruct it — and no way to record a paycheck.
- **`Balance` is a cache, not the truth.** It exists so the home screen reads one
  row instead of aggregating the whole ledger on every load.

The recompute costs a `SUM` over two indexed columns — single-digit milliseconds
at any size a personal tracker will ever reach.

---

## Setup

### Prerequisites
- Python 3.12, Node 20+, PostgreSQL 16
- The **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

createdb eztrack
cp .env.example .env          # then edit DATABASE_URL to match your Postgres user

.venv/bin/python manage.py migrate          # also seeds Food / Shopping / Subscription
.venv/bin/python manage.py createsuperuser  # optional, for /admin/

# 0.0.0.0, NOT localhost — see "Running on your phone" below
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

### Mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with your phone (Camera app on iOS, Expo Go on Android).

### Running on your phone

**The single most common failure here: `localhost` on your phone means *the
phone*, not your Mac.** A backend on `http://localhost:8000` is unreachable from a
physical device, even though it works fine in your laptop's browser.

Two things make it work, and both are already handled:

1. **Django must listen on your network**, not just the loopback interface — hence
   `runserver 0.0.0.0:8000` rather than the default.
2. **The app must call your Mac's LAN IP.** It figures this out automatically:
   [mobile/src/api/client.js](mobile/src/api/client.js) reads the IP of the machine
   running the Expo dev server and points at port 8000 on the same host. No manual
   IP editing.

Your phone and your Mac must be on the same Wi-Fi network.

To point the app somewhere else (e.g. the deployed backend), set
`EXPO_PUBLIC_API_URL=https://your-api.onrender.com` in `mobile/.env`.

---

## Data models

```
User          email (login identifier), password
Category      name, user (NULL = a global default), is_archived
Expense       user, amount, category, note, date, created_at
Income        user, amount, note, date, created_at
Balance       user, current_amount, updated_at        -- cache; see above
Budget        user, year, month, amount               -- optional monthly target
```

Notes:

- **Money is always `Decimal`, never float.** `0.1 + 0.2 != 0.3` in binary floating
  point, and that error compounds across a ledger.
- **No `is_custom` flag on Category.** It's derivable — a category is custom iff it
  has an owner. A stored boolean duplicating that could only drift out of sync.
- **No `Month` model.** Monthly history is derived by filtering `date__year` /
  `date__month`.
- **`Expense.category` is `PROTECT`**, so a category that's been spent against can't
  be deleted — it gets archived instead.

---

## API

All endpoints require `Authorization: Bearer <access token>` except register and
login. Every query is scoped to the authenticated user.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register/` | Create account, returns tokens |
| POST | `/api/auth/login/` | Returns access + refresh tokens |
| POST | `/api/auth/refresh/` | Exchange refresh for a new access token |
| GET | `/api/auth/me/` | Current user (used to validate a stored token) |
| GET/POST | `/api/categories/` | Global defaults + your own |
| DELETE | `/api/categories/:id/` | Archives (never hard-deletes) |
| GET/POST | `/api/expenses/` | `?year=&month=` to filter |
| GET/PATCH/DELETE | `/api/expenses/:id/` | |
| GET/POST | `/api/income/` | |
| GET/PATCH/DELETE | `/api/income/:id/` | |
| GET | `/api/balance/` | Current running balance |
| GET | `/api/summary/?year=&month=` | **Powers the whole home screen in one call** |
| GET | `/api/months/` | Months with activity, newest first (History list) |
| GET/PUT/DELETE | `/api/budget/?year=&month=` | PUT upserts |

`/api/summary/` and `/api/months/` aggregate **server-side** on purpose. The
alternative — send every expense and sum them in JS — makes the app download the
user's entire ledger just to render six numbers.

---

## Screens

| Screen | What it does |
|---|---|
| **Login / Register** | Tokens stored in the device keychain (`expo-secure-store`) |
| **Home** | Balance, budget progress, category breakdown, expense list, `+` button |
| **Add expense** (modal) | Amount, category, note, date (defaults to today) |
| **Edit / delete expense** (modal) | Balance follows automatically — no client-side arithmetic |
| **Add money** (modal) | Income, top-ups, or your starting balance |
| **Monthly budget** (modal) | Optional spending target for the month |
| **History** | List of past months → read-only breakdown for each |

---

## Tests

```bash
cd backend && .venv/bin/python manage.py test    # 27 tests
```

Three areas, chosen because they're where a bug would actually hurt:

- **`test_balance.py`** — the balance is the number the user looks at and the one
  most likely to be quietly wrong. Covers edit-up, edit-down, delete, backdating,
  going negative, exact decimal precision, and a long mixed sequence asserting the
  invariant `balance == sum(income) - sum(expenses)`.
- **`test_isolation.py`** — now that this is multi-user, the worst bug is no longer
  a wrong balance but user A seeing user B's money. Includes the subtle case: A
  can't *see* B's private category, but nothing stops A guessing its id and POSTing
  an expense against it, which would leak the category name back in the response.
- **`test_concurrency.py`** — proves `select_for_update()` prevents lost updates. It
  forces the exact interleaving with two sequenced threads. **Verified it fails
  when the lock is removed** — a concurrency test that passes either way is worse
  than no test, because it implies coverage it doesn't have.

---

## Deploying

`render.yaml` is a Render blueprint: point Render at this repo (New → Blueprint)
and it creates the web service and the Postgres database, runs migrations, and
seeds the default categories.

Then set `EXPO_PUBLIC_API_URL` in `mobile/.env` to the deployed URL and rebuild
the app.

Production settings (HTTPS redirect, HSTS, secure cookies) switch on automatically
when `DEBUG=False`. `SECURE_PROXY_SSL_HEADER` is set because Render terminates TLS
at its proxy — without it, the HTTPS redirect would loop forever.

`manage.py check --deploy` reports one remaining warning, `SECURE_HSTS_PRELOAD`,
left off deliberately: submitting a domain to the browser preload list is
effectively irreversible.

---

## Recent updates

- **Income + derived balance.** The balance is now recomputed from the ledger after
  every write instead of being patched by deltas, and there's a way to add money.
- **Multi-user + JWT auth.** Every model is owned by a user; every query is scoped
  to the caller.
- **Monthly budgets.** Optional per-month spending target, shown on the home screen
  as progress against what you've spent.
- **Case-insensitive login.** Registration lowercased the email but login didn't, so
  signing up as `test@x.com` and logging in as `Test@x.com` failed with a bare 401.
  Fixed in [backend/accounts/backends.py](backend/accounts/backends.py).
