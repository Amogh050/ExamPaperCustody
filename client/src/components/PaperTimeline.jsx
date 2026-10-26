// Paper Timeline & On-Chain Audit Trail Reconstructed from Events — Day 6

import React from "react";
import { STAGES } from "../utils/constants";
import { shortenAddress } from "../utils/ethereum";

export default function PaperTimeline({ paper, timeline, loadingTimeline }) {
  if (!paper) {
    return (
      <div className="glass-card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📋</div>
        <h3>Select a Paper</h3>
        <p style={{ color: "var(--text-muted)", marginTop: "6px" }}>
          Choose a question paper from the left panel to inspect its full on-chain chain-of-custody timeline.
        </p>
      </div>
    );
  }

  const currentStageId = paper.stage;
  const isCompromised = currentStageId === 7;

  return (
    <div className="glass-card">
      <div className="card-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 className="card-title">Paper #{paper.id} — Custody Audit Trail</h2>
            <span
              className="stage-badge"
              style={{
                backgroundColor: isCompromised ? "rgba(239, 68, 68, 0.2)" : "rgba(99, 102, 241, 0.2)",
                color: isCompromised ? "#ef4444" : "#818cf8",
                border: `1px solid ${isCompromised ? "#ef4444" : "#6366f1"}`
              }}
            >
              {STAGES.find(s => s.id === currentStageId)?.label || `Stage ${currentStageId}`}
            </span>
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Off-chain Storage: <span className="mono">{paper.fileRef}</span>
          </div>
        </div>
      </div>

      {/* Visual Pipeline Steps */}
      <div className="steps-pipeline">
        {STAGES.filter(s => s.id !== 7).map((step, idx) => {
          let stepClass = "";
          if (isCompromised) {
            stepClass = "compromised";
          } else if (step.id < currentStageId) {
            stepClass = "completed";
          } else if (step.id === currentStageId) {
            stepClass = "active";
          }

          return (
            <div key={step.id} className={`pipeline-step ${stepClass}`}>
              <div className="step-node">
                {step.id < currentStageId && !isCompromised ? "✓" : idx + 1}
              </div>
              <div className="step-label">{step.label}</div>
            </div>
          );
        })}
      </div>

      {isCompromised && (
        <div className="alert-box alert-error" style={{ marginTop: "16px" }}>
          <span style={{ fontSize: "1.3rem" }}>🚨</span>
          <div>
            <strong>EMERGENCY FREEZE ACTIVE:</strong>
            <div>This paper was flagged as compromised on-chain. All further custody handoffs and key releases are permanently blocked.</div>
          </div>
        </div>
      )}

      {/* On-Chain Events Timeline */}
      <h3 style={{ fontSize: "1rem", marginTop: "24px", marginBottom: "14px" }}>
        📜 Immutable Event Trail (Hardhat Logs)
      </h3>

      {loadingTimeline ? (
        <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
          Loading blockchain event logs...
        </div>
      ) : timeline.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
          No events recorded for this paper yet.
        </div>
      ) : (
        <div className="timeline-list">
          {timeline.map((ev, index) => {
            const dateStr = new Date(ev.timestamp * 1000).toLocaleString();
            const isCompromiseEvent = ev.type === "COMPROMISED";

            return (
              <div key={index} className={`timeline-item ${isCompromiseEvent ? "compromised" : ""}`}>
                <div className="timeline-dot">
                  {isCompromiseEvent ? "!" : "●"}
                </div>
                <div className="timeline-content">
                  <div className="timeline-header">
                    <strong style={{ color: isCompromiseEvent ? "var(--accent-rose)" : "#fff" }}>
                      {ev.type === "CREATED" ? "Paper Registered on Blockchain" :
                       ev.type === "COMPROMISED" ? "🚨 Paper Flagged as Compromised" :
                       `Stage Advanced: ${ev.oldStageLabel} ➔ ${ev.stageLabel}`}
                    </strong>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{dateStr}</span>
                  </div>

                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    <div>
                      Actor: <span className="mono" style={{ color: "#fff" }}>{shortenAddress(ev.actor)}</span>
                      {ev.centre && (
                        <span> | Assigned Centre: <span className="mono">{shortenAddress(ev.centre)}</span></span>
                      )}
                    </div>
                    {ev.ciphertextHash && (
                      <div style={{ marginTop: "4px" }}>
                        SHA-256 Hash: <span className="mono" style={{ wordBreak: "break-all" }}>{ev.ciphertextHash}</span>
                      </div>
                    )}
                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      Block #{ev.blockNumber} • Tx: <span className="mono">{shortenAddress(ev.txHash)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
