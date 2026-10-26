# Project Brief — Exam Paper Chain-of-Custody DApp

## Overview

A decentralised application (DApp) that tracks the lifecycle of university exam
question papers on an Ethereum blockchain. The goal is to eliminate paper leaks
by making every custody hand-off transparent, role-gated, and immutable.

## On-Chain Data (per paper)

| Field          | Type      | Purpose                                      |
| -------------- | --------- | -------------------------------------------- |
| `id`           | uint256   | Unique paper identifier                      |
| `ciphertextHash` | bytes32 | SHA-256 hash of the encrypted file           |
| `fileRef`      | string    | Off-chain storage reference (IPFS CID / URL) |
| `examTime`     | uint256   | Unix timestamp — exam start time             |
| `stage`        | enum      | Current custody stage                        |
| `centre`       | address   | Assigned exam centre wallet                  |

> **Rule:** Never put plaintext questions or decryption keys on-chain.

## Roles (OpenZeppelin AccessControl)

- **Controller (DEFAULT_ADMIN_ROLE)** — deploys contract, grants/revokes roles,
  creates new paper records.
- **Setter (SETTER_ROLE)** — encrypts the paper off-chain with AES-256-GCM,
  uploads it, and registers the ciphertext hash on-chain.
- **Moderator (MODERATOR_ROLE)** — reviews the paper and advances it to
  `Moderated`.
- **Printer (PRINTER_ROLE)** — prints and seals paper packets, advances to
  `PrintedSealed`.
- **Centre (CENTRE_ROLE)** — receives packets, advances to `ReceivedAtCentre`.

## Stage Transitions

```
Stage             Who triggers       Next stage
─────────────────────────────────────────────────
Created           (auto on create)   →  Moderated
Moderated         Moderator          →  PrintedSealed
PrintedSealed     Printer            →  Dispatched
Dispatched        Controller         →  ReceivedAtCentre
ReceivedAtCentre  Centre             →  KeyReleased
KeyReleased       Controller         →  Opened
```

### Special rules

1. **Stage order is enforced** — you cannot skip or go backwards.
2. **Only the correct role** may trigger each transition.
3. **`releaseKey`** requires:
   - `block.timestamp >= examTime`
   - `msg.sender` is the assigned `centre` address.
4. **Compromised** — any role can flag a paper as `Compromised` at any time.
   Once flagged, the paper is **frozen** and no further transitions are allowed.
5. **Events** — every transition emits an event with paper ID, old stage, new
   stage, and the caller's address.

## Off-Chain Components

### Encryption (AES-256-GCM)

- The Setter encrypts the question paper using Node.js `crypto` module.
- The ciphertext is stored off-chain (local/IPFS); only its SHA-256 hash goes
  on-chain.
- The decryption key is stored by the **key service** (Express server).

### Key Service (Express)

- Endpoint: `GET /api/key/:paperId`
- Returns the AES key **only if**:
  1. The on-chain stage is `KeyReleased`.
  2. The caller proves wallet ownership by signing a challenge message.
- Never exposes keys otherwise.

### Frontend (React + Vite)

- **Role dashboards** — each role sees only the actions available to them.
- **Paper timeline** — built from on-chain events, shows the full custody trail.
- **Verify hash page** — public; anyone can check a file's hash against the
  on-chain record.

## Stack

- Solidity ^0.8.20 + OpenZeppelin AccessControl
- Hardhat (ethers.js) — compile, test, deploy
- Node.js / Express — key service
- React + Vite — frontend
- AES-256-GCM — off-chain encryption (Node.js crypto)

## Non-Goals (out of scope)

- Production deployment / mainnet gas optimisation
- IPFS pinning service integration
- Multi-university federation
