// Integration Tests for Express Key Service — Day 5
//
// Tests off-chain key custody, cryptographic wallet verification,
// on-chain stage gating, and AES-256-GCM authenticated decryption.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const http = require("http");
const fs = require("fs");
const path = require("path");

const app = require("../server/server");
const { encrypt, decrypt } = require("../server/cryptoUtils");

describe("Key Service & Off-Chain Encryption (Day 5)", function () {
  let examCustody;
  let controller, setter, moderator, printer, centre, otherCentre, outsider;
  let server, baseUrl;
  let testPaperId = 999; // isolated ID for key service tests
  let sampleKey, sampleIv, sampleAuthTag, sampleCiphertext, sampleCiphertextHash;
  let sampleExamTime;

  const testPlaintext = "CONFIDENTIAL FINAL EXAM: CS401 — 2026. Question 1: What is PBFT?";

  before(async function () {
    // 1. Start Express server on ephemeral port (port 0 = OS assigns free port)
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(function (done) {
    // Cleanup test files created in storage
    const cPath = path.join(__dirname, "../server/storage/ciphertexts", `${testPaperId}.json`);
    const kPath = path.join(__dirname, "../server/storage/keys", `${testPaperId}.key`);
    if (fs.existsSync(cPath)) fs.unlinkSync(cPath);
    if (fs.existsSync(kPath)) fs.unlinkSync(kPath);

    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(async function () {
    // 2. Setup accounts & deploy contract
    [controller, setter, moderator, printer, centre, otherCentre, outsider] =
      await ethers.getSigners();

    const ExamCustody = await ethers.getContractFactory("ExamCustody");
    examCustody = await ExamCustody.deploy();
    await examCustody.waitForDeployment();

    // Assign roles
    const SETTER_ROLE = await examCustody.SETTER_ROLE();
    const MODERATOR_ROLE = await examCustody.MODERATOR_ROLE();
    const PRINTER_ROLE = await examCustody.PRINTER_ROLE();
    const CENTRE_ROLE = await examCustody.CENTRE_ROLE();

    await examCustody.connect(controller).grantRole(SETTER_ROLE, setter.address);
    await examCustody.connect(controller).grantRole(MODERATOR_ROLE, moderator.address);
    await examCustody.connect(controller).grantRole(PRINTER_ROLE, printer.address);
    await examCustody.connect(controller).grantRole(CENTRE_ROLE, centre.address);
    await examCustody.connect(controller).grantRole(CENTRE_ROLE, otherCentre.address);

    // Inject contract into server
    app.setContractInstance(examCustody);

    // 3. Encrypt sample test paper and save to server storage
    const encResult = encrypt(testPlaintext);
    sampleKey = encResult.key;
    sampleIv = encResult.iv;
    sampleAuthTag = encResult.authTag;
    sampleCiphertext = encResult.ciphertext;
    sampleCiphertextHash = encResult.ciphertextHash;

    const latestTime = await time.latest();
    sampleExamTime = latestTime + 86400;

    // Save ciphertext bundle
    const cDir = path.join(__dirname, "../server/storage/ciphertexts");
    const kDir = path.join(__dirname, "../server/storage/keys");
    if (!fs.existsSync(cDir)) fs.mkdirSync(cDir, { recursive: true });
    if (!fs.existsSync(kDir)) fs.mkdirSync(kDir, { recursive: true });

    fs.writeFileSync(
      path.join(cDir, `${testPaperId}.json`),
      JSON.stringify({
        paperId: testPaperId,
        subject: "CS401: Key Service Test",
        ciphertext: sampleCiphertext,
        iv: sampleIv,
        authTag: sampleAuthTag,
        ciphertextHash: sampleCiphertextHash,
        fileRef: `storage://ciphertexts/${testPaperId}.json`,
        examTime: sampleExamTime,
        assignedCentre: centre.address
      })
    );

    // Save key
    fs.writeFileSync(
      path.join(kDir, `${testPaperId}.key`),
      JSON.stringify({
        paperId: testPaperId,
        keyHex: sampleKey,
        ciphertextHash: sampleCiphertextHash,
        assignedCentre: centre.address
      })
    );

    // Create paper on-chain (Stage: Created = 0)
    // Note: createPaper will assign ID = paperCount (which is 1)
    await examCustody
      .connect(setter)
      .createPaper(sampleCiphertextHash, `storage://ciphertexts/${testPaperId}.json`, sampleExamTime, centre.address);

    // To align storage paperId with on-chain paperId:
    const onChainId = await examCustody.paperCount();
    testPaperId = Number(onChainId);

    fs.writeFileSync(
      path.join(cDir, `${testPaperId}.json`),
      JSON.stringify({
        paperId: testPaperId,
        subject: "CS401: Key Service Test",
        ciphertext: sampleCiphertext,
        iv: sampleIv,
        authTag: sampleAuthTag,
        ciphertextHash: sampleCiphertextHash,
        fileRef: `storage://ciphertexts/${testPaperId}.json`,
        examTime: sampleExamTime,
        assignedCentre: centre.address
      })
    );

    fs.writeFileSync(
      path.join(kDir, `${testPaperId}.key`),
      JSON.stringify({
        paperId: testPaperId,
        keyHex: sampleKey,
        ciphertextHash: sampleCiphertextHash,
        assignedCentre: centre.address
      })
    );
  });

  // ─────────────────────────────────────────
  //  1. Server Status & Public Endpoints
  // ─────────────────────────────────────────

  describe("API Status & Metadata", function () {
    it("should return online status from GET /api/status", async function () {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.status).to.equal("online");
      expect(data.blockchainConnected).to.be.true;
    });

    it("should return ciphertext bundle from GET /api/papers/:id/ciphertext", async function () {
      const res = await fetch(`${baseUrl}/api/papers/${testPaperId}/ciphertext`);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.paperId).to.equal(testPaperId);
      expect(data.ciphertext).to.equal(sampleCiphertext);
      expect(data.ciphertextHash).to.equal(sampleCiphertextHash);
    });

    it("should generate a challenge message from GET /api/challenge/:id", async function () {
      const res = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${centre.address}`);
      expect(res.status).to.equal(200);

      const data = await res.json();
      expect(data.paperId).to.equal(String(testPaperId));
      expect(data.walletAddress).to.equal(centre.address);
      expect(data.challenge).to.include(`Paper #${testPaperId}`);
    });
  });

  // ─────────────────────────────────────────
  //  2. Cryptographic Wallet Verification
  // ─────────────────────────────────────────

  describe("Cryptographic Wallet Verification (Anti-Spoofing)", function () {
    it("should reject key release if signature is signed by a different wallet than claimed", async function () {
      const challengeRes = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${centre.address}`);
      const { challenge } = await challengeRes.json();

      // Outsider signs the challenge, but claims to be Centre
      const fakeSignature = await outsider.signMessage(challenge);

      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: fakeSignature,
          walletAddress: centre.address, // spoofing attempt!
          challenge: challenge
        })
      });

      expect(releaseRes.status).to.equal(401);
      const data = await releaseRes.json();
      expect(data.error).to.include("Signature verification failed");
    });

    it("should reject key release with malformed signature", async function () {
      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: "0xInvalidSignatureBytes",
          walletAddress: centre.address,
          challenge: "Some random text"
        })
      });

      expect(releaseRes.status).to.equal(401);
    });
  });

  // ─────────────────────────────────────────
  //  3. On-Chain Stage Gating
  // ─────────────────────────────────────────

  describe("On-Chain Stage Gating (Stage Checks)", function () {
    it("should reject key release when paper is at Stage.Created (0)", async function () {
      // Paper is currently at Created (0)
      const challengeRes = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${centre.address}`);
      const { challenge } = await challengeRes.json();
      const signature = await centre.signMessage(challenge);

      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          walletAddress: centre.address,
          challenge
        })
      });

      expect(releaseRes.status).to.equal(403);
      const data = await releaseRes.json();
      expect(data.error).to.include("Decryption key not yet released on-chain");
      expect(data.error).to.include("Created");
    });

    it("should reject key release when paper is at Stage.ReceivedAtCentre (4)", async function () {
      // Advance pipeline: Created -> Moderated -> PrintedSealed -> Dispatched -> ReceivedAtCentre
      await examCustody.connect(moderator).moderatePaper(testPaperId);
      await examCustody.connect(printer).printAndSeal(testPaperId);
      await examCustody.connect(controller).dispatch(testPaperId);
      await examCustody.connect(centre).receiveAtCentre(testPaperId);

      const challengeRes = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${centre.address}`);
      const { challenge } = await challengeRes.json();
      const signature = await centre.signMessage(challenge);

      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          walletAddress: centre.address,
          challenge
        })
      });

      expect(releaseRes.status).to.equal(403);
      const data = await releaseRes.json();
      expect(data.error).to.include("ReceivedAtCentre");
    });

    it("should reject key release if paper is flagged as Compromised (7)", async function () {
      // Advance to ReceivedAtCentre
      await examCustody.connect(moderator).moderatePaper(testPaperId);
      await examCustody.connect(printer).printAndSeal(testPaperId);
      await examCustody.connect(controller).dispatch(testPaperId);
      await examCustody.connect(centre).receiveAtCentre(testPaperId);

      // Flag as compromised!
      await examCustody.connect(moderator).flagCompromised(testPaperId);

      const challengeRes = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${centre.address}`);
      const { challenge } = await challengeRes.json();
      const signature = await centre.signMessage(challenge);

      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          walletAddress: centre.address,
          challenge
        })
      });

      expect(releaseRes.status).to.equal(403);
      const data = await releaseRes.json();
      expect(data.error).to.include("COMPROMISED");
    });

    it("should reject key release if a different centre (otherCentre) requests the key", async function () {
      // Advance to KeyReleased
      await examCustody.connect(moderator).moderatePaper(testPaperId);
      await examCustody.connect(printer).printAndSeal(testPaperId);
      await examCustody.connect(controller).dispatch(testPaperId);
      await examCustody.connect(centre).receiveAtCentre(testPaperId);
      await time.increaseTo(sampleExamTime);
      await examCustody.connect(centre).releaseKey(testPaperId);

      // otherCentre attempts to request the key
      const challengeRes = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${otherCentre.address}`);
      const { challenge } = await challengeRes.json();
      const signature = await otherCentre.signMessage(challenge);

      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          walletAddress: otherCentre.address,
          challenge
        })
      });

      expect(releaseRes.status).to.equal(403);
      const data = await releaseRes.json();
      expect(data.error).to.include("not the designated exam centre");
    });

    it("should successfully release AES key when paper is KeyReleased (5) and caller is assigned centre", async function () {
      // Advance to KeyReleased
      await examCustody.connect(moderator).moderatePaper(testPaperId);
      await examCustody.connect(printer).printAndSeal(testPaperId);
      await examCustody.connect(controller).dispatch(testPaperId);
      await examCustody.connect(centre).receiveAtCentre(testPaperId);
      await time.increaseTo(sampleExamTime);
      await examCustody.connect(centre).releaseKey(testPaperId);

      // Assigned centre requests key
      const challengeRes = await fetch(`${baseUrl}/api/challenge/${testPaperId}?wallet=${centre.address}`);
      const { challenge } = await challengeRes.json();
      const signature = await centre.signMessage(challenge);

      const releaseRes = await fetch(`${baseUrl}/api/key/${testPaperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          walletAddress: centre.address,
          challenge
        })
      });

      expect(releaseRes.status).to.equal(200);
      const data = await releaseRes.json();
      expect(data.success).to.be.true;
      expect(data.keyHex).to.equal(sampleKey);
      expect(data.paperId).to.equal(testPaperId);
    });
  });

  // ─────────────────────────────────────────
  //  4. Decryption & Verification Endpoints
  // ─────────────────────────────────────────

  describe("Decryption & Hash Verification", function () {
    it("should decrypt ciphertext using the released key via /api/papers/:id/decrypt", async function () {
      const decryptRes = await fetch(`${baseUrl}/api/papers/${testPaperId}/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyHex: sampleKey })
      });

      expect(decryptRes.status).to.equal(200);
      const data = await decryptRes.json();
      expect(data.success).to.be.true;
      expect(data.plaintext).to.equal(testPlaintext);
    });

    it("should fail decryption if wrong key is provided (GCM authentication failure)", async function () {
      const wrongKey = ethers.hexlify(ethers.randomBytes(32)).replace("0x", "");
      const decryptRes = await fetch(`${baseUrl}/api/papers/${testPaperId}/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyHex: wrongKey })
      });

      expect(decryptRes.status).to.equal(400);
      const data = await decryptRes.json();
      expect(data.error).to.include("Decryption failed");
    });

    it("should verify SHA-256 ciphertext hash against blockchain via /api/verify-hash", async function () {
      const verifyRes = await fetch(`${baseUrl}/api/verify-hash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId: testPaperId,
          ciphertext: sampleCiphertext
        })
      });

      expect(verifyRes.status).to.equal(200);
      const data = await verifyRes.json();
      expect(data.matches).to.be.true;
      expect(data.status).to.include("VERIFIED");
    });
  });
});
