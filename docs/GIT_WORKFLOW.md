# Git Workflow

This repository follows a strict branch + Pull Request flow.

## Branch hierarchy

```
main
└── production
    └── uat
        └── development
            ├── features/google-login
            ├── features/microsoft-login
            ├── features/linkedin-login
            └── features/<your-feature>
```

## Rules

| Branch | Direct push | Changes land via |
|---|---|---|
| `features/*` | Yes (developers) | Push / PR |
| `development` | No | PR + 1 review (admin) |
| `uat` | No | PR + 1 review (admin) |
| `production` | No | PR + 1 review (admin) |
| `main` | No | PR + 1 review (admin) |

## For developers

1. Clone the repository:
   ```
   git clone https://github.com/holshubham7-lang/Revenue-Intelligence-Agent.git
   git fetch origin
   ```
2. Create your feature branch off `development`:
   ```
   git checkout -b features/<your-feature> origin/development
   ```
3. Commit and push your work:
   ```
   git add .
   git commit -m "feat: <what you changed>"
   git push -u origin features/<your-feature>
   ```
   Only `features/*` branches accept direct developer pushes.
4. Open a **Pull Request** targeting `development` and request a review.
5. The admin reviews and merges.

## Merge flow (admin only)

Always merge upward, one step at a time:

```
features/*  →  development  →  uat  →  production  →  main
```

Each step is a Pull Request; never merge straight into `main` from a feature branch.

## Notes

- Never commit secrets or `.env` files — they are gitignored.
- Root-level docs, notes, and text files are excluded from the repository.