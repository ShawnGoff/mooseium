# Deploying Mooseium to Vercel

A step-by-step guide, start to finish. You'll do the account signups (I can't do
those for you); everything is free on the tiers below and needs no credit card.

The big picture: your code lives on **GitHub**, **Vercel** watches that repo and
rebuilds every time you push, and **Supabase** stays where it is (Vercel just
talks to it). Deploying = "connect GitHub to Vercel once, then `git push` forever."

---

## Step 0 — What's already done

- Your project is now a **Git repository** with an initial commit on the `main`
  branch. Your `.env.local` (secrets) is git-ignored, so it will **not** be
  uploaded. Good.

## Step 1 — Put the code on GitHub

1. Create a free account at <https://github.com> if you don't have one.
2. Create a new **empty** repository: <https://github.com/new>
   - Name it e.g. `mooseium`.
   - Set it to **Private** (you can make it public later).
   - Do **NOT** check "Add a README / .gitignore / license" — the repo must start
     empty, since you already have files.
3. GitHub will show you a "…or push an existing repository" box. Back in your
   project folder, run these (replace `YOUR-USERNAME`):

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/mooseium.git
   git push -u origin main
   ```

   It may ask you to sign in to GitHub. Once it finishes, refresh the GitHub page
   — you should see all your files.

> From now on, saving your work online is: `git add -A && git commit -m "what I changed" && git push`

## Step 2 — Sign up for Vercel

1. Go to <https://vercel.com/signup>.
2. Choose **"Continue with GitHub"** and authorize it. This links the two
   accounts so Vercel can see your repos.
3. Pick the **Hobby** plan (free).

## Step 3 — Import Mooseium

1. On the Vercel dashboard, click **Add New… → Project**.
2. Find your `mooseium` repo in the list and click **Import**.
3. Vercel auto-detects Next.js — leave the Framework Preset, Build Command, and
   Output settings on their defaults. **Don't deploy yet** — set env vars first
   (next step), or the first build will run without them.

## Step 4 — Environment variables

In the import screen there's an **Environment Variables** section (or Project →
**Settings → Environment Variables** later). Add each of these. Copy the Supabase
values straight from your local `.env.local` file.

**Required:**

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | (from your `.env.local`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (from your `.env.local`) |
| `SUPABASE_SERVICE_ROLE_KEY` | (from your `.env.local`) |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://mooseium.vercel.app` |

**Optional (enable extra features):**

| Name | Value |
|---|---|
| `HARVARD_API_KEY` | enables the Harvard museum |
| `SMITHSONIAN_API_KEY` | enables the Smithsonian |
| `UPSTASH_REDIS_REST_URL` | distributed rate limiting (see Step 8) |
| `UPSTASH_REDIS_REST_TOKEN` | distributed rate limiting (see Step 8) |

> **Chicken-and-egg tip:** you won't know your exact Vercel URL until after the
> first deploy. That's fine — deploy once, note the URL Vercel gives you
> (`something.vercel.app`), then come back, set `NEXT_PUBLIC_SITE_URL` to it, and
> redeploy (Step 7).

## Step 5 — Deploy

Click **Deploy**. Vercel installs, builds, and puts the site live in a couple of
minutes. When it's done you'll get a URL like `https://mooseium.vercel.app`.

## Step 6 — Point Supabase at the live site (important for login)

Email/magic-link sign-in needs Supabase to know your real URL, or logins will
redirect to `localhost` and appear broken.

1. In the **Supabase** dashboard → **Authentication → URL Configuration**:
   - **Site URL:** `https://mooseium.vercel.app` (your Vercel URL)
   - **Redirect URLs:** add `https://mooseium.vercel.app/**`
2. Make sure all your database **migrations** have been run (SQL Editor). If you
   haven't run the recent ones, run `0020`, `0021`, and `0022` now — they add the
   wings, the default-wing name, and the V&A save fix.

## Step 7 — Set `NEXT_PUBLIC_SITE_URL` and redeploy

Now that you know your URL, set `NEXT_PUBLIC_SITE_URL` (Step 4) to it, then
trigger a redeploy: Vercel → **Deployments → ⋯ → Redeploy** (or just push any
commit). This fixes canonical links, the sitemap, and the shareable preview
images so they point at the real domain instead of localhost.

## Step 8 — (Optional) Turn on real rate limiting

Only matters in production (serverless runs many instances that can't share an
in-memory counter).

1. Create a free database at <https://console.upstash.com> → **Redis**.
2. On its page, copy the **REST URL** and **REST Token**.
3. Add them to Vercel as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`,
   then redeploy. The app auto-detects them; no code change needed.

## Step 9 — (Optional) Custom domain

Vercel → Project → **Settings → Domains** → add your domain and follow the DNS
instructions. Then update `NEXT_PUBLIC_SITE_URL` and the Supabase URLs (Step 6)
to the new domain and redeploy.

---

## Day-to-day after this

- Edit code locally, test with `npm run dev`.
- When happy: `git add -A && git commit -m "message" && git push`.
- Vercel automatically builds and deploys the new version. Every push to `main`
  goes live; other branches get their own preview URLs.

## If a deploy fails

Open the failed deployment in Vercel and read the **build logs** — the error is
almost always a missing environment variable or a type error. You can catch type
errors before pushing with `npx tsc --noEmit`.
