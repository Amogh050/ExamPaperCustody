// Left-hand paper cards list component — Day 6

import React from "react";
import { STAGES } from "../utils/constants";
import { shortenAddress } from "../utils/ethereum";

export default function PaperList({
  papers,
  selectedPaperId,
  onSelectPaper,
  loading
}) {
  return (
    <div className="glass-card">
      <div className="card-header">
        <h3 className="card-title">📦 Exam Papers ({papers.length})</h3>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
          Loading papers from blockchain...
        </div>
      ) : papers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
          No exam papers created yet. Switch to <strong>Setter</strong> role to register one!
        </div>
      ) : (
        <div>
          {papers.map((p) => {
            const isSelected = p.id === selectedPaperId;
            const stageInfo = STAGES.find(s => s.id === p.stage) || STAGES[0];
            const isCompromised = p.stage === 7;
            const examDate = new Date(p.examTime * 1000).toLocaleString([], {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return (
              <div
                key={p.id}
                className={`paper-card ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectPaper(p.id)}
                style={{ cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ fontSize: "1rem" }}>Paper #{p.id}</h4>
                  <span
                    className="stage-badge"
                    style={{
                      backgroundColor: `${stageInfo.color}22`,
                      color: stageInfo.color,
                      border: `1px solid ${stageInfo.color}66`
                    }}
                  >
                    {isCompromised ? "🚨 COMPROMISED" : stageInfo.label}
                  </span>
                </div>

                <div className="paper-meta">
                  <div className="meta-item">
                    <span className="meta-label">Centre</span>
                    <span className="meta-value mono">{shortenAddress(p.centre)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Exam Start</span>
                    <span className="meta-value">{examDate}</span>
                  </div>
                </div>

                <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Hash: <span className="mono">{p.ciphertextHash}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
