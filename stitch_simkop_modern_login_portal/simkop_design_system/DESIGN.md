---
name: SIMKOP Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#43474d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#49607c'
  primary: '#001428'
  on-primary: '#ffffff'
  primary-container: '#0f2942'
  on-primary-container: '#7991af'
  inverse-primary: '#b0c9e8'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#00170c'
  on-tertiary: '#ffffff'
  tertiary-container: '#002e1d'
  on-tertiary-container: '#00a270'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#b0c9e8'
  on-primary-fixed: '#011d35'
  on-primary-fixed-variant: '#314863'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: IBM Plex Serif
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: IBM Plex Serif
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Serif
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: IBM Plex Serif
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Serif
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  title-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  gutter-lg: 2rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is tailored for enterprise-grade cooperative finance and administrative management (SIM Koperasi). The interface evokes institutional credibility, fiduciary trust, regulatory discipline, and transparent governance. 

Targeting financial auditors, cooperative managers, and cooperative members alike, the style synthesizes **Corporate / Modern** precision with quiet editorial refinement. Visual elements emphasize stability, auditability, and structured clarity without feeling dated or excessively bureaucratic. Interaction states and visual boundaries communicate data integrity through measured contrast, pristine surfaces, and subtle, tactile feedback.

## Colors

The palette establishes an authoritative financial ecosystem anchored by deep naval authority and fiscal prosperity accents:

- **Primary (`#0F2942`)**: Deep Marine Navy. Serves as the core anchor for structural chrome, primary navigation, primary action controls, and high-emphasis financial data headers.
- **Secondary (`#0D9488`)**: Deep Teal. Applied to active navigation indicators, operational workflows, secondary actions, and balance-verification elements.
- **Tertiary (`#10B981`)**: Emerald Mint. Reserved for credit balances, dividend growth indicators, authorized ledger statuses, and positive reconciliation states.
- **Neutral (`#64748B`)**: Slate Gray. Drives body copy, metadata, structural borders (`#E2E8F0`), muted backgrounds (`#F1F5F9`), and canvas surfaces (`#F8FAFC`).

Subdued functional alert states use precision-tested tones: Crimson Red (`#BE123C`) for default arrears and audit alerts, and Warm Amber (`#D97706`) for pending board approvals.

## Typography

Typography establishes an institutional tone through the contrast between **IBM Plex Serif** and **Hanken Grotesk**:

- **Display & Section Headers (`IBM Plex Serif`)**: Delivers an authoritative, judicial, and fiduciary presence. Used for portfolio balances, annual ledger summaries, certificate headers, and primary statement overviews.
- **Data, UI, & Body (`Hanken Grotesk`)**: Provides razor-sharp legibility across financial data density, transaction journals, input matrices, and analytical reports.
- **Tabular Numerics**: All numeric values in ledger rows, amortization schedules, and balance sheets must render with tabular figures (`font-variant-numeric: tabular-nums`) to preserve absolute vertical column alignment across debit and credit values.

## Layout & Spacing

The system leverages a responsive 12-column grid system calibrated for financial workflows:

- **Desktop (1280px+)**: 12 columns with `2rem` outer margin and `1.5rem` gutter width. Maximum content container width is capped at 1440px for single-pane dashboards. Side navigation occupies a persistent 280px left rail.
- **Tablet (768px - 1279px)**: 8 columns with `1.5rem` margin and `1rem` gutter. Side navigation collapses into an anchored icon rail (72px) or off-canvas drawer.
- **Mobile (< 768px)**: 4 columns with `1rem` outer margin and `0.75rem` gutter. Data tables reflow into structured debit/credit card modules.

Vertical spacing relies strictly on modular baseline multipliers of `0.25rem` (4px). Data tables use compact density modes with minimal vertical cell gaps to support high-volume audit reconciliations.

## Elevation & Depth

Visual depth is achieved through **ambient layered elevation paired with crisp boundary lines**:

