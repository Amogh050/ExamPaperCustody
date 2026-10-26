// Comprehensive tests for ExamCustody.sol — Day 2 & Day 3
//
// We use Hardhat's built-in Mocha + Chai test runner with ethers.js and
// @nomicfoundation/hardhat-network-helpers for manipulating block timestamps.
//
// Each test suite verifies:
// 1. Happy path: valid caller and valid stage transitions.
// 2. Events emitted with exact parameters.
// 3. Access control: reverts when called by wrong role or outsider.
// 4. Stage ordering: reverts with InvalidStage when called out of order.
// 5. Special rules: NotAssignedCentre, ExamTimeNotReached, CallerHasNoRole.
// 6. Freeze behavior: Compromised papers reject any further actions.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ExamCustody", function () {

  // ── Test accounts ──
  // controller  = deployer (DEFAULT_ADMIN_ROLE)
  // setter      = SETTER_ROLE
  // moderator   = MODERATOR_ROLE
  // printer     = PRINTER_ROLE
  // centre      = CENTRE_ROLE (assigned to sample paper)
  // otherCentre = CENTRE_ROLE (different centre, used to test NotAssignedCentre)
  // outsider    = has no role (used to test unauthorized reverts)
  let examCustody;
  let controller, setter, moderator, printer, centre, otherCentre, outsider;

  // Role hashes — read directly from contract constants
  let SETTER_ROLE, MODERATOR_ROLE, PRINTER_ROLE, CENTRE_ROLE, DEFAULT_ADMIN_ROLE;

  // Sample paper test values
  const sampleHash = ethers.keccak256(ethers.toUtf8Bytes("encrypted-paper-content-v1"));
  const sampleFileRef = "ipfs://QmSampleCID123";
  let sampleExamTime;

  beforeEach(async function () {
    // 1. Get test accounts from Hardhat
    [controller, setter, moderator, printer, centre, otherCentre, outsider] =
      await ethers.getSigners();

    // 2. Deploy fresh contract
    const ExamCustody = await ethers.getContractFactory("ExamCustody");
    examCustody = await ExamCustody.deploy();
    await examCustody.waitForDeployment();

    // 3. Cache role identifiers
    SETTER_ROLE        = await examCustody.SETTER_ROLE();
    MODERATOR_ROLE     = await examCustody.MODERATOR_ROLE();
    PRINTER_ROLE       = await examCustody.PRINTER_ROLE();
    CENTRE_ROLE        = await examCustody.CENTRE_ROLE();
    DEFAULT_ADMIN_ROLE = await examCustody.DEFAULT_ADMIN_ROLE();

    // 4. Grant roles to test accounts
    await examCustody.connect(controller).grantRole(SETTER_ROLE, setter.address);
    await examCustody.connect(controller).grantRole(MODERATOR_ROLE, moderator.address);
    await examCustody.connect(controller).grantRole(PRINTER_ROLE, printer.address);
    await examCustody.connect(controller).grantRole(CENTRE_ROLE, centre.address);
    await examCustody.connect(controller).grantRole(CENTRE_ROLE, otherCentre.address);

    // 5. Compute examTime dynamically (24 hours after current block time)
    const latestTime = await time.latest();
    sampleExamTime = latestTime + 86400; // +1 day
  });

  // ── Helper functions for pipeline setup ──

  async function createSamplePaper() {
    await examCustody
      .connect(setter)
      .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);
    return await examCustody.paperCount();
  }

  async function moveToModerated() {
    const id = await createSamplePaper();
    await examCustody.connect(moderator).moderatePaper(id);
    return id;
  }

  async function moveToPrintedSealed() {
    const id = await moveToModerated();
    await examCustody.connect(printer).printAndSeal(id);
    return id;
  }

  async function moveToDispatched() {
    const id = await moveToPrintedSealed();
    await examCustody.connect(controller).dispatch(id);
    return id;
  }

  async function moveToReceivedAtCentre() {
    const id = await moveToDispatched();
    await examCustody.connect(centre).receiveAtCentre(id);
    return id;
  }

  async function moveToKeyReleased() {
    const id = await moveToReceivedAtCentre();
    await time.increaseTo(sampleExamTime);
    await examCustody.connect(centre).releaseKey(id);
    return id;
  }

  // ─────────────────────────────────────────
  //  1. Deployment
  // ─────────────────────────────────────────

  describe("Deployment", function () {
    it("should grant DEFAULT_ADMIN_ROLE to the deployer (controller)", async function () {
      expect(
        await examCustody.hasRole(DEFAULT_ADMIN_ROLE, controller.address)
      ).to.be.true;
    });

    it("should start with paperCount equal to 0", async function () {
      expect(await examCustody.paperCount()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────
  //  2. Role Management
  // ─────────────────────────────────────────

  describe("Role Management", function () {
    it("should allow the controller to grant roles", async function () {
      expect(await examCustody.hasRole(SETTER_ROLE, setter.address)).to.be.true;
      expect(await examCustody.hasRole(MODERATOR_ROLE, moderator.address)).to.be.true;
      expect(await examCustody.hasRole(PRINTER_ROLE, printer.address)).to.be.true;
      expect(await examCustody.hasRole(CENTRE_ROLE, centre.address)).to.be.true;
      expect(await examCustody.hasRole(CENTRE_ROLE, otherCentre.address)).to.be.true;
    });

    it("should reject role grants attempted by non-admin accounts", async function () {
      await expect(
        examCustody.connect(outsider).grantRole(SETTER_ROLE, outsider.address)
      ).to.be.reverted;
    });
  });

  // ─────────────────────────────────────────
  //  3. createPaper (Setter only)
  // ─────────────────────────────────────────

  describe("createPaper", function () {
    it("should create a paper with correct on-chain data and Stage.Created (0)", async function () {
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);

      expect(await examCustody.paperCount()).to.equal(1);

      const paper = await examCustody.papers(1);
      expect(paper.id).to.equal(1);
      expect(paper.ciphertextHash).to.equal(sampleHash);
      expect(paper.fileRef).to.equal(sampleFileRef);
      expect(paper.examTime).to.equal(sampleExamTime);
      expect(paper.stage).to.equal(0); // Stage.Created = 0
      expect(paper.centre).to.equal(centre.address);
    });

    it("should emit PaperCreated event", async function () {
      await expect(
        examCustody
          .connect(setter)
          .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address)
      )
        .to.emit(examCustody, "PaperCreated")
        .withArgs(1, sampleHash, setter.address, centre.address, sampleExamTime);
    });

    it("should assign sequential IDs to consecutive papers", async function () {
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);
      await examCustody
        .connect(setter)
        .createPaper(sampleHash, "ipfs://QmSecondPaper", sampleExamTime, centre.address);

      expect(await examCustody.paperCount()).to.equal(2);

      const p1 = await examCustody.papers(1);
      const p2 = await examCustody.papers(2);
      expect(p1.id).to.equal(1);
      expect(p2.id).to.equal(2);
      expect(p2.fileRef).to.equal("ipfs://QmSecondPaper");
    });

    it("should revert if outsider or non-setter calls createPaper", async function () {
      await expect(
        examCustody
          .connect(outsider)
          .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address)
      ).to.be.reverted;

      await expect(
        examCustody
          .connect(moderator)
          .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address)
      ).to.be.reverted;
    });
  });

  // ─────────────────────────────────────────
  //  4. moderatePaper (Moderator only: Created -> Moderated)
  // ─────────────────────────────────────────

  describe("moderatePaper", function () {
    beforeEach(async function () {
      await createSamplePaper();
    });

    it("should advance paper from Created (0) to Moderated (1)", async function () {
      await examCustody.connect(moderator).moderatePaper(1);
      const paper = await examCustody.papers(1);
      expect(paper.stage).to.equal(1); // Stage.Moderated = 1
    });

    it("should emit StageChanged event", async function () {
      await expect(examCustody.connect(moderator).moderatePaper(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 0, 1, moderator.address);
    });

    it("should revert if caller does not have MODERATOR_ROLE", async function () {
      await expect(
        examCustody.connect(setter).moderatePaper(1)
      ).to.be.reverted;
      await expect(
        examCustody.connect(outsider).moderatePaper(1)
      ).to.be.reverted;
    });

    it("should revert with InvalidStage if paper is not in Created stage", async function () {
      await examCustody.connect(moderator).moderatePaper(1); // now Moderated (1)
      await expect(
        examCustody.connect(moderator).moderatePaper(1)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage")
       .withArgs(1, 0, 1);
    });

    it("should revert with PaperDoesNotExist for invalid ID", async function () {
      await expect(
        examCustody.connect(moderator).moderatePaper(99)
      ).to.be.revertedWithCustomError(examCustody, "PaperDoesNotExist")
       .withArgs(99);
      await expect(
        examCustody.connect(moderator).moderatePaper(0)
      ).to.be.revertedWithCustomError(examCustody, "PaperDoesNotExist")
       .withArgs(0);
    });
  });

  // ─────────────────────────────────────────
  //  5. printAndSeal (Printer only: Moderated -> PrintedSealed)
  // ─────────────────────────────────────────

  describe("printAndSeal", function () {
    it("should advance paper from Moderated (1) to PrintedSealed (2)", async function () {
      const id = await moveToModerated();

      await examCustody.connect(printer).printAndSeal(id);

      const paper = await examCustody.papers(id);
      expect(paper.stage).to.equal(2); // Stage.PrintedSealed = 2
    });

    it("should emit StageChanged event", async function () {
      const id = await moveToModerated();

      await expect(examCustody.connect(printer).printAndSeal(id))
        .to.emit(examCustody, "StageChanged")
        .withArgs(id, 1, 2, printer.address);
    });

    it("should revert if caller does not have PRINTER_ROLE", async function () {
      const id = await moveToModerated();

      await expect(
        examCustody.connect(setter).printAndSeal(id)
      ).to.be.reverted;

      await expect(
        examCustody.connect(outsider).printAndSeal(id)
      ).to.be.reverted;
    });

    it("should revert with InvalidStage if paper is still Created (0)", async function () {
      const id = await createSamplePaper(); // stage is Created (0)

      await expect(
        examCustody.connect(printer).printAndSeal(id)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage")
       .withArgs(id, 1, 0);
    });

    it("should revert with PaperDoesNotExist for non-existent paper", async function () {
      await expect(
        examCustody.connect(printer).printAndSeal(42)
      ).to.be.revertedWithCustomError(examCustody, "PaperDoesNotExist")
       .withArgs(42);
    });
  });

  // ─────────────────────────────────────────
  //  6. dispatch (Controller only: PrintedSealed -> Dispatched)
  // ─────────────────────────────────────────

  describe("dispatch", function () {
    it("should advance paper from PrintedSealed (2) to Dispatched (3)", async function () {
      const id = await moveToPrintedSealed();

      await examCustody.connect(controller).dispatch(id);

      const paper = await examCustody.papers(id);
      expect(paper.stage).to.equal(3); // Stage.Dispatched = 3
    });

    it("should emit StageChanged event", async function () {
      const id = await moveToPrintedSealed();

      await expect(examCustody.connect(controller).dispatch(id))
        .to.emit(examCustody, "StageChanged")
        .withArgs(id, 2, 3, controller.address);
    });

    it("should revert if caller does not have DEFAULT_ADMIN_ROLE (Controller)", async function () {
      const id = await moveToPrintedSealed();

      await expect(
        examCustody.connect(printer).dispatch(id)
      ).to.be.reverted;

      await expect(
        examCustody.connect(outsider).dispatch(id)
      ).to.be.reverted;
    });

    it("should revert with InvalidStage if paper is not in PrintedSealed stage", async function () {
      const id = await moveToModerated(); // stage is Moderated (1), not PrintedSealed (2)

      await expect(
        examCustody.connect(controller).dispatch(id)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage")
       .withArgs(id, 2, 1);
    });
  });

  // ─────────────────────────────────────────
  //  7. receiveAtCentre (Assigned Centre only: Dispatched -> ReceivedAtCentre)
  // ─────────────────────────────────────────

  describe("receiveAtCentre", function () {
    it("should advance paper from Dispatched (3) to ReceivedAtCentre (4)", async function () {
      const id = await moveToDispatched();

      await examCustody.connect(centre).receiveAtCentre(id);

      const paper = await examCustody.papers(id);
      expect(paper.stage).to.equal(4); // Stage.ReceivedAtCentre = 4
    });

    it("should emit StageChanged event", async function () {
      const id = await moveToDispatched();

      await expect(examCustody.connect(centre).receiveAtCentre(id))
        .to.emit(examCustody, "StageChanged")
        .withArgs(id, 3, 4, centre.address);
    });

    it("should revert with NotAssignedCentre if called by a different centre", async function () {
      const id = await moveToDispatched();

      // otherCentre has CENTRE_ROLE, but is not the centre assigned to this paper
      await expect(
        examCustody.connect(otherCentre).receiveAtCentre(id)
      ).to.be.revertedWithCustomError(examCustody, "NotAssignedCentre")
       .withArgs(id, otherCentre.address, centre.address);
    });

    it("should revert if caller does not have CENTRE_ROLE", async function () {
      const id = await moveToDispatched();

      await expect(
        examCustody.connect(controller).receiveAtCentre(id)
      ).to.be.reverted;

      await expect(
        examCustody.connect(outsider).receiveAtCentre(id)
      ).to.be.reverted;
    });

    it("should revert with InvalidStage if paper is not Dispatched", async function () {
      const id = await moveToPrintedSealed(); // not yet Dispatched

      await expect(
        examCustody.connect(centre).receiveAtCentre(id)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage")
       .withArgs(id, 3, 2);
    });
  });

  // ─────────────────────────────────────────
  //  8. releaseKey (Assigned Centre only + Timelocked: ReceivedAtCentre -> KeyReleased)
  // ─────────────────────────────────────────

  describe("releaseKey", function () {
    it("should advance paper from ReceivedAtCentre (4) to KeyReleased (5) when time >= examTime", async function () {
      const id = await moveToReceivedAtCentre();

      // Fast-forward blockchain time to the exam start time
      await time.increaseTo(sampleExamTime);

      await examCustody.connect(centre).releaseKey(id);

      const paper = await examCustody.papers(id);
      expect(paper.stage).to.equal(5); // Stage.KeyReleased = 5
    });

    it("should emit StageChanged event", async function () {
      const id = await moveToReceivedAtCentre();
      await time.increaseTo(sampleExamTime);

      await expect(examCustody.connect(centre).releaseKey(id))
        .to.emit(examCustody, "StageChanged")
        .withArgs(id, 4, 5, centre.address);
    });

    it("should revert with ExamTimeNotReached if called before examTime", async function () {
      const id = await moveToReceivedAtCentre();

      // Do NOT fast-forward time — current time is well before sampleExamTime
      await expect(
        examCustody.connect(centre).releaseKey(id)
      ).to.be.revertedWithCustomError(examCustody, "ExamTimeNotReached");
    });

    it("should revert with NotAssignedCentre if called by another centre even after examTime", async function () {
      const id = await moveToReceivedAtCentre();
      await time.increaseTo(sampleExamTime);

      await expect(
        examCustody.connect(otherCentre).releaseKey(id)
      ).to.be.revertedWithCustomError(examCustody, "NotAssignedCentre")
       .withArgs(id, otherCentre.address, centre.address);
    });

    it("should revert if caller does not have CENTRE_ROLE", async function () {
      const id = await moveToReceivedAtCentre();
      await time.increaseTo(sampleExamTime);

      await expect(
        examCustody.connect(controller).releaseKey(id)
      ).to.be.reverted;
    });

    it("should revert with InvalidStage if paper has not reached ReceivedAtCentre", async function () {
      const id = await moveToDispatched();
      await time.increaseTo(sampleExamTime);

      await expect(
        examCustody.connect(centre).releaseKey(id)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage")
       .withArgs(id, 4, 3);
    });
  });

  // ─────────────────────────────────────────
  //  9. openPaper (Controller only: KeyReleased -> Opened)
  // ─────────────────────────────────────────

  describe("openPaper", function () {
    it("should advance paper from KeyReleased (5) to Opened (6)", async function () {
      const id = await moveToKeyReleased();

      await examCustody.connect(controller).openPaper(id);

      const paper = await examCustody.papers(id);
      expect(paper.stage).to.equal(6); // Stage.Opened = 6
    });

    it("should emit StageChanged event", async function () {
      const id = await moveToKeyReleased();

      await expect(examCustody.connect(controller).openPaper(id))
        .to.emit(examCustody, "StageChanged")
        .withArgs(id, 5, 6, controller.address);
    });

    it("should revert if caller is not the Controller", async function () {
      const id = await moveToKeyReleased();

      await expect(
        examCustody.connect(centre).openPaper(id)
      ).to.be.reverted;

      await expect(
        examCustody.connect(outsider).openPaper(id)
      ).to.be.reverted;
    });

    it("should revert with InvalidStage if paper is not yet KeyReleased", async function () {
      const id = await moveToReceivedAtCentre(); // Stage 4, not 5

      await expect(
        examCustody.connect(controller).openPaper(id)
      ).to.be.revertedWithCustomError(examCustody, "InvalidStage")
       .withArgs(id, 5, 4);
    });
  });

  // ─────────────────────────────────────────
  //  10. flagCompromised (Emergency Freeze)
  // ─────────────────────────────────────────

  describe("flagCompromised", function () {
    it("should allow Controller to flag a paper as Compromised (7) and emit PaperCompromised", async function () {
      const id = await createSamplePaper();

      await expect(examCustody.connect(controller).flagCompromised(id))
        .to.emit(examCustody, "PaperCompromised")
        .withArgs(id, controller.address);

      const paper = await examCustody.papers(id);
      expect(paper.stage).to.equal(7); // Stage.Compromised = 7
    });

    it("should allow any registered role to flag paper as compromised", async function () {
      // Test each role's ability to flag
      // Setter
      const p1 = await createSamplePaper();
      await examCustody.connect(setter).flagCompromised(p1);
      expect((await examCustody.papers(p1)).stage).to.equal(7);

      // Moderator
      const p2 = await createSamplePaper();
      await examCustody.connect(moderator).flagCompromised(p2);
      expect((await examCustody.papers(p2)).stage).to.equal(7);

      // Printer
      const p3 = await createSamplePaper();
      await examCustody.connect(printer).flagCompromised(p3);
      expect((await examCustody.papers(p3)).stage).to.equal(7);

      // Centre
      const p4 = await createSamplePaper();
      await examCustody.connect(centre).flagCompromised(p4);
      expect((await examCustody.papers(p4)).stage).to.equal(7);
    });

    it("should revert with CallerHasNoRole if outsider attempts to flag compromised", async function () {
      const id = await createSamplePaper();

      await expect(
        examCustody.connect(outsider).flagCompromised(id)
      ).to.be.revertedWithCustomError(examCustody, "CallerHasNoRole")
       .withArgs(outsider.address);
    });

    it("should revert with PaperIsCompromised if already flagged", async function () {
      const id = await createSamplePaper();
      await examCustody.connect(controller).flagCompromised(id);

      await expect(
        examCustody.connect(moderator).flagCompromised(id)
      ).to.be.revertedWithCustomError(examCustody, "PaperIsCompromised")
       .withArgs(id);
    });

    it("should freeze the paper and block ANY further stage transitions", async function () {
      const id = await moveToModerated(); // stage is Moderated (1)

      // Emergency: leak detected at printing plant!
      await examCustody.connect(printer).flagCompromised(id);

      // 1. Printer cannot print and seal
      await expect(
        examCustody.connect(printer).printAndSeal(id)
      ).to.be.revertedWithCustomError(examCustody, "PaperIsCompromised")
       .withArgs(id);

      // 2. Controller cannot dispatch
      await expect(
        examCustody.connect(controller).dispatch(id)
      ).to.be.revertedWithCustomError(examCustody, "PaperIsCompromised")
       .withArgs(id);

      // 3. Centre cannot receive
      await expect(
        examCustody.connect(centre).receiveAtCentre(id)
      ).to.be.revertedWithCustomError(examCustody, "PaperIsCompromised")
       .withArgs(id);

      // 4. Centre cannot release key
      await expect(
        examCustody.connect(centre).releaseKey(id)
      ).to.be.revertedWithCustomError(examCustody, "PaperIsCompromised")
       .withArgs(id);

      // 5. Controller cannot open
      await expect(
        examCustody.connect(controller).openPaper(id)
      ).to.be.revertedWithCustomError(examCustody, "PaperIsCompromised")
       .withArgs(id);
    });

    it("should revert with PaperDoesNotExist for invalid paper ID", async function () {
      await expect(
        examCustody.connect(controller).flagCompromised(999)
      ).to.be.revertedWithCustomError(examCustody, "PaperDoesNotExist")
       .withArgs(999);
    });
  });

  // ─────────────────────────────────────────
  //  11. Full End-to-End Custody Pipeline
  // ─────────────────────────────────────────

  describe("Full End-to-End Custody Pipeline", function () {
    it("should seamlessly transition across all stages from Created to Opened", async function () {
      // Step 1: Setter creates paper (Stage: Created = 0)
      const txCreate = await examCustody
        .connect(setter)
        .createPaper(sampleHash, sampleFileRef, sampleExamTime, centre.address);
      await expect(txCreate)
        .to.emit(examCustody, "PaperCreated")
        .withArgs(1, sampleHash, setter.address, centre.address, sampleExamTime);
      expect((await examCustody.papers(1)).stage).to.equal(0);

      // Step 2: Moderator reviews & approves (Stage: Moderated = 1)
      await expect(examCustody.connect(moderator).moderatePaper(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 0, 1, moderator.address);
      expect((await examCustody.papers(1)).stage).to.equal(1);

      // Step 3: Printer prints and seals packets (Stage: PrintedSealed = 2)
      await expect(examCustody.connect(printer).printAndSeal(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 1, 2, printer.address);
      expect((await examCustody.papers(1)).stage).to.equal(2);

      // Step 4: Controller dispatches to exam centre (Stage: Dispatched = 3)
      await expect(examCustody.connect(controller).dispatch(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 2, 3, controller.address);
      expect((await examCustody.papers(1)).stage).to.equal(3);

      // Step 5: Centre confirms physical arrival (Stage: ReceivedAtCentre = 4)
      await expect(examCustody.connect(centre).receiveAtCentre(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 3, 4, centre.address);
      expect((await examCustody.papers(1)).stage).to.equal(4);

      // Step 6: Exam time arrives -> Centre releases key on-chain (Stage: KeyReleased = 5)
      await time.increaseTo(sampleExamTime);
      await expect(examCustody.connect(centre).releaseKey(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 4, 5, centre.address);
      expect((await examCustody.papers(1)).stage).to.equal(5);

      // Step 7: Controller marks exam as officially opened (Stage: Opened = 6)
      await expect(examCustody.connect(controller).openPaper(1))
        .to.emit(examCustody, "StageChanged")
        .withArgs(1, 5, 6, controller.address);
      expect((await examCustody.papers(1)).stage).to.equal(6);
    });
  });

});
