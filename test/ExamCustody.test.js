// Tests for ExamCustody.sol — Day 2 (createPaper + moderatePaper)
//
// We use Hardhat's built-in Mocha + Chai test runner with ethers.js.
// Each test deploys a fresh contract instance via beforeEach so tests
// are isolated from each other.

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ExamCustody", function () {

  // ── Test accounts ──
  // controller = deployer (gets DEFAULT_ADMIN_ROLE automatically)
  // setter, moderator, printer, centre = assigned their roles in beforeEach
  // outsider = has no role (used to test access-control reverts)
  let examCustody;
  let controller, setter, moderator, printer, centre, outsider;

  // Role hashes — read from the contract so they always match
  let SETTER_ROLE, MODERATOR_ROLE, PRINTER_ROLE, CENTRE_ROLE, DEFAULT_ADMIN_ROLE;

  // ── Sample paper data ──
  // We hash a fake string to simulate the SHA-256 of an encrypted file.
  // In production, this would be the actual hash of the AES-256-GCM ciphertext.
  const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("encrypted-paper-content"));
  const sampleFileRef = "ipfs://QmSampleCID123";
  // Exam time = 24 hours from now (we just need a future timestamp)
  const sampleExamTime = Math.floor(Date.now() / 1000) + 86400;

  beforeEach(async function () {
    // Get signers — Hardhat provides 20 test accounts by default
    [controller, setter, moderator, printer, centre, outsider] =
      await ethers.getSigners();

    // Deploy a fresh ExamCustody contract for each test
    const ExamCustody = await ethers.getContractFactory("ExamCustody");
    examCustody = await ExamCustody.deploy();
    await examCustody.waitForDeployment();

    // Read role constants from the deployed contract
    SETTER_ROLE       = await examCustody.SETTER_ROLE();
    MODERATOR_ROLE    = await examCustody.MODERATOR_ROLE();
    PRINTER_ROLE      = await examCustody.PRINTER_ROLE();
    CENTRE_ROLE       = await examCustody.CENTRE_ROLE();
    DEFAULT_ADMIN_ROLE = await examCustody.DEFAULT_ADMIN_ROLE();

    // Controller (deployer) grants roles to the test accounts
    await examCustody.connect(controller).grantRole(SETTER_ROLE, setter.address);
    await examCustody.connect(controller).grantRole(MODERATOR_ROLE, moderator.address);
    await examCustody.connect(controller).grantRole(PRINTER_ROLE, printer.address);
    await examCustody.connect(controller).grantRole(CENTRE_ROLE, centre.address);
  });

  // ─────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────

  describe("Deployment", function () {
    it("should grant DEFAULT_ADMIN_ROLE to the deployer", async function () {
      expect(
        await examCustody.hasRole(DEFAULT_ADMIN_ROLE, controller.address)
      ).to.be.true;
    });

    it("should start with zero papers", async function () {
      expect(await examCustody.paperCount()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────
  //  Role management (via AccessControl)
  // ─────────────────────────────────────────

  describe("Role management", function () {
    it("should allow the controller to grant roles", async function () {
      expect(await examCustody.hasRole(SETTER_ROLE, setter.address)).to.be.true;
      expect(await examCustody.hasRole(MODERATOR_ROLE, moderator.address)).to.be.true;
      expect(await examCustody.hasRole(PRINTER_ROLE, printer.address)).to.be.true;
      expect(await examCustody.hasRole(CENTRE_ROLE, centre.address)).to.be.true;
    });

    it("should reject role grants from a non-admin account", async function () {
      // outsider tries to grant themselves SETTER_ROLE — should fail
      await expect(
        examCustody.connect(outsider).grantRole(SETTER_ROLE, outsider.address)
      ).to.be.reverted;
    });
  });

  // ─────────────────────────────────────────
  //  createPaper
  // ─────────────────────────────────────────

  describe("createPaper", function () {
    it("should create a paper with correct on-chain data", async function () {
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);

      // Counter should be 1
      expect(await examCustody.paperCount()).to.equal(1);

      // Read the struct back from the mapping
      const paper = await examCustody.papers(1);
      expect(paper.id).to.equal(1);
      expect(paper.ciphertextHash).to.equal(sampleHash);
      expect(paper.fileRef).to.equal(sampleFileRef);
      expect(paper.examTime).to.equal(sampleExamTime);
      expect(paper.stage).to.equal(0); // Stage.Created = 0
      expect(paper.centre).to.equal(centre.address);
    });

    it("should emit a PaperCreated event with correct args", async function () {
      await expect(
        examCustody
          .connect(setter)
          .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address)
      )
        .to.emit(examCustody, "PaperCreated")
        .withArgs(1, sampleHash, setter.address, centre.address, sampleExamTime);
    });

    it("should assign sequential IDs to multiple papers", async function () {
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, "ipfs://QmSecondPaper", sampleExamTime, centre.address);

      expect(await examCustody.paperCount()).to.equal(2);

      const paper2 = await examCustody.papers(2);
      expect(paper2.id).to.equal(2);
      expect(paper2.fileRef).to.equal("ipfs://QmSecondPaper");
    });

    it("should revert if caller has no role (outsider)", async function () {
      await expect(
        examCustody
          .connect(outsider)
          .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address)
      ).to.be.reverted;
    });

    it("should revert if a Moderator tries to create a paper", async function () {
      await expect(
        examCustody
          .connect(moderator)
          .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address)
      ).to.be.reverted;
    });
  });

  // ─────────────────────────────────────────
  //  moderatePaper
  // ─────────────────────────────────────────

  describe("moderatePaper", function () {
    // Create one paper before each moderatePaper test
    beforeEach(async function () {
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);
    });

    it("should advance a paper from Created to Moderated", async function () {
      await examCustody.connect(moderator).moderatePaper(1);

      const paper = await examCustody.papers(1);
      expect(paper.stage).to.equal(1); // Stage.Moderated = 1
    });

    it("should emit a StageChanged event", async function () {
      await expect(examCustody.connect(moderator).moderatePaper(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(
          1,    // paperId
          0,    // oldStage = Created
          1,    // newStage = Moderated
          moderator.address
        );
    });

    it("should revert if caller is not a Moderator", async function () {
      // Setter tries to moderate — wrong role
      await expect(
        examCustody.connect(setter).moderatePaper(1)
      ).to.be.reverted;
    });

    it("should revert if paper is already past Created stage", async function () {
      // Moderate once (Created → Moderated) — should succeed
      await examCustody.connect(moderator).moderatePaper(1);

      // Try to moderate again — paper is now at Moderated, not Created
      await expect(
        examCustody.connect(moderator).moderatePaper(1)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage");
    });

    it("should revert for a non-existent paper ID", async function () {
      await expect(
        examCustody.connect(moderator).moderatePaper(999)
      ).to.be.revertedWithCustomError(examCustody, "PaperDoesNotExist");
    });

    it("should revert for paper ID 0", async function () {
      await expect(
        examCustody.connect(moderator).moderatePaper(0)
      ).to.be.revertedWithCustomError(examCustody, "PaperDoesNotExist");
    });
  });
});
