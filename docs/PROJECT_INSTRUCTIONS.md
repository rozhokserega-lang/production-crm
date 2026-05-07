# Project Instructions

These rules are mandatory for all changes in this project.

## Runtime And Console Commands

- The application runs through Docker Compose in the `web` container.
- When a command must be executed in the project environment, run it through the container, for example:

```bash
docker compose exec web <command>
```

- Docker setup and daily usage are documented in [`docs/DOCKER_USAGE.md`](DOCKER_USAGE.md).
- Do not assume that local host tools, dependencies, or environment variables match the container.
- If a command must run outside Docker, state the reason clearly before doing it.

## Documentation

- Project documentation lives in `docs/`.
- When behavior, setup, deployment, integrations, scripts, environment variables, or operator workflows change, update the relevant documentation in `docs/` in the same change.
- If no existing document fits, create a focused document in `docs/` instead of putting long operational notes into source files.

## Localization

- Do not use hardcoded Russian user-facing strings in application code.
- All user-facing text must go through the localization layer.
- The canonical locale is Russian: `ru`.
- Other locales must stay structurally aligned with `ru`.
- After changing locale files, run:

```bash
bin/compare_locales.rb
```

- If the locale comparison fails, fix the locale files before finishing the change.

## Frontend And Product Behavior

- Keep production workflows explicit and auditable: material consumption, stage changes, shipment actions, and external syncs should have clear success and failure paths.
- Do not hide critical sync failures unless the operation is intentionally best-effort and documented as such.
- Avoid adding new UI text directly in components; add locale keys first.

## Supabase, Google Sheets, And External Integrations

- Keep secrets out of frontend code. Use environment variables and server-side or edge functions for external API tokens.
- For Google Sheets, Bitrix24, Telegram, and similar integrations, prefer backend/edge execution over browser-side API calls.
- External syncs should be idempotent where repeated user actions or retries are possible.
- When adding or changing an integration, document:
  - source of truth;
  - sync direction;
  - retry behavior;
  - duplicate prevention strategy;
  - where failures are logged.

## Verification

- Run the smallest meaningful verification for the change.
- For frontend changes, run lint/tests/build through the `web` container unless there is a documented reason not to.
- For locale changes, `bin/compare_locales.rb` is required.
- Record any command that could not be run and the reason.
