# Technical Deep-Dive: ExamCustody Smart Contract

> Comprehensive explanation of every function, security mechanism, and design decision.

---

## Table of Contents

1. [Contract Architecture Overview](#contract-architecture-overview)
2. [Role System (OpenZeppelin AccessControl)](#role-system-openzeppelin-accesscontrol)
3. [Stage Enum & State Machine](#stage-enum--state-machine)
4. [Data Structures](#data-structures)
5. [Events & Why They Matter](#events--why-they-matter)
6. [Custom Errors](#custom-errors)
7. [Modifiers: The Gatekeepers](#modifiers-the-gatekeepers)
8. [Constructor: Initial Setup](#constructor-initial-setup)
9. [Stage Transition Functions](#stage-transition-functions)
10. [Emergency Freeze Mechanism](#emergency-freeze-mechanism)
11. [Internal Helper Functions](#internal-helper-functions)
12. [Gas Optimization Techniques](#gas-optimization-techniques)
13. [Security Considerations](#security-considerations)
14. [Frequently Asked Questions](#frequently-asked-questions)

---

## Contract Architecture Overview

### Inheritance Chain

```solidity
ExamCustody is AccessControl
```

`ExamCustody` inherits from OpenZeppelin's `AccessControl.sol`, which provides:
- Role-based permission system
- `DEFAULT_ADMIN_ROLE` (bytes32(0)) for the superuser
- `grantRole()`, `revokeRole()`, `hasRole()` functions
- `onlyRole()` modifier for access control

**Why AccessControl?**
- **Battle-tested**: Used by thousands of production contracts
- **Gas-efficient**: Uses bytes32 role identifiers (cheaper than strings)
- **Flexible**: Multiple addresses can hold the same role
- **Hierarchical**: Admin role can manage all other roles

---

## Role System (OpenZeppelin AccessControl)

### Role Constants

```solidity
bytes32 public constant SETTER_ROLE    = keccak256("SETTER_ROLE");
bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
bytes32 public constant PRINTER_ROLE   = keccak256("PRINTER_ROLE");
bytes32 public constant CENTRE_ROLE    = keccak256("CENTRE_ROLE");
```

**How it works:**
- `keccak256("SETTER_ROLE")` produces a unique 32-byte hash
- This hash becomes the role identifier stored in OpenZeppelin's internal mapping
- Public constants allow the frontend to read role identifiers from the contract

**Example:**
```javascript
// Frontend can call this to get the role identifier
const setterRole = await contract.SETTER_ROLE();
// Returns: 0x8f8d8e.... (32-byte hash)

// Check if an address has the role
const isSetter = await contract.hasRole(setterRole, userAddress);
```

### DEFAULT_ADMIN_ROLE (Controller)

The Controller role is represented by `DEFAULT_ADMIN_ROLE`, which is inherited from `AccessControl` and has the value `bytes32(0)`.

**Special powers:**
- Can grant any role to any address via `grantRole()`
- Can revoke any role via `revokeRole()`
- Can renounce their own admin status (but shouldn't!)

**Why use DEFAULT_ADMIN_ROLE for Controller?**
- The deployer automatically gets this role in the constructor
- It's the only role that can manage other roles
- Follows OpenZeppelin's standard pattern

---

## Stage Enum & State Machine

### Enum Definition

```solidity
enum Stage {
    Created,           // 0
    Moderated,         // 1
    PrintedSealed,     // 2
    Dispatched,        // 3
    ReceivedAtCentre,  // 4
    KeyReleased,       // 5
    Opened,            // 6
    Compromised        // 7
}
```

**Under the hood:**
- Enums are stored as `uint8` (0-255)
- Each state is just a number: `Created = 0`, `Moderated = 1`, etc.
- Comparing enums is gas-efficient (simple integer comparison)

### State Transition Rules

```
Created ──[moderatePaper]──> Moderated
Moderated ──[printAndSeal]──> PrintedSealed
PrintedSealed ──[dispatch]──> Dispatched
Dispatched ──[receiveAtCentre]──> ReceivedAtCentre
ReceivedAtCentre ──[releaseKey]──> KeyReleased
KeyReleased ──[openPaper]──> Opened

Any Stage ──[flagCompromised]──> Compromised (terminal state)
```

**Enforcement:**
- Each transition function has an `onlyStage()` modifier that checks the current stage
- If you call `printAndSeal()` on a paper at stage `Created`, it reverts with `InvalidStage`
- Once a paper reaches `Compromised`, the `notCompromised` modifier blocks all further transitions

---

## Data Structures

### Paper Struct

```solidity
struct Paper {
    uint256 id;              // Unique identifier (1-indexed)
    bytes32 ciphertextHash;  // SHA-256 hash of encrypted file
    string  fileRef;         // Off-chain storage reference
    uint256 examTime;        // Unix timestamp (seconds since epoch)
    Stage   stage;           // Current stage (enum stored as uint8)
    address centre;          // Wallet address of assigned exam centre
}
```

**Field breakdown:**

| Field | Type | Size | Purpose |
|-------|------|------|---------|
| `id` | uint256 | 32 bytes | Unique paper identifier (starts at 1, 0 means "doesn't exist") |
| `ciphertextHash` | bytes32 | 32 bytes | SHA-256 hash of the AES-256-GCM encrypted exam paper |
| `fileRef` | string | Variable | Off-chain storage pointer (IPFS CID, URL, or filename) |
| `examTime` | uint256 | 32 bytes | Unix timestamp when the exam starts (enforced in `releaseKey()`) |
| `stage` | Stage (uint8) | 1 byte | Current position in the custody pipeline |
| `centre` | address | 20 bytes | Ethereum address of the exam centre assigned to this paper |

**Why this design?**

- **`bytes32` for hash**: Fixed-size, efficient, compatible with SHA-256 output
- **`string` for fileRef**: Flexible (IPFS CIDs are ~46 chars, URLs vary)
- **`uint256` for timestamp**: Standard Unix timestamp format, easy to compare with `block.timestamp`
- **`address` for centre**: Enables precise access control in `releaseKey()`

### State Variables

```solidity
uint256 public paperCount;
mapping(uint256 => Paper) public papers;
```

- **`paperCount`**: Running counter, also serves as the ID of the most recent paper
- **`papers`**: Mapping from paper ID to Paper struct (O(1) lookup)

**Why not an array?**
- Mappings are more gas-efficient for sparse data
- We don't need to iterate over all papers on-chain
- Frontend can query papers by ID directly

---

## Events & Why They Matter

### PaperCreated

```solidity
event PaperCreated(
    uint256 indexed paperId,
    bytes32 ciphertextHash,
    address indexed setter,
    address indexed centre,
    uint256 examTime
);
```

**Emitted when**: A new paper is registered via `createPaper()`

**Indexed fields** (`paperId`, `setter`, `centre`):
- Can be used as filters in event queries
- Example: "Show me all papers created by address 0xABC123"
- Maximum 3 indexed parameters per event (Solidity limit)

**Use cases:**
- Frontend builds a list of all papers by querying `PaperCreated` events
- Auditors can trace which Setter uploaded which paper
- Centres can find papers assigned to them

### StageChanged

```solidity
event StageChanged(
    uint256 indexed paperId,
    Stage   oldStage,
    Stage   newStage,
    address indexed changedBy
);
```

**Emitted when**: Any stage transition occurs (except create & compromise)

**Why track `oldStage`?**
- Enables verification that transitions happened in order
- Auditors can reconstruct the full history even if they missed intermediate events

**Use cases:**
- **Timeline visualization**: Frontend queries all `StageChanged` events for a paper and renders a timeline
- **Forensics**: If a paper is compromised, investigators can see exactly when and by whom each transition occurred

### PaperCompromised

```solidity
event PaperCompromised(
    uint256 indexed paperId,
    address indexed flaggedBy
);
```

**Emitted when**: Anyone with a role calls `flagCompromised()`

**Use cases:**
- **Incident response**: Alerts all stakeholders that a paper has been flagged
- **Attribution**: Records who raised the alarm (useful for audits)

---

## Custom Errors

Solidity 0.8.4+ introduced custom errors as a gas-efficient alternative to `require` strings.

### InvalidStage

```solidity
error InvalidStage(uint256 paperId, Stage expected, Stage actual);
```

**Usage:**
```solidity
if (current != _expected) {
    revert InvalidStage(_paperId, _expected, current);
}
```

**Example revert:**
```
Error: InvalidStage(1, Moderated, Created)
Meaning: Paper #1 expected stage Moderated, but is at Created
```

**Why better than strings?**
- Gas savings: ~1,000 gas per revert vs. `require("Stage must be X")`
- Structured data: Frontend can parse error params programmatically
- Type safety: Parameters are strongly typed

### PaperIsCompromised

```solidity
error PaperIsCompromised(uint256 paperId);
```

Thrown when trying to perform any stage transition on a compromised paper.

### PaperDoesNotExist

```solidity
error PaperDoesNotExist(uint256 paperId);
```

Thrown when accessing a paper ID that hasn't been created yet (ID = 0 or ID > paperCount).

### NotAssignedCentre

```solidity
error NotAssignedCentre(uint256 paperId, address caller, address expected);
```

Thrown when a Centre tries to receive/release a paper that isn't assigned to them.

### ExamTimeNotReached

```solidity
error ExamTimeNotReached(uint256 paperId, uint256 examTime, uint256 currentTime);
```

Thrown when `releaseKey()` is called before the exam start time.

### CallerHasNoRole

```solidity
error CallerHasNoRole(address caller);
```

Thrown when someone without any role tries to call `flagCompromised()`.

---

## Modifiers: The Gatekeepers

### paperExists

```solidity
modifier paperExists(uint256 _paperId) {
    if (_paperId == 0 || _paperId > paperCount) {
        revert PaperDoesNotExist(_paperId);
    }
    _;
}
```

**Purpose**: Ensures the paper ID is valid before executing the function

**Why check `_paperId == 0`?**
- Paper IDs start at 1 (incremented before assignment)
- 0 is reserved as a sentinel value meaning "doesn't exist"

**Example usage:**
```solidity
function moderatePaper(uint256 _paperId)
    external
    paperExists(_paperId)  // ← Modifier checks ID first
{ ... }
```

### onlyStage

```solidity
modifier onlyStage(uint256 _paperId, Stage _expected) {
    Stage current = papers[_paperId].stage;
    if (current != _expected) {
        revert InvalidStage(_paperId, _expected, current);
    }
    _;
}
```

**Purpose**: Enforces that a paper is at the correct stage before allowing the transition

**Example:**
```solidity
function dispatch(uint256 _paperId)
    external
    onlyStage(_paperId, Stage.PrintedSealed)  // ← Must be at PrintedSealed
{ ... }
```

If you call `dispatch()` on a paper at stage `Moderated`, it reverts with:
```
InvalidStage(paperId: 1, expected: PrintedSealed, actual: Moderated)
```

### notCompromised

```solidity
modifier notCompromised(uint256 _paperId) {
    if (papers[_paperId].stage == Stage.Compromised) {
        revert PaperIsCompromised(_paperId);
    }
    _;
}
```

**Purpose**: Blocks all stage transitions if the paper has been flagged as compromised

**Why is this needed?**
- Once a leak is detected, we must freeze the paper immediately
- Without this, an attacker could continue advancing the stage to cover their tracks

---

## Constructor: Initial Setup

```solidity
constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
}
```

**What happens:**
1. The address that deploys the contract (`msg.sender`) is granted `DEFAULT_ADMIN_ROLE`
2. This address becomes the Controller (superuser)
3. The Controller can then grant Setter, Moderator, Printer, and Centre roles to other addresses

**Why not assign all roles in the constructor?**
- We don't know the role addresses at deployment time
- The Controller should assign roles dynamically (e.g., via a deployment script or admin UI)

---

## Stage Transition Functions

### 1. createPaper

```solidity
function createPaper(
    bytes32 _ciphertextHash,
    string  calldata _fileRef,
    uint256 _examTime,
    address _centre
)
    external
    onlyRole(SETTER_ROLE)
    returns (uint256 paperId)
```

**Who can call**: Only accounts with `SETTER_ROLE`

**Parameters:**
- `_ciphertextHash`: SHA-256 hash of the AES-256-GCM encrypted exam paper
- `_fileRef`: Off-chain storage reference (e.g., IPFS CID: `QmXyz...`)
- `_examTime`: Unix timestamp when the exam starts (e.g., `1734249600` = Dec 15, 2024 09:00 UTC)
- `_centre`: Ethereum address of the exam centre that will administer this exam

**What it does:**
1. Increments `paperCount` (IDs start at 1)
2. Creates a new `Paper` struct with stage = `Created`
3. Stores it in the `papers` mapping
4. Emits `PaperCreated` event
5. Returns the new paper ID

**Why `calldata` for `_fileRef`?**
- `calldata` is read-only and cheaper than `memory` for external functions
- Strings are copied to storage anyway, so no need for intermediate memory allocation

**Security considerations:**
- ✅ Setter cannot skip stages (paper always starts at `Created`)
- ✅ Ciphertext hash is immutable once stored (no update function)
- ⚠️ No validation on `_examTime` (could be in the past or far future) — this is intentional to allow flexible testing

---

### 2. moderatePaper

```solidity
function moderatePaper(uint256 _paperId)
    external
    onlyRole(MODERATOR_ROLE)
    paperExists(_paperId)
    notCompromised(_paperId)
    onlyStage(_paperId, Stage.Created)
```

**Transition**: `Created → Moderated`

**Who can call**: Only accounts with `MODERATOR_ROLE`

**Modifier stack (order matters!):**
1. `onlyRole(MODERATOR_ROLE)` — Check role first (cheapest check)
2. `paperExists(_paperId)` — Ensure paper ID is valid
3. `notCompromised(_paperId)` — Block if paper is frozen
4. `onlyStage(_paperId, Stage.Created)` — Verify stage

**Why this order?**
- **Gas optimization**: Fail early on the cheapest checks
- `onlyRole` just reads a mapping (cheap)
- `paperExists` is a simple arithmetic check
- `notCompromised` and `onlyStage` read storage (more expensive)

---

### 3. printAndSeal

```solidity
function printAndSeal(uint256 _paperId)
    external
    onlyRole(PRINTER_ROLE)
    paperExists(_paperId)
    notCompromised(_paperId)
    onlyStage(_paperId, Stage.Moderated)
```

**Transition**: `Moderated → PrintedSealed`

**Who can call**: Only accounts with `PRINTER_ROLE`

**Real-world interpretation:**
- The Printer has physically printed the exam paper from the encrypted file
- They have sealed it in tamper-evident envelopes/packets
- This on-chain transition confirms that the physical printing is complete

---

### 4. dispatch

```solidity
function dispatch(uint256 _paperId)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    paperExists(_paperId)
    notCompromised(_paperId)
    onlyStage(_paperId, Stage.PrintedSealed)
```

**Transition**: `PrintedSealed → Dispatched`

**Who can call**: Only the Controller (admin)

**Why Controller instead of Printer?**
- Dispatch is a high-stakes decision (papers leave the central facility)
- Requires administrative approval
- Controller has oversight over the entire pipeline

---

### 5. receiveAtCentre

```solidity
function receiveAtCentre(uint256 _paperId)
    external
    onlyRole(CENTRE_ROLE)
    paperExists(_paperId)
    notCompromised(_paperId)
    onlyStage(_paperId, Stage.Dispatched)
{
    // Extra check: only the assigned centre can receive this paper
    if (msg.sender != papers[_paperId].centre) {
        revert NotAssignedCentre(_paperId, msg.sender, papers[_paperId].centre);
    }
    // ... stage transition ...
}
```

**Transition**: `Dispatched → ReceivedAtCentre`

**Who can call**: Only the **specific** exam centre assigned to this paper

**Dual verification:**
1. `onlyRole(CENTRE_ROLE)` — Caller must have Centre role
2. `msg.sender == papers[_paperId].centre` — Caller must be the **assigned** centre

**Why two checks?**
- Multiple centres may have `CENTRE_ROLE`
- We must prevent Centre A from receiving Centre B's papers
- This is paper-specific access control (role + assigned address)

---

### 6. releaseKey (Time-Locked)

```solidity
function releaseKey(uint256 _paperId)
    external
    onlyRole(CENTRE_ROLE)
    paperExists(_paperId)
    notCompromised(_paperId)
    onlyStage(_paperId, Stage.ReceivedAtCentre)
{
    // Check 1: Assigned centre only
    if (msg.sender != papers[_paperId].centre) {
        revert NotAssignedCentre(_paperId, msg.sender, papers[_paperId].centre);
    }

    // Check 2: Exam time must have arrived
    if (block.timestamp < papers[_paperId].examTime) {
        revert ExamTimeNotReached(
            _paperId,
            papers[_paperId].examTime,
            block.timestamp
        );
    }

    // ... stage transition ...
}
```

**Transition**: `ReceivedAtCentre → KeyReleased`

**Who can call**: Only the assigned centre, **after** the exam start time

**Time-lock mechanism:**
- `block.timestamp` is the current Unix timestamp of the Ethereum block
- If `block.timestamp < examTime`, the transaction reverts
- This ensures keys cannot be released early, even by the assigned centre

**Example:**
```
examTime = 1734249600 (Dec 15, 2024 09:00 UTC)
block.timestamp = 1734240000 (Dec 15, 2024 06:20 UTC)
Result: Reverts with ExamTimeNotReached
```

**Security note:**
- Ethereum miners can manipulate `block.timestamp` by ~15 seconds
- For exam scenarios (hours/days precision), this is negligible
- For sub-minute precision, use block number-based timing instead

---

### 7. openPaper

```solidity
function openPaper(uint256 _paperId)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    paperExists(_paperId)
    notCompromised(_paperId)
    onlyStage(_paperId, Stage.KeyReleased)
```

**Transition**: `KeyReleased → Opened`

**Who can call**: Only the Controller

**Why Controller instead of Centre?**
- Final administrative confirmation that the exam has begun
- Provides a global audit trail (all exams marked opened by central authority)

---

## Emergency Freeze Mechanism

### flagCompromised

```solidity
function flagCompromised(uint256 _paperId)
    external
    paperExists(_paperId)
    notCompromised(_paperId)
{
    // Caller must hold at least one role
    if (!_hasAnyRole(msg.sender)) {
        revert CallerHasNoRole(msg.sender);
    }

    papers[_paperId].stage = Stage.Compromised;
    emit PaperCompromised(_paperId, msg.sender);
}
```

**Who can call**: Any registered stakeholder (Setter, Moderator, Printer, Centre, or Controller)

**Why allow any role to flag?**
- **Distributed trust**: Any participant in the pipeline can sound the alarm
- **Incident response**: Faster reaction time (no need to wait for admin approval)
- **Accountability**: The `PaperCompromised` event records who flagged it

**What happens after flagging:**
- Stage becomes `Compromised`
- All future calls to `moderatePaper()`, `dispatch()`, etc. revert due to `notCompromised` modifier
- The paper is permanently frozen (no recovery path)

**Why no un-flag function?**
- Compromise is irreversible in real-world security
- Un-flagging would undermine the integrity of the audit trail
- If a false flag occurs, the Controller can create a new paper record

---

## Internal Helper Functions

### _hasAnyRole

```solidity
function _hasAnyRole(address _account) internal view returns (bool) {
    return hasRole(DEFAULT_ADMIN_ROLE, _account)
        || hasRole(SETTER_ROLE, _account)
        || hasRole(MODERATOR_ROLE, _account)
        || hasRole(PRINTER_ROLE, _account)
        || hasRole(CENTRE_ROLE, _account);
}
```

**Purpose**: Check if an address has **any** of the five roles

**Why not public?**
- Only used internally by `flagCompromised()`
- Making it public would waste gas on unnecessary external function overhead

**Alternative implementation (not used):**
```solidity
// Naive approach: store all accounts in an array
address[] public allRoleHolders;
```
**Why this is bad:**
- O(n) lookup (gas cost scales with number of accounts)
- Must maintain synchronization when roles are granted/revoked

**Our approach:**
- Five O(1) mapping lookups (constant gas)
- No extra storage required

---

## Gas Optimization Techniques

### 1. Custom Errors Instead of Require Strings

**Before (expensive):**
```solidity
require(msg.sender == papers[_paperId].centre, "Not the assigned centre");
// Gas cost: ~3,000
```

**After (optimized):**
```solidity
if (msg.sender != papers[_paperId].centre) {
    revert NotAssignedCentre(_paperId, msg.sender, papers[_paperId].centre);
}
// Gas cost: ~2,000
```

**Savings**: ~1,000 gas per revert

### 2. Storage Packing (Automatic)

The `Paper` struct fields are automatically packed by Solidity:
```
Slot 0: id (32 bytes)
Slot 1: ciphertextHash (32 bytes)
Slot 2-N: fileRef (dynamic, multiple slots)
Slot N+1: examTime (32 bytes)
Slot N+2: stage (1 byte) + centre (20 bytes) [packed together!]
```

**Why `stage` and `centre` share a slot:**
- `Stage` enum is `uint8` (1 byte)
- `address` is 20 bytes
- Total: 21 bytes (fits in one 32-byte slot)
- Saves one `SLOAD` operation (~2,100 gas) when reading both

### 3. Incremental Paper ID

**Why start at 1 instead of 0?**
```solidity
paperCount++;
paperId = paperCount;
```

- Using 0 as a sentinel value ("doesn't exist") allows simple existence checks
- No need for separate `mapping(uint256 => bool) exists`

### 4. Early Reverts

Modifiers are ordered from cheapest to most expensive:
1. `onlyRole()` — reads OpenZeppelin's role mapping
2. `paperExists()` — arithmetic comparison
3. `notCompromised()` — storage read
4. `onlyStage()` — storage read + enum comparison

---

## Security Considerations

### Access Control

**✅ Strengths:**
- OpenZeppelin's battle-tested AccessControl
- Multi-layered modifiers (role + stage + assigned actor)
- Time-lock enforcement on key release

**⚠️ Considerations:**
- Private key compromise: If a role's key is stolen, the attacker can act as that role
- Mitigation: Use hardware wallets, multi-sig, or threshold signatures in production

### Stage Integrity

**✅ Strengths:**
- Strict ordering enforced by `onlyStage` modifier
- No way to skip or regress stages (except via `Compromised`)

**⚠️ Considerations:**
- A malicious role could refuse to advance a paper (DoS)
- Mitigation: Timeout mechanisms or admin override (not implemented)

### Time-Lock Bypass

**✅ Strengths:**
- `block.timestamp` enforced on-chain in `releaseKey()`
- Backend key service double-checks stage before releasing key

**⚠️ Considerations:**
- Miners can manipulate `block.timestamp` by ~15 seconds
- Mitigation: Acceptable for hour/day-level precision; use block numbers for sub-minute precision

### Ciphertext Hash Immutability

**✅ Strengths:**
- No update function — hash cannot be changed after creation
- Ensures the paper on-chain always matches the encrypted file

**⚠️ Considerations:**
- If the Setter uploads the wrong hash, they must create a new paper record
- Mitigation: Frontend should show hash preview and require confirmation

### Compromise Abuse

**✅ Strengths:**
- Only registered roles can flag compromise
- `PaperCompromised` event creates accountability

**⚠️ Considerations:**
- A malicious role could falsely flag papers as compromised (griefing attack)
- Mitigation: Social/legal consequences + event logs identify the malicious actor

---

## Frequently Asked Questions

### 1. Why not put the exam questions directly on-chain?

**Answer:** 
- Blockchain data is **public and immutable**. Anyone could read the questions before the exam.
- We encrypt the paper off-chain with AES-256-GCM and only store the **ciphertext hash** on-chain.
- The decryption key is held by the backend and only released when the contract stage is `KeyReleased`.

---

### 2. How does the time-lock in `releaseKey()` work?

**Answer:**
```solidity
if (block.timestamp < papers[_paperId].examTime) {
    revert ExamTimeNotReached(...);
}
```
- `block.timestamp` is the Unix timestamp of the current Ethereum block (seconds since Jan 1, 1970 UTC).
- If the exam starts at 09:00, `examTime = 1734249600`.
- Any call to `releaseKey()` before 09:00 will revert.
- Once the clock passes 09:00, the transaction succeeds.

**Miner manipulation:**
- Miners can skew `block.timestamp` by ±15 seconds.
- For exams (hour/day precision), this is negligible.

---

### 3. What prevents Centre A from unlocking Centre B's paper?

**Answer:**
Two checks in `receiveAtCentre()` and `releaseKey()`:
```solidity
if (msg.sender != papers[_paperId].centre) {
    revert NotAssignedCentre(...);
}
```
- Every paper has an assigned `centre` address.
- Even if Centre A has `CENTRE_ROLE`, they cannot act on papers assigned to Centre B.

---

### 4. Can the Controller change the ciphertext hash after creation?

**Answer:**
No. There is no `updatePaper()` function. Once `createPaper()` stores the hash, it's **immutable**.

**Why?**
- Prevents tampering (even by admin).
- If a hash is wrong, the Setter must create a new paper record.

---

### 5. What happens if a paper is flagged as `Compromised`?

**Answer:**
- Stage becomes `Stage.Compromised` (value 7).
- All stage transition functions have the `notCompromised` modifier:
  ```solidity
  modifier notCompromised(uint256 _paperId) {
      if (papers[_paperId].stage == Stage.Compromised) {
          revert PaperIsCompromised(_paperId);
      }
      _;
  }
  ```
- Any subsequent call to `moderatePaper()`, `dispatch()`, etc. reverts.
- The paper is **frozen permanently**. No un-flag mechanism exists.

---

### 6. Why use OpenZeppelin AccessControl instead of a simple role array?

**Answer:**
- **Gas efficiency**: O(1) role lookups (mapping) vs. O(n) array iteration.
- **Battle-tested**: Used in thousands of production contracts.
- **Flexibility**: Multiple addresses can hold the same role (e.g., multiple centres).
- **Hierarchical**: Admin role can grant/revoke all other roles.

---

### 7. Can stages be skipped (e.g., Created → PrintedSealed)?

**Answer:**
No. The `onlyStage` modifier enforces strict ordering:
```solidity
function printAndSeal(uint256 _paperId)
    onlyStage(_paperId, Stage.Moderated)  // Must be at Moderated
```
- If you call `printAndSeal()` on a paper at `Created`, it reverts with `InvalidStage`.

---

### 8. What's the purpose of the `paperCount` variable?

**Answer:**
Dual purpose:
1. **Counter**: Tracks how many papers have been created.
2. **ID generator**: `paperCount++; paperId = paperCount;` assigns sequential IDs starting at 1.

**Why start at 1?**
- 0 is a sentinel value meaning "doesn't exist".
- Simplifies existence checks: `if (_paperId == 0 || _paperId > paperCount) revert;`

---

### 9. Why emit events if the data is already in storage?

**Answer:**
- **Events are cheaper** than storage (~375 gas vs. ~5,000 gas per 32 bytes).
- **Off-chain indexing**: Frontends use events to build timelines without querying every paper.
- **Auditability**: Event logs are permanent and cannot be altered (unlike storage, which can be updated).

**Example:**
```javascript
// Frontend queries all StageChanged events for paper #1
const events = await contract.queryFilter(
    contract.filters.StageChanged(1)
);
// Builds timeline: Created → Moderated → PrintedSealed → ...
```

---

### 10. How does the backend know when to release the decryption key?

**Answer:**
The Express server queries the contract before releasing a key:
```javascript
const paper = await contract.papers(paperId);
if (paper.stage !== 5) {  // 5 = KeyReleased
    return res.status(403).json({ error: "Key not released yet" });
}
if (paper.centre !== callerAddress) {
    return res.status(403).json({ error: "Not the assigned centre" });
}
// ... additional signature verification ...
// Release key
```

---

### 11. What prevents replay attacks on the key service?

**Answer:**
Challenge-response protocol with ECDSA signatures:
1. Centre requests a challenge: `GET /api/challenge/:paperId`
2. Backend returns a timestamped message: `"Release key for paper 1 at 1734249600"`
3. Centre signs the message with their private key
4. Backend verifies the signature using `ethers.verifyMessage()`
5. Backend checks the timestamp is recent (within 5 minutes)

**Why this works:**
- Each challenge is unique (includes timestamp)
- Signature proves the Centre owns the private key
- Old signatures cannot be replayed (timestamp expires)

---

### 12. Can the contract be upgraded?

**Answer:**
No. This is a **non-upgradeable** contract.

**Why?**
- Simplicity (no proxy pattern complexity)
- Immutability guarantees (no admin can change logic post-deployment)

**Implications:**
- Bug fixes require redeployment
- State migration requires off-chain scripts

**Production alternative:**
- Use OpenZeppelin's UUPS or Transparent Proxy pattern

---

### 13. Why is `fileRef` a `string` instead of `bytes32`?

**Answer:**
- IPFS CIDs (Content Identifiers) are ~46 characters: `QmXyz...` (base58 encoded)
- URLs can be 100+ characters: `https://storage.example.com/papers/exam-2024-cs101.enc`
- `bytes32` can only store 32 bytes (32 ASCII chars)
- `string` is dynamic and can store arbitrary-length data

**Tradeoff:**
- Strings are more expensive to store (~5,000 gas per 32 bytes)
- But necessary for real-world storage references

---

### 14. What's the gas cost breakdown for creating a paper?

**Approximate costs (Ethereum mainnet):**
- Contract deployment: ~1,500,000 gas
- `createPaper()` call: ~150,000 gas
  - Write to `paperCount`: ~20,000 gas
  - Write to `papers` mapping: ~100,000 gas (struct storage)
  - Emit `PaperCreated` event: ~3,000 gas per indexed field

**At 30 gwei gas price and $3,000 ETH:**
- Deployment: ~$135
- Per paper: ~$13.50

**Optimization ideas:**
- Use Layer 2 (Polygon, Arbitrum): 100x cheaper
- Batch create multiple papers: amortize fixed costs

---

### 15. How would you extend this contract for multiple exam sessions?

**Answer:**
Add an `examSession` field to the `Paper` struct:
```solidity
struct Paper {
    uint256 id;
    bytes32 ciphertextHash;
    string  fileRef;
    uint256 examTime;
    Stage   stage;
    address centre;
    uint256 sessionId;  // ← New field
}

mapping(uint256 => string) public sessions;  // sessionId => "Fall 2024 Midterms"
```

**Benefits:**
- Group papers by session
- Query all papers for a session
- Generate session-level reports

---

## Conclusion

The `ExamCustody` contract implements a **role-based, stage-driven, time-locked** chain-of-custody system with:
- **7 custody stages** enforced by a finite state machine
- **5 roles** managed by OpenZeppelin AccessControl
- **3 events** for immutable audit trails
- **Time-lock** enforcement for key release
- **Emergency freeze** mechanism callable by any stakeholder

**Key takeaways:**
- Off-chain encryption protects paper content
- On-chain logic enforces custody rules
- Events enable real-time monitoring and forensic analysis
- Custom errors save gas while maintaining developer ergonomics

For integration questions or contribution ideas, see the main [README](../README.md) or open a GitHub issue.
