// Role-specific action panel for triggering stage transitions and emergency actions — Day 6

import React, { useState } from "react";
import { STAGES } from "../utils/constants";
import { shortenAddress } from "../utils/ethereum";

export default function RoleActions({
  paper,
  selectedRoleKey,
  currentAddress,
  onTransition,
  onFlagCompromised,
  onRequestKey,
  onOpenCreateModal,
  actionLoading
}) {
  const [showCompromiseModal, setShowCompromiseModal] = useState(false);

  const stage = paper ? paper.stage : null;
  const isCompromised = stage === 7;

  // Time remaining until examTime
  const nowUnix = Math.floor(Date.now() / 1000);
  const examTime = paper ? paper.examTime : 0;
  const timeReached = nowUnix >= examTime;
  const diffMinutes = Math.max(0, Math.ceil((examTime - nowUnix) / 60));

  return (
    <div className="glass-card" style={{ marginTop: "20px" }}>
      <div className="card-header">
        <h3 className="card-title">⚡ Available Actions for {selectedRoleKey.toUpperCase()}</h3>
        {selectedRoleKey === "setter" && (
          <button className="btn btn-primary btn-sm" onClick={onOpenCreateModal}>
            + Create New Paper
          </button>
        )}
      </div>

      {!paper ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
          Select a paper above to view available custody operations.
        </p>
      ) : isCompromised ? (
        <div style={{ color: "var(--accent-rose)", fontSize: "0.88rem", fontWeight: 600 }}>
          🔒 This paper is compromised. All actions are blocked.
        </div>
      ) : (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>

          {/* 1. Moderator: moderatePaper */}
          {selectedRoleKey === "moderator" && (
            <button
              className="btn btn-primary"
              disabled={stage !== 0 || actionLoading}
              onClick={() => onTransition("moderatePaper", [paper.id])}
            >
              {actionLoading ? "Processing..." : "✓ Approve & Moderate Paper"}
            </button>
          )}

          {/* 2. Printer: printAndSeal */}
          {selectedRoleKey === "printer" && (
            <button
              className="btn btn-primary"
              disabled={stage !== 1 || actionLoading}
              onClick={() => onTransition("printAndSeal", [paper.id])}
            >
              {actionLoading ? "Processing..." : "🖨️ Mark Printed & Sealed"}
            </button>
          )}

          {/* 3. Controller: dispatch */}
          {selectedRoleKey === "controller" && (
            <button
              className="btn btn-primary"
              disabled={stage !== 2 || actionLoading}
              onClick={() => onTransition("dispatch", [paper.id])}
            >
              {actionLoading ? "Processing..." : "🚚 Dispatch to Centre"}
            </button>
          )}

          {/* 4. Centre: receiveAtCentre */}
          {(selectedRoleKey === "centre1" || selectedRoleKey === "centre2" || selectedRoleKey === "metamask") && (
            <button
              className="btn btn-primary"
              disabled={stage !== 3 || actionLoading}
              onClick={() => onTransition("receiveAtCentre", [paper.id])}
            >
              {actionLoading ? "Processing..." : "📦 Confirm Physical Receipt at Centre"}
            </button>
          )}

          {/* 5. Centre: releaseKey on-chain */}
          {(selectedRoleKey === "centre1" || selectedRoleKey === "centre2" || selectedRoleKey === "metamask") && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                className="btn btn-emerald"
                disabled={stage !== 4 || actionLoading}
                onClick={() => onTransition("releaseKey", [paper.id])}
                title={timeReached ? "Exam time reached!" : `Time-locked! ~${diffMinutes}m remaining`}
              >
                {actionLoading ? "Processing..." : "🔓 Release Decryption Key On-Chain"}
              </button>
              {stage === 4 && !timeReached && (
                <span style={{ fontSize: "0.78rem", color: "var(--accent-amber)" }}>
                  ⏳ Time-lock active (~{diffMinutes}m left)
                </span>
              )}
            </div>
          )}

          {/* 6. Centre: Request Decryption Key from Key Service */}
          {(selectedRoleKey === "centre1" || selectedRoleKey === "centre2" || selectedRoleKey === "metamask") && (
            <button
              className="btn btn-primary"
              disabled={stage < 5 || actionLoading}
              onClick={() => onRequestKey(paper.id)}
            >
              🔑 Request Decryption Key & View Questions
            </button>
          )}

          {/* 7. Controller: openPaper */}
          {selectedRoleKey === "controller" && (
            <button
              className="btn btn-emerald"
              disabled={stage !== 5 || actionLoading}
              onClick={() => onTransition("openPaper", [paper.id])}
            >
              {actionLoading ? "Processing..." : "🏁 Officially Open Exam Paper"}
            </button>
          )}

          {/* Emergency Compromise Button: Available to all registered roles */}
          <button
            className="btn btn-danger btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setShowCompromiseModal(true)}
            disabled={actionLoading}
          >
            🚨 Flag Compromised
          </button>
        </div>
      )}

      {/* Compromise Confirmation Modal */}
      {showCompromiseModal && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <h3 style={{ color: "var(--accent-rose)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              ⚠️ Emergency Alert: Flag Paper Compromised
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "16px", fontSize: "0.9rem" }}>
              Are you sure you want to flag <strong>Paper #{paper.id}</strong> as compromised?
              This is an <strong>irreversible on-chain action</strong>. It will permanently freeze the paper and prevent key release.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                className="btn btn-outline"
                onClick={() => setShowCompromiseModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setShowCompromiseModal(false);
                  onFlagCompromised(paper.id);
                }}
              >
                Confirm Emergency Freeze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
