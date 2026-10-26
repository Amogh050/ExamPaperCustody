# ExamPaperCustody

> Blockchain-based chain-of-custody DApp for university exam question papers.

## Problem

Exam paper leaks undermine academic integrity. Paper custody today relies on
trust and manual logs — neither is tamper-proof or auditable.

## Solution

Every question paper is AES-256-GCM encrypted off-chain. Its **ciphertext hash**
is stored on an Ethereum smart contract that enforces a strict stage pipeline
(Created → Moderated → PrintedSealed → Dispatched → ReceivedAtCentre →
KeyReleased → Opened). Only the right role can advance each stage, and every
transition emits an on-chain event that forms an immutable audit trail.

The decryption key is held by an off-chain key service and only released when
the contract confirms the paper has reached the `KeyReleased` stage **and** the
exam time has arrived.

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Contract  | Solidity ^0.8.20, OpenZeppelin AccessControl  |
| Toolchain | Hardhat (ethers.js)                           |
| Backend   | Node.js / Express                             |
| Frontend  | React + Vite                                  |
| Encryption| AES-256-GCM (off-chain, Node.js crypto)       |

## Roles

| Role       | Responsibility                              |
| ---------- | ------------------------------------------- |
| Controller | Admin — assigns roles, creates papers       |
| Setter     | Authors the paper, uploads encrypted file   |
| Moderator  | Reviews & approves the paper                |
| Printer    | Prints & seals the paper packets            |
| Centre     | Receives packets at the exam centre         |

## Stage Pipeline

```
Created ─► Moderated ─► PrintedSealed ─► Dispatched ─► ReceivedAtCentre ─► KeyReleased ─► Opened
                                 ▲
                         Any role can flag ──► Compromised (freezes the paper)
```

## Project Structure

```
ExamPaperCustody/
├── contracts/     # Solidity smart contracts
├── test/          # Hardhat tests (Mocha + Chai)
├── scripts/       # Deploy & utility scripts
├── server/        # Express key-service backend
├── client/        # React + Vite frontend
├── docs/          # Documentation & dev log
├── hardhat.config.js
└── package.json
```

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm run test

# Start local Hardhat node
npm run node
```

## License

ISC
