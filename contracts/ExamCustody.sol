// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin's AccessControl gives us role-based permissions.
// Each role is a bytes32 hash. The DEFAULT_ADMIN_ROLE (0x00) can grant/revoke
// all other roles. We use this for the Controller.
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ExamCustody
 * @notice Tracks exam question papers through a chain-of-custody pipeline.
 *
 *   Lifecycle:  Created → Moderated → PrintedSealed → Dispatched
 *               → ReceivedAtCentre → KeyReleased → Opened
 *
 *   Any role can flag a paper as Compromised, which freezes it permanently.
 *
 *   Each paper is AES-256-GCM encrypted off-chain; only its ciphertext hash
 *   is stored on-chain. No plaintext or keys ever touch the blockchain.
 */
contract ExamCustody is AccessControl {

    // ═══════════════════════════════════════════════
    //  ROLE DEFINITIONS
    // ═══════════════════════════════════════════════
    //
    // Controller = DEFAULT_ADMIN_ROLE (0x00), inherited from AccessControl.
    // It can grant and revoke every other role.
    //
    // Each custom role is the keccak256 hash of a readable string.
    // We store them as public constants so the frontend can read them.

    bytes32 public constant SETTER_ROLE    = keccak256("SETTER_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    bytes32 public constant PRINTER_ROLE   = keccak256("PRINTER_ROLE");
    bytes32 public constant CENTRE_ROLE    = keccak256("CENTRE_ROLE");

    // ═══════════════════════════════════════════════
    //  STAGE ENUM
    // ═══════════════════════════════════════════════
    //
    // Solidity enums are uint8 under the hood (Created = 0, Moderated = 1, …).
    // Compromised is the terminal "freeze" state — no transitions out of it.

    enum Stage {
        Created,           // 0 — Setter uploaded the encrypted paper
        Moderated,         // 1 — Moderator reviewed and approved
        PrintedSealed,     // 2 — Printer printed and sealed packets
        Dispatched,        // 3 — Controller dispatched to exam centre
        ReceivedAtCentre,  // 4 — Centre confirmed receipt
        KeyReleased,       // 5 — Decryption key released (time-locked)
        Opened,            // 6 — Paper opened for the exam
        Compromised        // 7 — Flagged as leaked / tampered (frozen)
    }

    // ═══════════════════════════════════════════════
    //  PAPER STRUCT
    // ═══════════════════════════════════════════════

    struct Paper {
        uint256 id;              // Unique identifier (starts at 1)
        bytes32 ciphertextHash;  // SHA-256 hash of the encrypted file
        string  fileRef;         // Off-chain storage reference (IPFS CID / URL)
        uint256 examTime;        // Unix timestamp when the exam starts
        Stage   stage;           // Current custody stage
        address centre;          // Wallet address of the assigned exam centre
    }

    // ═══════════════════════════════════════════════
    //  STATE VARIABLES
    // ═══════════════════════════════════════════════

    /// @notice Running counter — also the ID of the most recent paper
    uint256 public paperCount;

    /// @notice Paper ID → Paper data
    mapping(uint256 => Paper) public papers;

    // ═══════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════
    //
    // We emit an event on EVERY state change. The frontend will replay these
    // to build each paper's full custody timeline.

    /// @notice Emitted once when a new paper record is created
    event PaperCreated(
        uint256 indexed paperId,
        bytes32 ciphertextHash,
        address indexed setter,
        address indexed centre,
        uint256 examTime
    );

    /// @notice Emitted on every stage transition (except create & compromise)
    event StageChanged(
        uint256 indexed paperId,
        Stage   oldStage,
        Stage   newStage,
        address indexed changedBy
    );

    /// @notice Emitted when any role flags a paper as compromised
    event PaperCompromised(
        uint256 indexed paperId,
        address indexed flaggedBy
    );

    // ═══════════════════════════════════════════════
    //  CUSTOM ERRORS
    // ═══════════════════════════════════════════════
    //
    // Custom errors are cheaper than revert-string requires (save gas)
    // and carry structured data for debugging.

    /// @notice Thrown when a function expects a different stage
    error InvalidStage(uint256 paperId, Stage expected, Stage actual);

    /// @notice Thrown when trying to act on a compromised paper
    error PaperIsCompromised(uint256 paperId);

    /// @notice Thrown when the paper ID does not exist
    error PaperDoesNotExist(uint256 paperId);

    // ═══════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════

    /// @notice Reverts if the paper ID has not been created yet
    modifier paperExists(uint256 _paperId) {
        if (_paperId == 0 || _paperId > paperCount) {
            revert PaperDoesNotExist(_paperId);
        }
        _;
    }

    /// @notice Reverts if the paper is not at the expected stage
    modifier onlyStage(uint256 _paperId, Stage _expected) {
        Stage current = papers[_paperId].stage;
        if (current != _expected) {
            revert InvalidStage(_paperId, _expected, current);
        }
        _;
    }

    /// @notice Reverts if the paper has been flagged as compromised
    modifier notCompromised(uint256 _paperId) {
        if (papers[_paperId].stage == Stage.Compromised) {
            revert PaperIsCompromised(_paperId);
        }
        _;
    }

    // ═══════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════

    /// @notice The deployer becomes the Controller (DEFAULT_ADMIN_ROLE).
    ///         They can then call grantRole() to assign Setter, Moderator, etc.
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ═══════════════════════════════════════════════
    //  STAGE TRANSITION FUNCTIONS
    // ═══════════════════════════════════════════════

    /**
     * @notice Create a new exam paper record. Called by a Setter after
     *         encrypting the paper off-chain and uploading the ciphertext.
     *
     * @param _ciphertextHash SHA-256 hash of the AES-256-GCM encrypted file
     * @param _fileRef        Off-chain storage reference (e.g. IPFS CID)
     * @param _examTime       Unix timestamp for when the exam starts
     * @param _centre         Wallet address of the assigned exam centre
     * @return paperId        The ID of the newly created paper
     */
    function createPaper(
        bytes32 _ciphertextHash,
        string  calldata _fileRef,
        uint256 _examTime,
        address _centre
    )
        external
        onlyRole(SETTER_ROLE)
        returns (uint256 paperId)
    {
        // Increment counter — IDs start at 1 (0 means "does not exist")
        paperCount++;
        paperId = paperCount;

        // Store the paper struct in the mapping
        papers[paperId] = Paper({
            id:             paperId,
            ciphertextHash: _ciphertextHash,
            fileRef:        _fileRef,
            examTime:       _examTime,
            stage:          Stage.Created, // starts at the first stage
            centre:         _centre
        });

        emit PaperCreated(paperId, _ciphertextHash, msg.sender, _centre, _examTime);
    }

    /**
     * @notice Advance a paper from Created → Moderated.
     *         Only callable by an account with MODERATOR_ROLE.
     *
     * @param _paperId The ID of the paper to moderate
     */
    function moderatePaper(uint256 _paperId)
        external
        onlyRole(MODERATOR_ROLE)
        paperExists(_paperId)
        notCompromised(_paperId)
        onlyStage(_paperId, Stage.Created)
    {
        // Save old stage for the event
        Stage oldStage = papers[_paperId].stage;

        // Advance to Moderated
        papers[_paperId].stage = Stage.Moderated;

        emit StageChanged(_paperId, oldStage, Stage.Moderated, msg.sender);
    }
}
