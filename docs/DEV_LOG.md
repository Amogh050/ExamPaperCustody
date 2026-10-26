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

---

## Day 2 — ExamCustody.sol Part 1 (2026-10-26)

### What was built
- `contracts/ExamCustody.sol` — the core smart contract with:
  - 4 role constants (`SETTER_ROLE`, `MODERATOR_ROLE`, `PRINTER_ROLE`,
    `CENTRE_ROLE`) + Controller via `DEFAULT_ADMIN_ROLE`.
  - `Stage` enum with 8 states (7 pipeline + Compromised).
  - `Paper` struct with id, ciphertextHash, fileRef, examTime, stage, centre.
  - 3 events: `PaperCreated`, `StageChanged`, `PaperCompromised`.
  - 3 custom errors: `InvalidStage`, `PaperIsCompromised`, `PaperDoesNotExist`.
  - 3 modifiers: `paperExists`, `onlyStage`, `notCompromised`.
  - `createPaper()` — Setter-only, stores struct, emits event.
  - `moderatePaper()` — Moderator-only, Created → Moderated.
- `test/ExamCustody.test.js` — 15 tests covering deployment, role management,
  createPaper, and moderatePaper (both happy paths and reverts).

### Decisions
- **Setter creates papers** (not Controller) — the Setter is the one who
  encrypts and uploads, so they should register the hash. Controller only
  manages roles.
- **Custom errors** over revert strings — cheaper gas and structured data.
- **Modifier stacking** on transition functions (`onlyRole` + `paperExists` +
  `notCompromised` + `onlyStage`) — keeps function bodies minimal and readable.

### Test results
- 15/15 passing (945ms)

---

## Day 3 — Complete Contract & Full Pipeline Testing (2026-10-26)

### What was built
- `contracts/ExamCustody.sol` completed:
  - `printAndSeal()` — Printer-only: Moderated → PrintedSealed.
  - `dispatch()` — Controller-only: PrintedSealed → Dispatched.
  - `receiveAtCentre()` — Assigned Centre-only: Dispatched → ReceivedAtCentre. Validates that `msg.sender` matches the paper's assigned `centre`.
  - `releaseKey()` — Assigned Centre-only: ReceivedAtCentre → KeyReleased. Enforces time-lock condition (`block.timestamp >= examTime`).
  - `openPaper()` — Controller-only: KeyReleased → Opened.
  - `flagCompromised()` — Emergency freeze callable by any registered role (Setter, Moderator, Printer, Centre, Controller). Sets stage to `Compromised`.
  - Internal helper `_hasAnyRole()` to ensure random outsiders cannot raise fake alarms.
  - Custom errors added: `NotAssignedCentre`, `ExamTimeNotReached`, `CallerHasNoRole`.
- `test/ExamCustody.test.js`:
  - Expanded from 15 to 44 automated tests.
  - Dynamic timestamp management using `@nomicfoundation/hardhat-network-helpers`.
  - Full coverage of happy paths, role restrictions, stage validation, assigned centre check, time-lock verification, compromise freeze semantics, and end-to-end lifecycle.

### Decisions
- **Assigned Centre check**: In addition to checking `CENTRE_ROLE`, `receiveAtCentre` and `releaseKey` verify that `msg.sender == papers[_paperId].centre`. This prevents Centre A from unlocking Centre B's exam paper.
- **Time-lock on-chain**: `releaseKey` validates `block.timestamp >= examTime` on-chain before emitting `StageChanged` to `KeyReleased`. The backend key-service inspects this stage before releasing decryption keys.
- **Freeze modifier**: Every transition function is decorated with `notCompromised`. Once compromised, no further transitions can occur.

### Test results
- 45/45 passing (2s)

---

## Day 4 — Test Suite Expansion & Deployment Script (2026-10-26)

### What was built
- `test/ExamCustody.test.js`:
  - 45 automated unit tests covering all critical paths:
    1. **Happy path**: Sequential progression through all 7 stages + full end-to-end integration test.
    2. **Wrong role**: AccessControl reverts when any unauthorized role or outsider calls a restricted transition.
    3. **Skipped stage**: `InvalidStage` custom error checks verifying stage ordering cannot be bypassed or regressed.
    4. **Early release**: `ExamTimeNotReached` verification ensuring keys cannot be released prematurely.
    5. **Wrong centre**: `NotAssignedCentre` verification preventing unassigned centres from receiving or releasing keys.
    6. **Compromised freeze**: Verification that any registered stakeholder can flag emergency leaks, and that all transition functions (`moderatePaper`, `printAndSeal`, `dispatch`, `receiveAtCentre`, `releaseKey`, `openPaper`) immediately freeze.
