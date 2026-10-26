// AES-256-GCM Encryption & Decryption Utility — Day 5
//
// Cryptographic design for university exam paper custody:
// 1. AES-256-GCM (Galois/Counter Mode):
//    - Symmetric encryption: same 256-bit key encrypts and decrypts.
//    - Authenticated encryption (AEAD): provides confidentiality AND integrity.
//    - If even a single bit of the ciphertext or IV is tampered with,
//      GCM authentication tag verification fails immediately during decryption.
// 2. SHA-256 Hashing:
//    - A cryptographic hash of the ciphertext is computed.
//    - Stored on-chain as `bytes32 ciphertextHash`.
//    - Allows anyone to verify that the file stored off-chain has not been altered.
// 3. No plaintext or keys ever touch the blockchain.

const crypto = require("crypto");

// 256-bit key (32 bytes)
const KEY_LENGTH_BYTES = 32;

// Standard GCM IV length (12 bytes = 96 bits recommended by NIST)
const IV_LENGTH_BYTES = 12;

/**
 * Generate a cryptographically secure random 256-bit AES key.
 * @returns {string} 64-character hex string (32 bytes)
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH_BYTES).toString("hex");
}

/**
 * Compute the SHA-256 hash of a ciphertext buffer.
 * Returns a 0x-prefixed 64-character hex string matching Solidity's bytes32.
 *
 * @param {Buffer|string} ciphertext - Buffer or hex string of the ciphertext
 * @returns {string} 0x-prefixed 32-byte hex hash
 */
function hashCiphertext(ciphertext) {
  const buffer = Buffer.isBuffer(ciphertext)
    ? ciphertext
    : Buffer.from(ciphertext, "hex");

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return "0x" + hash;
}

/**
 * Encrypt plaintext (string or Buffer) using AES-256-GCM.
 *
 * @param {string|Buffer} plaintext - The paper content to encrypt
 * @param {string} [keyHex] - Optional 32-byte hex key; generates new one if omitted
 * @returns {Object} Encrypted bundle containing:
 *   - key: hex string (keep secret!)
 *   - iv: 12-byte hex string (safe to store publicly)
 *   - authTag: 16-byte hex authentication tag (safe to store publicly)
 *   - ciphertext: hex string of the encrypted payload
 *   - ciphertextHash: 0x-prefixed SHA-256 hash of the ciphertext (goes on-chain)
 */
function encrypt(plaintext, keyHex = null) {
  // Use provided key or generate a fresh 256-bit key
  const key = keyHex ? Buffer.from(keyHex, "hex") : crypto.randomBytes(KEY_LENGTH_BYTES);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const inputBuffer = Buffer.isBuffer(plaintext)
    ? plaintext
    : Buffer.from(plaintext, "utf8");

  const encrypted = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes auth tag

  const ciphertextHex = encrypted.toString("hex");
  const ciphertextHash = hashCiphertext(encrypted);

  return {
    key: key.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertextHex,
    ciphertextHash: ciphertextHash
  };
}

/**
 * Decrypt an AES-256-GCM ciphertext bundle.
 * Authenticates the ciphertext using the GCM authTag.
 *
 * @param {string} ciphertextHex - Hex string of ciphertext
 * @param {string} ivHex - Hex string of 12-byte IV
 * @param {string} authTagHex - Hex string of 16-byte authTag
 * @param {string} keyHex - Hex string of 32-byte AES key
 * @returns {string} Decrypted UTF-8 plaintext
 * @throws {Error} If authentication fails (data tampered or wrong key)
 */
function decrypt(ciphertextHex, ivHex, authTagHex, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final() // Throws if authTag verification fails!
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  generateKey,
  hashCiphertext,
  encrypt,
  decrypt
};
