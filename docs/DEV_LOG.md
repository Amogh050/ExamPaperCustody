# Development Log

## Day 1 — Project Scaffolding (2026-10-26)

### What was built
- Initialised Hardhat 2 project with `@nomicfoundation/hardhat-toolbox` (ethers,
  Chai, coverage, gas reports) and `@openzeppelin/contracts`.
- Created project folder structure: `contracts/`, `test/`, `scripts/`, `server/`,
  `client/`, `docs/`.
- Added `.gitignore` (node_modules, .env, artifacts, cache, build outputs).
- Wrote `README.md` skeleton with project overview, roles, stages, and quick
  start commands.
- Wrote `PROJECT_BRIEF.md` as the single source of truth for all requirements.
- Wrote `docs/reference-notes.md` analysing the AgroChain reference DApp.

### Decisions
- **Hardhat 2** over Hardhat 3 — v3's toolbox plugin isn't stable yet, and v2
  has far better documentation and community support for a university project.
- **CommonJS** module format — required by Hardhat 2 (`require()` style).
- **Solidity 0.8.20** with optimizer enabled (200 runs) — good balance between
  deployment cost and call cost for a demo project.
- **OpenZeppelin AccessControl** over custom role management — avoids the O(n)
  lookup loops seen in AgroChain, uses battle-tested code, and is easier to
  explain in a viva.

### Problems
- Hardhat 3 was installed by default (`npm install hardhat` pulls latest).
  The `@nomicfoundation/hardhat-toolbox@latest` tag is incompatible with both
  v2 and v3. Fixed by pinning `hardhat@^2.22.0` and `hardhat-toolbox@^5.0.0`.
- PowerShell doesn't support `&&` for chaining commands — must run npm commands
  separately.