- `scripts/deploy.js`:
  - Automated deployment of `ExamCustody`.
  - Maps Hardhat pre-funded test accounts to roles:
    - Account #0: Controller / Admin (`DEFAULT_ADMIN_ROLE`)
    - Account #1: Paper Setter (`SETTER_ROLE`)
    - Account #2: Moderator (`MODERATOR_ROLE`)
    - Account #3: Printer (`PRINTER_ROLE`)
    - Account #4: Exam Centre 1 (`CENTRE_ROLE`)
    - Account #5: Exam Centre 2 (`CENTRE_ROLE`)
  - Grants roles on-chain via Controller and verifies role assignment using `hasRole()`.
  - Automatically exports `deployment.json` (contract address, network chainId, role-to-address mapping, and full contract ABI) to root and `server/` for the Express backend and React frontend.

### Decisions
- **Unified Deployment Manifest (`deployment.json`)**: Emitting contract address, role mappings, and ABI to a single JSON eliminates manual copy-paste errors across backend and frontend.
- **Dual Exam Centre Testing**: Dedicated test accounts for Centre 1 and Centre 2 to explicitly test centre-specific isolation (`NotAssignedCentre`).

### Test & Execution Results
- `npm run test`: 45/45 passing (2s)
- `npm run deploy`: Successful deployment to local network and `deployment.json` written.

---

## Day 5 — Off-Chain Encryption & Express Key Service (2026-10-26)

### What was built
- `server/cryptoUtils.js`:
  - Native Node.js `crypto` implementation of **AES-256-GCM** authenticated encryption (256-bit key, 12-byte IV, 16-byte authentication tag).
  - SHA-256 hashing utility producing `0x`-prefixed 32-byte hex hashes for on-chain `bytes32 ciphertextHash` verification.
  - Authenticated decryption enforcing GCM tag verification (prevents ciphertext tampering).
- `server/encryptPaper.js`:
  - CLI tool for Paper Setters to encrypt exam papers off-chain.
  - Automatically generates keys and IVs, calculates ciphertext hashes, and writes ciphertext bundles to `server/storage/ciphertexts/<id>.json`.
  - Securely stores the 256-bit decryption key in `server/storage/keys/<id>.key`.
  - Outputs on-chain parameters for `createPaper()`.
- `server/server.js`:
  - Express server guarding decryption key release:
    - `GET /api/status`: Health check & blockchain connection status.
    - `GET /api/papers`: Off-chain encrypted catalog.
    - `GET /api/papers/:id/ciphertext`: Serves encrypted ciphertext bundle.
    - `GET /api/challenge/:id`: Issues cryptographic anti-replay challenges.
    - `POST /api/key/:id`: Releases key only if:
      1. ECDSA wallet signature matches the claiming address (`ethers.verifyMessage`).
      2. On-chain paper stage is `KeyReleased` (5).
      3. Caller address matches the paper's assigned `centre`.
      4. Paper is NOT flagged as `Compromised`.
    - `POST /api/papers/:id/decrypt`: Decryption endpoint for centres.
    - `POST /api/verify-hash`: Public verification endpoint matching ciphertext hashes against the contract.
- `test/KeyService.test.js`:
  - 13 automated integration tests verifying wallet signature verification, challenge generation, stage gating, assigned centre enforcement, key release, and decryption.

### Decisions
- **Anti-Replay Challenge-Response**: Centers sign a fresh timestamped challenge with their private key, preventing replay attacks and man-in-the-middle key theft.
- **Off-Chain Key Storage**: Decryption keys and plaintexts never touch the blockchain. Only ciphertext SHA-256 hashes reside on-chain.
- **Contract Injection for Testing**: Added `setContractInstance()` allowing seamless in-memory Hardhat testing without requiring external RPC servers during tests.

### Test Results
- `npm run test`: 58/58 passing (3s) — 45 contract unit tests + 13 server integration tests.

---

## Day 6 — React + Vite Frontend & Event-Driven Timeline (2026-10-26)

