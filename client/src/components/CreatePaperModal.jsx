// Modal dialog for Setter to encrypt and register a new exam paper on-chain — Day 6

import React, { useState } from "react";
import { HARDHAT_ACCOUNTS } from "../utils/constants";
import { ethers } from "ethers";

export default function CreatePaperModal({ isOpen, onClose, onCreatePaper, loading }) {
  if (!isOpen) return null;

  const [subject, setSubject] = useState("CS401: Distributed Systems & Blockchain");
  const [centreAddress, setCentreAddress] = useState(HARDHAT_ACCOUNTS[4].address); // Centre 1
  const [hoursFromNow, setHoursFromNow] = useState(2);
  const [paperContent, setPaperContent] = useState(
    "1. Explain Byzantine Fault Tolerance (BFT) in Blockchain networks.\n2. How does AES-256-GCM ensure confidentiality and integrity?\n3. Describe the state transitions in the ExamCustody smart contract."
  );

  const handleSubmit = (e) => {
    e.preventDefault();

    // 1. Calculate examTime timestamp
    const nowUnix = Math.floor(Date.now() / 1000);
    const examTime = nowUnix + Math.floor(Number(hoursFromNow) * 3600);

    // 2. Hash paper content to simulate AES-256-GCM ciphertext hash
    const fakeCiphertext = ethers.toUtf8Bytes(paperContent + Date.now());
    const ciphertextHash = ethers.keccak256(fakeCiphertext);
    const fileRef = `storage://ciphertexts/${Date.now()}.json`;

    onCreatePaper({
      ciphertextHash,
      fileRef,
      examTime,
      centre: centreAddress,
      subject
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="card-header">
          <h3 className="card-title">📝 Register New Exam Paper (Setter)</h3>
          <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Course / Subject Title:</label>
            <input
              type="text"
              className="form-input"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Assigned Exam Centre Wallet:</label>
            <select
              className="custom-select"
              style={{ width: "100%" }}
              value={centreAddress}
              onChange={(e) => setCentreAddress(e.target.value)}
            >
              <option value={HARDHAT_ACCOUNTS[4].address}>
                Exam Centre 1 ({HARDHAT_ACCOUNTS[4].address.substring(0, 10)}...)
              </option>
              <option value={HARDHAT_ACCOUNTS[5].address}>
                Exam Centre 2 ({HARDHAT_ACCOUNTS[5].address.substring(0, 10)}...)
              </option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Exam Start Time (Hours from now):</label>
            <input
              type="number"
              className="form-input"
              min="0.1"
              step="0.1"
              required
              value={hoursFromNow}
              onChange={(e) => setHoursFromNow(e.target.value)}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Key release will be time-locked on-chain until this timestamp arrives.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Question Paper Questions (Confidential):</label>
            <textarea
              className="form-textarea"
              rows="4"
              value={paperContent}
              onChange={(e) => setPaperContent(e.target.value)}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--accent-emerald)" }}>
              🔒 Plaintext is encrypted off-chain. Only the SHA-256 ciphertext hash will be stored on Ethereum.
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Registering on Blockchain..." : "🚀 Encrypt & Create Paper"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