- **Subsurface Outlines**: Every surface tier uses a crisp `1px` structural outline (`#E2E8F0` on canvas, `#CBD5E1` on interactive overlays) rather than relying on shadow alone.
- **Level 0 (Flat Canvas)**: `#F8FAFC`. Zero elevation, direct structural container for dashboards.
- **Level 1 (Cards, Ledger Sheets, Form Containers)**: `#FFFFFF` surface with `box-shadow: 0 1px 3px 0 rgba(15, 41, 66, 0.04), 0 1px 2px -1px rgba(15, 41, 66, 0.04)` combined with an enclosing border.
- **Level 2 (Dropdowns, Popovers, Segment Filters)**: `box-shadow: 0 4px 6px -1px rgba(15, 41, 66, 0.07), 0 2px 4px -2px rgba(15, 41, 66, 0.05)`.
- **Level 3 (Modals, Transaction Approvals, Audit Drawers)**: `box-shadow: 0 20px 25px -5px rgba(15, 41, 66, 0.08), 0 8px 10px -6px rgba(15, 41, 66, 0.04)` paired with an ultra-soft translucent backdrop overlay (`#0F2942` at 40% opacity).

## Shapes

The geometric framework balances institutional rigor with modern digital ergonomics:

- **Base Radius (`0.5rem` / 8px)**: Inputs, badges, small buttons, and table rows.
- **Container Radius (`rounded-xl` / 1.5rem / 24px)**: Outer dashboard cards, metrics modules, transaction summary containers, and application dialogs.
- **Micro Radius (`0.25rem` / 4px)**: Checkboxes, tags, system status dots, and audit tree expanders.
- **Pill Shape (`9999px`)**: Exclusively reserved for quantitative status chips (e.g., "Lunas", "Dalam Verifikasi", "Jatuh Tempo") and monetary trend tags.

## Components

### Buttons
- **Primary**: Solid Deep Navy (`#0F2942`) background, `#FFFFFF` text, `0.5rem` border radius, subtle hover transition (`#1E3A8A`). Focused with an offset `2px` ring in `#0D9488`.
- **Secondary / Operational**: Outlined with crisp `1px` border (`#CBD5E1`), `#0F2942` text, `#FFFFFF` fill. Hover switches to `#F8FAFC` background.
- **Accent Action**: Emerald (`#10B981`) or Teal (`#0D9488`) background for liquidity disbursements or payment confirmations.

### Form Inputs & Monetary Controls
- **Standard Field**: White background, `1px` solid border (`#CBD5E1`), `0.5rem` radius. Floating or persistent uppercase labels (`label-sm`).
- **Currency Input (IDR/Rupiah)**: Fixed left prefix container (`Rp`) styled in muted navy (`#F1F5F9` background, `#64748B` text, border-r `1px`), right-aligned tabular numbers for exact accounting entry.
- **Focus State**: Border shifts to `#0D9488` accompanied by a `3px` diffuse focus halo (`rgba(13, 148, 136, 0.15)`).

### Cards & Ledger Modules
- Built on `#FFFFFF` fill, bounded by `1px` border (`#E2E8F0`), and styled with `rounded-xl` corner radii.
- Includes an optional subtle top structural accent rule (`3px` line in Navy `#0F2942` or Teal `#0D9488`) to designate account categories (e.g., Simpanan Pokok, Simpanan Wajib, Pinjaman).

### Chips & Status Badges
- Soft background fills (`10%` opacity of functional color) with full-contrast matching text (`label-sm`, semi-bold). 
- Paid / Lunas: Tinted Emerald (`#ECFDF5` background, `#047857` text).
- Overdue / Macet: Tinted Rose (`#FFF1F2` background, `#BE123C` text).
- Under Review: Tinted Slate (`#F1F5F9` background, `#475569` text).

### Selection Controls (Checkboxes & Radios)
- Crisp `1.5px` border in `#94A3B8`. Checked state fills with `#0F2942` and displays a stark white glyph. Focus outlines inherit the teal accent ring.

### Domain-Specific Components
- **General Ledger Data Table**: Alternating background rows on nested data sets (`#FFFFFF` to `#F8FAFC`), sticky header with subtle bottom border (`#CBD5E1`), compact padding (`0.5rem 1rem`), and monospaced or tabular-aligned numeric cells.
- **Passbook / Loan Amortization Timeline**: Segmented vertical flow lines in `#E2E8F0` with semantic node markers (Green for paid installments, Amber for active cycle, Grey for future projections).