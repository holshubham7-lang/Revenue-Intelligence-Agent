<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Branch workflow

- When given a feature name, create a matching branch (e.g. `features/<name>`) from `development`, push it, then write ALL code there.
- After committing and pushing the feature branch, merge it into `development` and push to trigger auto-deploy to the dev server (CI builds with `NEXT_PUBLIC_API_URL=https://revops-api-dev.azurewebsites.net`).
- Only `frontend/**` changes trigger the dev deploy. Never commit `docs/` untracked files.
