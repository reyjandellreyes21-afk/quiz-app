# Quiz.app UI System (Portfolio SaaS Style)

## Color Palette (Dark Mode Default)
- Background: `#020617` (`slate-950`)
- Surface: `#0f172a` (`slate-900`)
- Elevated Surface: `#020617` + border (`slate-800`)
- Primary: `#6366f1` (`indigo-500`)
- Primary Hover: `#818cf8` (`indigo-400`)
- Success: `#10b981` (`emerald-500`)
- Danger: `#f43f5e` (`rose-500`)
- Text Primary: `#f8fafc` (`slate-50`)
- Text Secondary: `#94a3b8` (`slate-400`)

## Typography
- Font stack: `Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
- Heading: `font-semibold`, tight tracking, high contrast
- Body: `text-sm` to `text-base` with clear hierarchy
- Micro labels: uppercase with tracking for metadata

## Component Structure
- Navbar:
  - Left: greeting and user status
  - Right: segmented nav buttons (Dashboard, Browse, History, Create)
  - Rounded container + subtle border + blur background
- Cards:
  - Quiz cards with category tag, title, metadata, CTA
  - Hover state with border tint and background lift
- Buttons:
  - Primary: rounded-xl indigo filled
  - Secondary/Nav: low-contrast dark background with active ring
  - Success action for submit on question page
- Inputs:
  - Rounded-xl, dark field, subtle border, visible focus ring
  - Consistent spacing and placeholder tone

## Screen-Level Layout
- Dashboard: stat cards + recent attempts list
- Browse: category pills + responsive quiz card grid
- Question: timer, progress bar, grouped answer choices
- Results: score summary + per-question feedback pills
- History: timeline-style attempt rows

## Responsive Behavior
- Mobile-first spacing (`p-4`) and card stack
- Stats switch from 3 columns to 1 column on small screens
- Quiz grid: 1 -> 2 -> 3 columns at breakpoints
- Header/nav wraps cleanly on narrow screens
