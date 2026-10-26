// Modal dialog showing decrypted exam paper content for Exam Centres — Day 6

import React from "react";

export default function DecryptedPaperModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: "720px" }}>
        <div className="card-header">
          <div>
            <span className="stage-badge" style={{ backgroundColor: "rgba(16, 185, 129, 0.2)", color: "#10b981", marginBottom: "6px" }}>
              🔓 Decrypted via Key Service
            </span>
            <h3 className="card-title">Paper #{data.paperId} — {data.subject || "Official Exam Paper"}</h3>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ background: "rgba(0,0,0,0.4)", padding: "16px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "0.8rem" }}>
          <div><strong>AES-256 Key:</strong> <span className="mono" style={{ color: "var(--accent-emerald)" }}>{data.keyHex}</span></div>
          <div><strong>Status:</strong> Authenticated Centre Decryption Successful</div>
        </div>

        <div className="form-group">
          <label className="form-label">Plaintext Examination Content:</label>
          <pre style={{
            background: "#050811",
            padding: "18px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-mono)",
            fontSize: "0.84rem",
            color: "#e2e8f0",
            maxHeight: "360px",
            overflowY: "auto"
          }}>
            {data.plaintext}
          </pre>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Authorized print release for assigned examination centre.
          </span>
          <button className="btn btn-outline" onClick={() => window.print()}>
            🖨️ Print Exam Paper
          </button>
        </div>
      </div>
    </div>
  );
}
