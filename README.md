# College ERP App (React + Vite + Tailwind)

## Quick start

- npm install
- Copy `.env.example` to `.env` and set your Apps Script URL
- npm run dev

Environment variable required:

- VITE_APPS_SCRIPT_URL: Your Google Apps Script Web App endpoint that returns JSON for GET and accepts JSON for POST (Content-Type: text/plain).

The admin dashboard and managers can fall back to sample data in `public/data` when VITE_APPS_SCRIPT_URL is not set or fails (enable via `VITE_ENABLE_SAMPLE_FALLBACK=true`):
- `public/data/submissions.sample.json`
- `public/data/rooms.sample.json`
- (optional) `public/data/books.sample.json`

## Routing

The app uses React Router for navigation:
- `/dashboard` – Admin dashboard
- `/admissions` – Admissions form
- `/hostel` – Hostel manager
- `/library` – Library manager

Login gates the routes; a demo login accepts any email and a password with 4+ characters. The user is persisted in `localStorage` as `erp_user`.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
