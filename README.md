# agora

A public square without the algorithm. Chronological feed, no tracking, no AI sorting, no ads. All data lives in your browser's localStorage.

## Stack

- React 18
- Vite
- No backend, no database, no external APIs

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Demo accounts

| Username | Password  |
|----------|-----------|
| maven    | maya123   |
| rowan    | rowan123  |
| pixel    | pixel123  |

Or create your own account on the sign-up screen.

## Build for production

```bash
npm run build
npm run preview   # local preview of the built output
```

The `dist/` folder can be deployed to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.).

## Deploying to Cloudflare Pages

1. Push the repo to GitHub (or GitLab).
2. In the [Cloudflare Pages dashboard](https://dash.cloudflare.com/), click **Create a project** → **Connect to Git** and select your repo.
3. Set the build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. Click **Save and Deploy**. Cloudflare will build and deploy automatically on every push to your main branch.

The `public/_redirects` file is already included — it tells Cloudflare to serve `index.html` for all routes so the React app handles navigation correctly.

## Data & privacy

All data (users, posts, session) is stored in `localStorage` only. Nothing leaves the browser. Clearing site data resets the app to the seed accounts.

## Media uploads

Uploaded photos and videos are validated client-side by MIME type, file extension, and magic-byte signature. No content is sent to any external service.
