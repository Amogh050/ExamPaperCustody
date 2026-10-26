// Public Verify-File-Hash Page — Day 6
//
// Allows students, external observers, or university auditors to independently
// verify the cryptographic integrity of any off-chain exam paper against
// the immutable on-chain record without logging in.

import React, { useState } from "react";
import { computeSHA256, readFileAsArrayBuffer } from "../utils/crypto";
import { API_BASE_URL } from "../utils/constants";

export default function VerifyHashPage({ contract, papers }) {
  const [paperId, setPaperId] = useState(papers[0]?.id || "1");
  const [ciphertextInput, setCiphertextInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg("");
    setCalculating(true);

    try {
      if (file.name.endsWith(".json")) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.ciphertext) {
          setCiphertextInput(json.ciphertext);
          await runVerification(json.ciphertext);
        } else {
          const buffer = await readFileAsArrayBuffer(file);
          const hash = await computeSHA256(buffer);
          await checkOnChainHash(hash);
        }
      } else {
        const buffer = await readFileAsArrayBuffer(file);
        const hash = await computeSHA256(buffer);
        await checkOnChainHash(hash);
      }
    } catch (err) {
      setErrorMsg("Failed to read file: " + err.message);
    } finally {
      setCalculating(false);
    }
  };

  // Load sample ciphertext directly from Key Service backend
  const handleLoadFromServer = async () => {
    setErrorMsg("");
    setCalculating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/papers/${paperId}/ciphertext`);
      if (!res.ok) {
        throw new Error(`Paper #${paperId} ciphertext not found on server.`);
      }
      const data = await res.json();
      setCiphertextInput(data.ciphertext);
      setFileName(`Server Storage: ${data.fileRef}`);
      await runVerification(data.ciphertext);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setCalculating(false);
    }
  };

  // Run hash computation on ciphertext input
  const runVerification = async (text) => {
    if (!text) {
      setErrorMsg("Please provide ciphertext or upload a file.");
      return;
    }

    setCalculating(true);
    setErrorMsg("");
    try {
      const hash = await computeSHA256(text);
      await checkOnChainHash(hash);
    } catch (err) {
      setErrorMsg("Hashing failed: " + err.message);
    } finally {
      setCalculating(false);
    }
  };

  // Compare calculated hash against blockchain contract record
  const checkOnChainHash = async (calculatedHash) => {
    if (!contract) {
      setErrorMsg("Not connected to smart contract.");
      return;
    }

    try {
      const paper = await contract.papers(paperId);
      if (Number(paper.id) === 0) {
        setErrorMsg(`Paper #${paperId} does not exist on blockchain.`);
        setResult(null);
        return;
      }

      const onChainHash = paper.ciphertextHash;
      const matches = calculatedHash.toLowerCase() === onChainHash.toLowerCase();

      setResult({
        calculatedHash,
        onChainHash,
        matches,
        paperId: paper.id.toString(),
        stage: Number(paper.stage)
      });
    } catch (err) {
      setErrorMsg("Failed to query smart contract: " + err.message);
    }
  };

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto" }}>
      <div className="glass-card" style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>
          🔍 Public Audit: Verify Off-Chain Question Paper Integrity
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Anyone can independently verify that an off-chain question paper has not been tampered with or modified.
          The browser calculates the SHA-256 hash client-side and matches it against the immutable record on the Ethereum blockchain.
        </p>
      </div>

      <div className="glass-card">
        {/* Paper Selector */}
        <div className="form-group">
          <label className="form-label">1. Select Exam Paper ID to Audit:</label>
          <select
            className="custom-select"
            style={{ width: "100%" }}
            value={paperId}
            onChange={(e) => {
              setPaperId(e.target.value);
              setResult(null);
            }}
          >
            {papers.length > 0 ? (
              papers.map((p) => (
                <option key={p.id} value={p.id}>
                  Paper #{p.id} — Stage: {p.stageLabel} (Centre: {p.centre.substring(0, 8)}...)
                </option>
              ))
            ) : (
              <option value="1">Paper #1</option>
            )}
          </select>
        </div>

        {/* File Dropzone or Server Fetch */}
        <div className="form-group">
          <label className="form-label">2. Provide Question Paper Ciphertext:</label>
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleLoadFromServer}
              disabled={calculating}
            >
              📥 Auto-Fetch Off-Chain File for Paper #{paperId}
            </button>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", alignSelf: "center" }}>
              or upload/paste below:
            </span>
          </div>

          <label className="dropzone" style={{ display: "block" }}>
            <input
              type="file"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📁</div>
            <div style={{ fontWeight: 600, color: "#fff" }}>
              {fileName ? `Selected: ${fileName}` : "Click to select or drop encrypted paper file (.json / .enc)"}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
              File is hashed securely in your browser using Web Crypto API.
            </div>
          </label>
        </div>

        {/* Ciphertext manual input */}
        <div className="form-group">
          <label className="form-label">Or Paste Ciphertext Hex:</label>
          <textarea
            className="form-textarea mono"
            rows="3"
            placeholder="Paste raw ciphertext hex string..."
            value={ciphertextInput}
            onChange={(e) => setCiphertextInput(e.target.value)}
          />
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={calculating || !ciphertextInput}
          onClick={() => runVerification(ciphertextInput)}
        >
          {calculating ? "Computing SHA-256 Hash..." : "🔐 Compare File Hash with Blockchain"}
        </button>

        {errorMsg && (
          <div className="alert-box alert-error" style={{ marginTop: "20px" }}>
            <span>⚠️</span>
            <div>{errorMsg}</div>
          </div>
        )}

        {/* Verification Results */}
        {result && (
          <div style={{ marginTop: "28px" }}>
            <div
              className={`alert-box ${result.matches ? "alert-success" : "alert-error"}`}
              style={{ fontSize: "1rem" }}
            >
              <span style={{ fontSize: "1.8rem" }}>{result.matches ? "🛡️" : "❌"}</span>
              <div>
                <strong>
                  {result.matches
                    ? "CRYPTOGRAPHICALLY VERIFIED: File matches on-chain record!"
                    : "TAMPERING DETECTED: Hash mismatch!"}
                </strong>
                <div style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                  {result.matches
                    ? "The off-chain question paper ciphertext exactly matches the hash permanently recorded on the blockchain. Authenticity and integrity are guaranteed."
                    : "The hash of this file does not match the on-chain hash recorded during registration. The question paper has been modified or tampered with."}
                </div>
              </div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)", padding: "16px", marginTop: "16px" }}>
              <div style={{ marginBottom: "10px" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Calculated SHA-256 (from provided file):
                </span>
                <div className="mono" style={{ color: result.matches ? "var(--accent-emerald)" : "var(--accent-rose)", wordBreak: "break-all", fontWeight: 600 }}>
                  {result.calculatedHash}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  On-Chain Immutable Hash (from Smart Contract):
                </span>
                <div className="mono" style={{ color: "#fff", wordBreak: "break-all", fontWeight: 600 }}>
                  {result.onChainHash}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
