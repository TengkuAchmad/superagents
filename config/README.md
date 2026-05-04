# Strict OpenCode Configuration Rules

This folder is for architecture organization only. For strict compatibility, OpenCode runtime **must continue using** root-level files:

- `c:\Users\INTEL INSIDE\.config\opencode\opencode.json`
- `c:\Users\INTEL INSIDE\.config\opencode\oh-my-openagent.json`

## Non-Negotiable Compatibility Requirements

1. Do not move or rename root `opencode.json`.
2. Do not move or rename root `oh-my-openagent.json`.
3. Any mirror files under `config/` are documentation/snapshot only unless startup scripts are explicitly updated.
4. Scripts like `opencode-start.ps1`, `start-api.ps1`, and `start-dashboard.ps1` remain bound to root paths unless changed in a dedicated migration step.

## Suggested Usage

- Keep runtime source of truth at root.
- Optionally keep snapshots in `config/` for review/versioning.
- If future cutover is needed, perform it in a dedicated release with rollback plan.
