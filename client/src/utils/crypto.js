// Browser Web Crypto Utility for Public Hash Verification — Day 6

/**
 * Computes the SHA-256 hash of an ArrayBuffer or text string in the browser.
 * Returns a 0x-prefixed 32-byte (64 hex characters) string matching Solidity's bytes32.
 *
 * @param {ArrayBuffer|string} data - Buffer or string to hash
 * @returns {Promise<string>} 0x-prefixed SHA-256 hex string
 */
export async function computeSHA256(data) {
  let buffer;
  if (typeof data === "string") {
    // If it's a hex string, convert hex to byte buffer
    if (data.startsWith("0x") && data.length % 2 === 0) {
      const cleanHex = data.slice(2);
      const bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
      }
      buffer = bytes.buffer;
    } else {
      buffer = new TextEncoder().encode(data);
    }
  } else if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer;
  } else {
    throw new Error("Unsupported data format for SHA-256 computation.");
  }

  const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return "0x" + hexString;
}

/**
 * Reads a File object as an ArrayBuffer.
 *
 * @param {File} file - Browser File object from input[type="file"]
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
