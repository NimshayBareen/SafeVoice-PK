# SafeVoice PK: Final Deliverable (CS619)

A secure platform for victims of **cybercrime and of crimes against women and children** in Pakistan. A victim keeps tamper-evident evidence, answers simple questions to see her legal route, prepares a complaint, finds a verified **advocate**, shares evidence only with consent, signs a vakalatnama and follows the case. Advocates and administrators have their own workspaces.

**Stack (as in the proposal):** React (Vite) web app, Node.js / Express REST API, PostgreSQL, JWT sessions, bcrypt, AES-256-GCM encryption, SHA-256 hashing, e-mail OTP (SMTP), optional AI assistant (Anthropic API).

---

## 1. What is inside

| Role | Features (SRS use cases) |
|---|---|
| **Everyone** | Register as **Victim** or **Advocate** with a **6-digit e-mail OTP** (UC-01), login with lock-out and rate limits (UC-02), English / Urdu interface (right-to-left), **Quick Exit** button and Esc x3, neutral notifications, advocate-style theme |
| **Victim** | Evidence vault: upload, SHA-256 + AES-256, integrity check, download, chain of custody (UC-03, 04) · Guided questions, saved as draft and resumed (UC-05) · Legal mapping: offences, laws, procedure, forum (UC-06) · Complaint draft, editable, PDF and Word export (UC-07) · Verified-lawyer directory with filters (UC-08) · Request representation with an **anonymised summary** (UC-09) · **Consent**: choose exactly which items a lawyer sees, stop sharing at once (UC-10) · Vakalatnama: PDF draft, upload signed copy, track 4 statuses (UC-11) · Encrypted messages (UC-12) · Case progress and hearing dates (UC-13) · Support directory (UC-14) · **AI assistant** over the legal knowledge base · Report a problem |
| **Advocate** | Profile and licence documents (UC-15) · Inbox: review the anonymised summary, accept or decline (UC-16) · See, verify and download **only** the items the client shares (UC-16, 04) · Verify the signed vakalatnama, record the original (UC-17) · Messages · Update stage and add hearing dates (UC-13) |
| **Administrator** | Verify lawyer credentials, view their (decrypted) documents, approve / reject / ask for more (UC-18) · **Knowledge base editor**: categories, questions, statutes, offences, forums, rules, support directory; versions and review dates; no code changes needed (UC-19) · Audit log with filters, CSV export and **hash-chain integrity check**; misuse reports (warn / suspend / dismiss); accounts (UC-20) |

All 20 use cases of the SRS are implemented. See Section 9 for what is *not* included.

---

## 2. Run it on your laptop

### You need
* **Node.js 18 or newer** (`node -v`) and **PostgreSQL 13 or newer** (keep the default port **5432**).

### Step 1: database
```
psql -U postgres -c "CREATE DATABASE safevoice;"
```
(If you already have the database from the prototype, keep it: the new tables are added automatically.)

### Step 2: backend
```
cd backend
npm install
copy .env.example .env          (Windows)        cp .env.example .env     (Mac / Linux)
```
Open `backend/.env` and set:
1. `DATABASE_URL`, for example `postgres://postgres:YOUR_PASSWORD@localhost:5432/safevoice`
2. `JWT_SECRET` and `MASTER_KEY`: run this twice, paste one result into each
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. `ADMIN_EMAIL` and `ADMIN_PASSWORD` (your own administrator account; the password needs upper case, lower case, a digit and a symbol)
4. Leave `DEV_SHOW_OTP=true` for now (the code is shown on screen). Real e-mail is explained in Section 3.

Then:
```
npm start
```
`npm start` creates / updates the tables, loads the starter legal knowledge base, creates your administrator and starts the API on http://localhost:5000. Check http://localhost:5000/api/health: it should say `"database":"connected"`.

Optional demo data (3 sample advocates already verified, 1 sample victim, 1 sample admin; password for all: `Demo#Pass2026!`):
```
npm run seed
```

