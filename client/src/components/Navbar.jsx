// Navbar component with brand, network status, and page tab switcher — Day 6

import React from "react";

export default function Navbar({ activeTab, setActiveTab, serverOnline, contractAddress }) {
  return (
    <header className="navbar">
      <div className="brand">
        <div className="brand-icon">📜</div>
        <div>
          <div className="brand-title">ExamCustody</div>
          <div className="brand-subtitle">University Blockchain Chain-of-Custody</div>
        </div>
      </div>

      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Custody Dashboard
        </button>
        <button
          className={`nav-tab ${activeTab === "verify" ? "active" : ""}`}
          onClick={() => setActiveTab("verify")}
        >
          🔍 Verify File Hash
        </button>
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div className="account-badge" title={`Contract deployed at: ${contractAddress}`}>
          <div className="status-dot"></div>
          <span>Hardhat (31337)</span>
        </div>

        <div className="account-badge" title="Express Key Service at http://localhost:5001">
          <div className={`status-dot ${serverOnline ? "" : "danger"}`}></div>
          <span>Key Service: {serverOnline ? "Online" : "Offline"}</span>
        </div>
      </div>
    </header>
  );
}
