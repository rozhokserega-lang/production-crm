# UI Refresh 2026

## Scope

The first UI refresh pass is implemented as a CSS-only skin on top of the existing React views.

Main entry point:

- `fronted/src/styles.css`

The refresh block is appended near the end of the stylesheet and starts with:

```css
/* 2026 UI refresh: quieter production workspace skin. */
```

## Goals

- Reduce the strong green page background on production screens.
- Make navigation, filters, KPIs, and tables visually quieter and easier to scan.
- Keep the existing business logic and data flow unchanged.
- Preserve the current status colors, but soften table row intensity for better readability.

## Notes

- This pass does not change localization files.
- This pass does not add new user-facing application strings.
- Future UI work should continue by moving visual decisions into reusable components and locale-backed text where needed.

## Shipment Toolbar Update

The shipment screen now treats the table as the primary working mode:

- the view selector was removed from the shipment filters;
- stage checkboxes are styled as compact toggle buttons;
- the week filter supports selecting multiple weeks;
- legacy single-week filter values remain supported.

Week filter helpers live in:

- `fronted/src/app/weekFilterUtils.js`