### Step 3: web app (second terminal)
```
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**.

---

## 3. Real e-mail verification codes (OTP)

Registration sends a 6-digit code to the user's e-mail (valid 10 minutes, 5 attempts, a new code can be requested every 60 seconds). The e-mail is deliberately neutral ("Your account code") and never mentions the project.

### Gmail (simplest)
1. In your Google account turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords, create an app password (name it "SafeVoice") and copy the 16 letters.
3. In `backend/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=yourname@gmail.com
   SMTP_PASS=the16letterapppassword
   SMTP_FROM="SV Account <yourname@gmail.com>"
   DEV_SHOW_OTP=false
   ```
4. Restart the backend and register with a real e-mail address. The code arrives within seconds (check Spam the first time).

Any other SMTP service (Brevo, Mailjet, your university mail) works the same way: set the host, port, user and password.

**No SMTP set?** The code is printed in the server console and, if `DEV_SHOW_OTP=true`, also shown on the verification page. This is only for demos. **Set `DEV_SHOW_OTP=false` on any real deployment.**

---

## 4. Accounts and roles

* **Victim:** Register, choose **"I need help"**.
* **Advocate:** Register, choose **"I am an Advocate"**, fill the professional details, verify the e-mail, log in, upload the licence card on *My profile*. The profile stays **Pending verification** and the advocate is *not* listed until an administrator approves.
* **Administrator:** created by `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`, or later with `npm run create-admin -- admin@example.com "Str0ng#Password1"`.

---

## 5. Demo script (about 12 minutes)

1. **Home page.** Show the theme, the Urdu button (layout flips), the red **Quick Exit**.
2. **Register an advocate** (or use the `npm run seed` accounts). Verify with the OTP. Upload a licence PDF on *My profile*.
3. **Log in as administrator** → *Lawyer verification* → open the document → **Approve**.
4. **Register a victim** (alias, no real name). OTP.
5. **New case** → *1. Questions*: choose "Threats, blackmail…", answer a few, **Submit**.
6. *2. Legal guidance*: offences (PECA 2016 section 24, PPC 506…), NCCIA procedure, disclaimer. Switch to Urdu.
7. *Evidence vault*: upload a screenshot (SHA-256 shown), save a link, **Verify**. Show the **Chain of custody**.
8. *3. Complaint draft*: type your name, create, edit a line, download **PDF** and **Word**.
9. *4. Find a lawyer*: filter by city and area → **Request representation** → the preview shows exactly what the lawyer will see (no name, no contact, no files).
10. **Log in as the advocate** → *Review request* → **Accept**. The advocate sees no evidence yet.
11. **Victim** → *My lawyer* → *Share evidence*: tick one item → the advocate can now **view / verify / download** only that item. Untick → access disappears immediately.
12. **Vakalatnama**: victim prepares it, downloads the PDF, uploads a signed scan; advocate verifies; the 4-step tracker moves.
13. **Messages** (encrypted) and **Case progress** (advocate adds a stage and a hearing date; victim sees it).
14. **Tamper test.** In `backend/storage/<case id>/` change one byte of a `.bin` file → *Verify* shows **ALTERED!**
15. **Admin** → *Audit log* → *Check log integrity* → *Knowledge base* (add a helpline or edit a rule) → *Misuse reports*.
16. **Ask the Assistant**: "Where do I report online blackmail?" / "Which law covers cyber stalking?"

---

## 6. AI assistant

The assistant answers **only from the administrator-managed knowledge base** (categories, offences, forums, procedures, helplines). It does not see the victim's case and nothing typed into it is stored. It always shows a "not legal advice" notice and says "call 15" when it detects danger.

* **Without a key:** it replies with the most relevant extracts from the knowledge base (works offline).
* **With a key:** put `ANTHROPIC_API_KEY=...` in `.env` (from https://console.anthropic.com). The question and the retrieved excerpts are sent to the API and the model writes a short answer in the user's language. Change the model with `ANTHROPIC_MODEL`.

---

## 7. Put it online (Render + free PostgreSQL)

I cannot publish it for you, but the project is ready for it (`Dockerfile`, `render.yaml`).

1. **Database:** create a free PostgreSQL project at https://neon.tech (or Supabase). Copy the connection string (it looks like `postgres://user:pass@host/db?sslmode=require`).
2. **GitHub:** create a repository and push this whole folder (the `.gitignore` already excludes secrets).
3. **Render:** https://render.com → **New → Blueprint** → choose your repository. Render reads `render.yaml`.
4. Fill the variables Render asks for:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the connection string from step 1 |
| `APP_URL` | your Render address, e.g. `https://safevoice-pk.onrender.com` |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Gmail details from Section 3 (host and port are preset) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the first administrator |
| `ANTHROPIC_API_KEY` | optional |

   `JWT_SECRET` and `MASTER_KEY` are generated by Render. `STORAGE_DRIVER=db` keeps encrypted files in PostgreSQL, so nothing is lost when the free server restarts. `DEV_SHOW_OTP=false` is already set.
