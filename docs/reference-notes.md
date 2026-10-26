# Reference Notes — AgroChain Supply-Chain DApp

> Source: `../reference/AgroChain` (MIT license)
> Purpose: Study only — understand the role + stage pattern for our design.

## What AgroChain Does

AgroChain tracks a product (an "order") through a supply chain with four
sequential roles: Productor → Procesador → Distribuidor → Mayorista → sold.
Each role is a separate struct with an address, and the contract owner registers
participants. An order's `STAGE` enum advances one step at a time.

## AgroChain's Role + Stage Pattern

### Stages (enum)

```solidity
enum STAGE { Init, Productor, Procesador, Distribuidor, Mayorista, sold }
```

Each order carries a `.stage` field. Transition functions check:

```solidity
require(Inventario[_orderID].stage == STAGE.Productor); // must be at previous stage
```

This enforces **sequential ordering** — you can't skip a stage.

### Roles (structs + owner-only registration)

Each participant type (Productor, Procesador, etc.) is a struct with an
`address` field. The contract owner calls `addPROD(address, name, place)` to
register them. Before a participant can advance an order, the contract looks
them up with a `findXXX()` function that loops through the mapping:

```solidity
function findPROD(address _address) private view returns (uint256) {
    for (uint256 i = 1; i <= prodCtr; i++) {
        if (PROD[i].addr == _address) return PROD[i].id;
    }
    return 0;
}
```

### Ownership

Simple `Owner = msg.sender` in constructor, with a `onlyByOwner` modifier.

## Strengths of AgroChain (things we keep)

1. **Enum stages** — clean, explicit state machine.
2. **Sequential enforcement** — `require(stage == PREVIOUS)` before advancing.
3. **Owner-only registration** — only the admin can add participants.
4. **Per-item struct** — each order carries its own stage and linked role IDs.

## Weaknesses of AgroChain (things we fix)

| Problem in AgroChain                  | Our Fix                                      |
| ------------------------------------- | -------------------------------------------- |
| No events emitted on any transition   | We emit an event on **every** stage change   |
| Manual role loops (`findXXX`) are O(n) and waste gas | OpenZeppelin `AccessControl` — O(1) role check via `hasRole()` |
| No "compromised" or error state       | We add a `Compromised` stage that **freezes** the paper |
| Old Solidity (`>=0.4.22`), no overflow protection | Solidity `^0.8.20` with built-in overflow checks |
| Single owner, no granular permissions | `AccessControl` with 5 distinct roles + admin |
| No timestamp guards                   | `releaseKey` requires `block.timestamp >= examTime` |
| No off-chain integration              | Express key service + AES-256-GCM encryption |
| No frontend event timeline            | React frontend builds timeline from contract events |

## How Our Design Maps

```
AgroChain concept        →  ExamPaperCustody equivalent
──────────────────────────────────────────────────────────
Order (pedido)           →  ExamPaper struct
STAGE enum               →  Stage enum (7 stages + Compromised)
Owner                    →  Controller (DEFAULT_ADMIN_ROLE)
Productor                →  Setter
Procesador               →  Moderator
Distribuidor             →  Printer
Mayorista                →  Centre
onlyByOwner modifier     →  onlyRole(ROLE) from AccessControl
addPROD / findPROD       →  grantRole() / hasRole()  (built-in)
(none)                   →  Events on every transition
(none)                   →  Compromised freeze stage
(none)                   →  examTime timestamp guard
```

## Key Takeaway

AgroChain proves the enum-stage + role-check pattern works for supply-chain
tracking. We adopt the same fundamental pattern but improve it with
OpenZeppelin's battle-tested role library, comprehensive events, a compromise
mechanism, and off-chain encryption — all targeting our specific exam-paper
custody use case.
