// Setter Script: Encrypt Question Paper & Register Off-Chain — Day 5
//
// Role: Paper Setter (SETTER_ROLE)
// Workflow:
// 1. Author questions in plaintext (or load a question paper file).
// 2. Encrypt using AES-256-GCM with a freshly generated 256-bit key.
// 3. Compute SHA-256 hash of the ciphertext (goes on-chain as `ciphertextHash`).
// 4. Store ciphertext locally in `server/storage/ciphertexts/<paperId>.json`.
// 5. Securely store the decryption key in `server/storage/keys/<paperId>.key`.
//    (The Express Key Service will guard this key and release it only when allowed).
// 6. Print the exact parameters to call `createPaper()` on the smart contract.

const fs = require("fs");
const path = require("path");
const { encrypt } = require("./cryptoUtils");

// Ensure storage directories exist
const CIPHERTEXT_DIR = path.join(__dirname, "storage", "ciphertexts");
const KEYS_DIR = path.join(__dirname, "storage", "keys");

if (!fs.existsSync(CIPHERTEXT_DIR)) {
  fs.mkdirSync(CIPHERTEXT_DIR, { recursive: true });
}
if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

// Read deployment info if available
let deploymentInfo = null;
const deploymentPath = path.join(__dirname, "deployment.json");
if (fs.existsSync(deploymentPath)) {
  try {
    deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  } catch (e) {
    // optional fallback
  }
}

/**
 * Default sample exam paper content for demonstration
 */
const DEFAULT_SAMPLE_PAPER = `
================================================================================
           UNIVERSITY INSTITUTE OF TECHNOLOGY & COMPUTER SCIENCE
           END-SEMESTER EXAMINATION — AUTUMN SEMESTER 2026
           COURSE: CS401 — DISTRIBUTED SYSTEMS & BLOCKCHAIN TECHNOLOGY
           MAX MARKS: 100                               TIME: 3 HOURS
================================================================================

SECTION A — MULTIPLE CHOICE & SHORT CONCEPTS (20 MARKS)
1. In Ethereum's state model, what data structure is used to maintain account state?
   A) B+ Tree       B) Merkle Patricia Trie   C) Binary Heap   D) Skip List
2. Explain the purpose of Galois/Counter Mode (GCM) in symmetric encryption.
3. Why should decryption keys never be transmitted or stored on a public blockchain?

SECTION B — SYSTEM DESIGN (40 MARKS)
4. Design a Byzantine Fault Tolerant (BFT) consensus mechanism for an exam
   paper chain-of-custody application. Specify the message rounds, quorum
   thresholds, and how sybil attacks are mitigated.
5. Draw the custody state diagram showing transitions from Created to Opened,
   highlighting the role-gating and time-lock constraints.

SECTION C — CODE IMPLEMENTATION (40 MARKS)
6. Write a Solidity modifier that ensures only the assigned examination centre
   can receive a packet and that prevents any action on compromised records.
7. Explain how off-chain digital signatures (ECDSA) are verified using
   ethers.js and how replay attacks are prevented using timestamped challenges.
================================================================================
`;

function run() {
  console.log("════════════════════════════════════════════════════════════");
  console.log("  Exam Paper Setter — AES-256-GCM Encryption Tool");
  console.log("════════════════════════════════════════════════════════════\n");

  // Determine paperId based on existing files or default to 1
  const existingFiles = fs.readdirSync(CIPHERTEXT_DIR).filter(f => f.endsWith(".json"));
  const paperId = existingFiles.length + 1;

  const subject = "CS401: Distributed Systems & Blockchain";
  const assignedCentre = deploymentInfo?.accounts?.centre1?.address ||
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

  // Exam start time: 2 hours from now
  const nowUnix = Math.floor(Date.now() / 1000);
  const examTime = nowUnix + (2 * 3600); // +2 hours

  console.log(`[1] Encrypting Exam Paper #${paperId}: "${subject}"...`);

  // Perform AES-256-GCM encryption
  const encResult = encrypt(DEFAULT_SAMPLE_PAPER);

  console.log(`    - AES-256 Key generated (32 bytes secret)`);
  console.log(`    - IV generated (12 bytes): ${encResult.iv}`);
  console.log(`    - GCM Auth Tag: ${encResult.authTag}`);
  console.log(`    - Ciphertext length: ${encResult.ciphertext.length} hex chars`);
  console.log(`    - SHA-256 Ciphertext Hash: ${encResult.ciphertextHash}`);

  // 1. Save ciphertext payload (public / off-chain storage)
  const ciphertextPayload = {
    paperId: paperId,
    subject: subject,
    ciphertext: encResult.ciphertext,
    iv: encResult.iv,
    authTag: encResult.authTag,
    ciphertextHash: encResult.ciphertextHash,
    fileRef: `storage://ciphertexts/${paperId}.json`,
    examTime: examTime,
    assignedCentre: assignedCentre,
    createdAt: new Date().toISOString()
  };

  const ciphertextFilePath = path.join(CIPHERTEXT_DIR, `${paperId}.json`);
  fs.writeFileSync(ciphertextFilePath, JSON.stringify(ciphertextPayload, null, 2));
  console.log(`\n[2] Saved ciphertext bundle to:`);
  console.log(`    ${ciphertextFilePath}`);

  // 2. Save key to Key Service store (confidential)
  const keyRecord = {
    paperId: paperId,
    subject: subject,
    keyHex: encResult.key,
    ciphertextHash: encResult.ciphertextHash,
    assignedCentre: assignedCentre,
    examTime: examTime,
    createdAt: new Date().toISOString()
  };

  const keyFilePath = path.join(KEYS_DIR, `${paperId}.key`);
  fs.writeFileSync(keyFilePath, JSON.stringify(keyRecord, null, 2));
  console.log(`\n[3] Saved AES decryption key to key service vault:`);
  console.log(`    ${keyFilePath}`);

  // 3. Print on-chain parameters for Setter
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  ON-CHAIN REGISTRATION PARAMETERS for Setter:");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Paper ID         : ${paperId}`);
  console.log(`  ciphertextHash   : ${encResult.ciphertextHash}`);
  console.log(`  fileRef          : storage://ciphertexts/${paperId}.json`);
  console.log(`  examTime         : ${examTime} (${new Date(examTime * 1000).toLocaleString()})`);
  console.log(`  centre           : ${assignedCentre}`);
  console.log("════════════════════════════════════════════════════════════\n");

  return {
    paperId,
    ciphertextHash: encResult.ciphertextHash,
    fileRef: `storage://ciphertexts/${paperId}.json`,
    examTime,
    assignedCentre
  };
}

if (require.main === module) {
  run();
}

module.exports = { run, DEFAULT_SAMPLE_PAPER };