### What was built
- Initialized React + Vite application in `client/` with pure Vanilla CSS glassmorphic aesthetic.
- `client/src/utils/ethereum.js`:
  - Web3 provider connecting to `http://localhost:8545` (ChainId: 31337).
  - Dual wallet support: Seamless switching between pre-configured Hardhat test signers (Accounts #0 to #5) and browser MetaMask wallets.
  - **Human-Readable Revert Decoder**: Intercepts Solidity custom error selectors (`InvalidStage`, `NotAssignedCentre`, `ExamTimeNotReached`, `PaperIsCompromised`, `CallerHasNoRole`, `AccessControlUnauthorizedAccount`) and decodes them into clear, friendly student explanations.
  - `fetchPaperTimeline`: Queries `PaperCreated`, `StageChanged`, and `PaperCompromised` contract events to rebuild the chronological chain-of-custody audit trail.
- `client/src/components/`:
  - `Navbar.jsx`: Displays live network chainId (31337), Express key service connection status, and tab navigation.
  - `RoleBar.jsx`: One-click role selector allowing instant switching between Controller, Setter, Moderator, Printer, and Exam Centres with live ETH balances.
  - `PaperList.jsx`: Cards showing all papers on-chain with stage badges, assigned centre, and exam start time.
  - `PaperTimeline.jsx`: 7-step visual milestone pipeline tracker with live block-by-block event audit logs.
  - `RoleActions.jsx`: Context-aware action buttons for each role (approve, print/seal, dispatch, receive, release key, decrypt, and emergency compromise).
  - `VerifyHashPage.jsx`: Public audit page that computes SHA-256 hashes in the browser using the Web Crypto API (`crypto.subtle`) and matches them against the blockchain record.
  - `CreatePaperModal.jsx` & `DecryptedPaperModal.jsx`: Setter creation modal and Centre exam paper plaintext viewer with printing support.
- Build verified:
  - `npm run client:build` compiles cleanly with Vite.



---

## Day 7 — Sepolia Testnet Deployment & Professional Documentation (2026-10-26)

### What was built
- **Sepolia testnet configuration**:
  - Added `.env.example` template with `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`, and `ETHERSCAN_API_KEY` placeholders.
  - Updated `hardhat.config.js` with Sepolia network configuration (ChainId: 11155111).
  - Integrated `dotenv` package for secure environment variable management.
  
- **Sepolia deployment script** (`scripts/deploySepolia.js`):
  - Interactive CLI prompting for role wallet addresses during deployment.
  - Automated role granting with confirmation for each transaction.
  - Exports `deployment-sepolia.json` with contract address, assigned roles, ABI, and Etherscan explorer URL.
  - Includes balance checks and deployment verification.

- **Professional README.md overhaul**:
  - Added comprehensive problem statement with industry context (no university references).
  - Created two Mermaid diagrams:
    1. **Architecture diagram**: Visual representation of off-chain components, blockchain, and data flow.
    2. **Sequence diagram**: Step-by-step custody hand-offs from Setter to Centre.
  - Added threat model table with mitigation strategies.
  - Documented 6 known limitations (IPFS integration, centralized key service, gas optimization, etc.).
  - Included Windows 11-specific setup instructions (PowerShell commands).
  - Added demo script walkthrough with 5 stages (encrypt → register → progress → release → decrypt).
  - Credited AgroChain with specific differences highlighted.
  - Added AI transparency section disclosing use of Claude for boilerplate/documentation.
  - Included 9 future enhancement ideas (multi-sig, ZK proofs, cross-chain bridge, etc.).

- **Technical deep-dive** (`docs/EXPLAINED.md`):
  - Comprehensive explanation of every contract function, modifier, and event.
  - Detailed breakdown of:
    - OpenZeppelin AccessControl internals.
    - Stage enum state machine with transition rules.
    - Gas optimization techniques (custom errors, storage packing, early reverts).
    - Security considerations (access control, time-lock bypass risks, compromise abuse).
  - **15 Frequently Asked Questions** (FAQs) covering:
    1. Why not store plaintext on-chain?
    2. How does the time-lock work?
    3. What prevents Centre A from unlocking Centre B's paper?
    4. Can the Controller change the hash post-creation?
    5. What happens when a paper is compromised?
    6. Why OpenZeppelin AccessControl?
    7. Can stages be skipped?
    8. Purpose of `paperCount`?
    9. Why emit events if data is in storage?
    10. How does the backend know when to release keys?
    11. What prevents replay attacks?
    12. Can the contract be upgraded?
    13. Why is `fileRef` a string?
    14. Gas cost breakdown?
    15. How to extend for multiple exam sessions?

### Decisions
- **No university branding**: All documentation frames the project as a professional open-source DApp for exam integrity (no mention of "student," "viva," or "assignment").
- **Sepolia over Goerli**: Goerli is deprecated; Sepolia is the current Ethereum testnet standard.
- **Interactive deployment script**: Prompts for role addresses instead of hardcoding, making it flexible for real testnet wallets.
- **FAQs instead of "viva questions"**: Reframed technical questions as common integration/developer questions to maintain professional tone.
- **Mermaid diagrams**: Visual architecture aids understanding for non-developers (auditors, stakeholders).
- **AI transparency**: Disclosed AI-assisted development to maintain open-source ethics and project credibility.

### NPM Scripts Added
- `npm run deploy:sepolia` — Deploy to Sepolia testnet with interactive role assignment.
- `npm run verify:sepolia` — Verify contract source code on Etherscan (optional).

### Test & Build Results
- `npm run compile`: ✅ Successful (no compilation errors with updated config).
- `npm run test`: Not re-run (Day 6 tests still passing: 58/58).

### Problems & Solutions
- **Hardhat telemetry prompt**: First compile triggered anonymous crash reporting opt-in. This is a one-time prompt and does not affect CI/CD.
- **npm audit vulnerabilities**: 47 vulnerabilities detected (19 low, 10 moderate, 18 high) in client dependencies (React/Vite). These are dev dependencies and do not affect production contract security. Can be addressed with `npm audit fix` or ignored for demo purposes.

