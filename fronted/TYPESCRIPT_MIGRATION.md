# TypeScript Migration (Gradual)

## Step 1 - Install packages

```bash
cd fronted
npm install -D typescript @types/react @types/react-dom
```

Vite already supports `.ts` / `.tsx`.

## Step 2 - tsconfig

`tsconfig.json` is configured for gradual migration:

- `allowJs: true`
- `checkJs: false`
- `strict: false`
- `strictNullChecks: true`

This keeps existing JS code working while TS files gain useful checks.

## Step 3 - Typecheck script

Use:

```bash
npm run typecheck
```

It validates TS files without emitting output.

## Step 4 - Start from shared domain types

Use `src/types/domain.ts` as a source of truth for RPC/domain contracts.

JS files can adopt these types via JSDoc imports incrementally.

## Step 5 - Migrate file by file

Suggested order:

1. `src/types/domain.ts`
2. `src/hooks/useAuditLog.ts`
3. `src/hooks/useCrmRole.js` -> `.ts`
4. `src/services/orderService.js` -> `.ts`
5. `src/hooks/useOrders.js` -> `.ts`
6. View components `.jsx` -> `.tsx`

For each file:

1. Rename to `.ts` / `.tsx`
2. Run `npm run typecheck`
3. Fix only reported issues
4. Commit

## Step 6 - CI integration

Add a `typecheck` step before build:

```yaml
- name: Type check
  run: npm run typecheck
```
