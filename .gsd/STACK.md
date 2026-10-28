# Technology Stack

> Updated on 2026-10-28

## Runtime

| Technology | Version | Purpose | Reference |
|------------|---------|---------|-----------|
| Node.js | ^26.6.3 | Core runtime environment | [`package.json:42`](file:///package.json#L42) |
| Web Browser | Modern HTML5/ESNext | Client runtime | [`index.html:1-17`](file:///index.html#L1-L17) |

## Dependencies

### Production
| Package | Version | Purpose | Reference |
|---------|---------|---------|-----------|
| `@supabase/supabase-js` | ^2.117.2 | Database client and auth integration | [`package.json:28`](file:///package.json#L28) |
| `react` | ^19.3.0 | Core UI rendering library | [`package.json:35`](file:///package.json#L35) |
| `react-dom` | ^19.3.0 | DOM bindings for React | [`package.json:36`](file:///package.json#L36) |
| `react-router-dom` | ^7.18.4 | Declarative client routing | [`package.json:37`](file:///package.json#L37) |
| `lucide-react` | ^1.48.0 | Iconography system | [`package.json:34`](file:///package.json#L34) |
| `html5-qrcode` | ^2.3.8 | Camera-based barcode scanner for POS | [`package.json:31`](file:///package.json#L31) |
| `exceljs` | ^4.4.0 | Excel workbook manipulation and formatting | [`package.json:30`](file:///package.json#L30) |
| `xlsx` | ^0.18.5 | Fast spreadsheet parser for imports | [`package.json:38`](file:///package.json#L38) |
| `jspdf` | ^4.2.1 | PDF document rendering engine | [`package.json:32`](file:///package.json#L32) |
| `jspdf-autotable` | ^5.0.8 | PDF report table generator plugin | [`package.json:33`](file:///package.json#L33) |
| `dotenv` | ^18.0.4 | Environment variable loader | [`package.json:29`](file:///package.json#L29) |

### Development
| Package | Version | Purpose | Reference |
|---------|---------|---------|-----------|
| `vite` | ^8.3.1 | Build tool and fast HMR server | [`package.json:51`](file:///package.json#L51) |
| `typescript` | ^7.0.2 | Type-safe static analysis | [`package.json:50`](file:///package.json#L50) |
| `tailwindcss` | ^4.3.3 | Utility CSS framework v4 | [`package.json:48`](file:///package.json#L48) |
| `@tailwindcss/postcss` | ^4.3.3 | PostCSS adapter for Tailwind v4 | [`package.json:41`](file:///package.json#L41) |
| `postcss` | ^8.5.28 | CSS transform pipeline | [`package.json:47`](file:///package.json#L47) |
| `autoprefixer` | ^10.6.1 | Vendor prefix parser | [`package.json:46`](file:///package.json#L46) |
| `vitest` | ^5.0.2 | Fast unit test runner | [`package.json:52`](file:///package.json#L52) |
| `tsx` | ^4.23.15 | Direct TypeScript script execution CLI | [`package.json:49`](file:///package.json#L49) |

## Infrastructure

| Service | Provider | Purpose | Reference |
|---------|----------|---------|-----------|
| Database & Auth | Supabase | Managed PostgreSQL 15+, GoTrue, RPC functions | [`src/lib/supabaseClient.ts:1-22`](file:///src/lib/supabaseClient.ts#L1-L22) |

## Configuration & Environment Variables

| Variable | Purpose | Expected Value / Format | Reference |
|----------|---------|-------------------------|-----------|
| `VITE_SUPABASE_URL` | Supabase API endpoint | `https://*.supabase.co` | [`.env.example:1`](file:///.env.example#L1) |
| `VITE_SUPABASE_ANON_KEY` | Public anon key for client queries | Supabase anon JWT string | [`.env.example:2`](file:///.env.example#L2) |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin privileges | Supabase secret key (caution: client-side exposure) | [`.env.example:3`](file:///.env.example#L3) |

## Package Health & Updates

Discovered during `npm outdated` scan:

| Package | Current | Wanted | Latest | Risk / Impact |
|---------|---------|--------|--------|---------------|
| `@supabase/supabase-js` | 2.117.2 | 2.118.0 | 2.118.0 | Low (minor patch) |
| `react` / `react-dom` | 19.3.0 | 19.3.1 | 19.3.1 | Low (patch) |
| `react-router-dom` | 7.18.4 | 7.18.5 | 7.18.5 | Low (patch) |
| `lucide-react` | 1.48.0 | 1.63.0 | 1.63.0 | Medium (minor version bump, verify icon exports) |
| `vite` | 8.3.1 | 8.3.5 | 8.3.5 | Low (patch) |
| `vitest` | 5.0.2 | 5.0.5 | 5.0.5 | Low (patch) |
| `postcss` | 8.5.28 | 8.5.32 | 8.5.32 | Low (patch) |