5. After the build, open the Render address. The first start creates the tables and the administrator. Test with `/api/health`.

**Notes:** free Render services go to sleep when idle (the first page load after a pause can take about a minute). **Never change `MASTER_KEY` after evidence has been stored**, or it cannot be decrypted. Use sample data only; this is a university project and not a production service.

---

## 8. Checks

| Command (in `backend`) | What it does |
|---|---|
| `npm run selftest` | No database needed. 32 checks: hashing, AES-GCM, tamper detection, key wrapping, hash chains, the legal-mapping engine on realistic cases, knowledge-base consistency, anonymised summaries, the assistant's retrieval, PDF and Word generation. |
| `npm run smoke` | Needs the server, the database and `npm run seed`. Runs the **whole system through the real API** (OTP, roles, verification, intake, legal mapping, complaint export, evidence, consent and revocation, vakalatnama, messages, tracking, support, assistant, admin, audit chain, tamper detection) and prints PASS or FAIL for every step. |

---

## 9. Honest limits

* PDF and Word exports are **English**. (The PDF library has no Urdu font; Urdu appears everywhere on screen.) The Urdu interface covers the victim side; the advocate and administrator screens are English.
* Passwords are protected with bcrypt; **two-factor login** is not included (it is in the design as optional).
* Legal content is **starter content for a university project**, checked against public sources in November 2026. It is information, not legal advice, and administrators must keep it current (every rule has a version and a review date).
* Notifications are in-app (neutral text). E-mail is used only for verification codes.
* The system was checked with automated logic tests and an end-to-end script; it has not been load tested or security audited. Run the OWASP checks from the work plan before any real use.

---

## 10. Project structure

```
safevoice-pk/
  backend/
    schema.sql                  28 tables (Design Document Section 6)
    src/server.js               Express app, security headers, rate limits, routes
    src/crypto.js               SHA-256, AES-256-GCM, key wrapping
    src/chain.js                hash-chained custody and audit logs
    src/storage.js              encrypted files on disk or in PostgreSQL
    src/mailer.js               SMTP (OTP e-mail)
    src/kb/data.js, seed.js     starter legal knowledge base
    src/services/               rules engine, anonymised summary, documents (PDF/Word), assistant, integrity
    src/routes/                 auth, cases, intake, legal, evidence, lawyers, requests, vakalatnama, messages, tracking, misc, admin
    scripts/                    migrate, seed, create-admin, selftest, smoke
  frontend/src/pages/           Landing, Register, VerifyOtp, Login, Dashboard, CaseShell (Vault, Intake, Legal, Draft, Lawyers, Representation),
                                Support, Assistant, RequestWorkspace, LawyerHome, LawyerProfile, AdminShell, KnowledgeBase
  Dockerfile, render.yaml       online hosting
```

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `Missing environment variable ...` | `.env` is missing or a value is empty. |
| `password authentication failed` | The password in `DATABASE_URL` is wrong. |
| `function gen_random_uuid() does not exist` | PostgreSQL is older than 13. |
| The OTP e-mail does not arrive | Check Spam; check the app password (no spaces); look at the backend console for the error; use *Send a new code*. |
| "Invalid login" for a new account | Verify the OTP first; five wrong passwords lock the account for 15 minutes. |
| Advocate cannot see the inbox | The administrator has not approved the profile yet. |
| `npm run smoke` stops at the administrator | Run `npm run seed` first or set `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD`. |
| Evidence cannot be opened after a restart | `MASTER_KEY` changed. Restore the original value. |
