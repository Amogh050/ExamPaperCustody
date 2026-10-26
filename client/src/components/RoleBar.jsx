// Role & Account Switcher Bar — Day 6

import React from "react";
import { HARDHAT_ACCOUNTS } from "../utils/constants";
import { shortenAddress } from "../utils/ethereum";

export default function RoleBar({
  selectedRoleKey,
  setSelectedRoleKey,
  currentAddress,
  ethBalance,
  onRefresh
}) {
  const currentRole = HARDHAT_ACCOUNTS.find(a => a.roleKey === selectedRoleKey);

  return (
    <div className="user-bar">
      <div className="role-select-box">
        <label htmlFor="role-select">👤 Active Role:</label>
        <select
          id="role-select"
          className="custom-select"
          value={selectedRoleKey}
          onChange={(e) => setSelectedRoleKey(e.target.value)}
        >
          {HARDHAT_ACCOUNTS.map((acc) => (
            <option key={acc.roleKey} value={acc.roleKey}>
              {acc.roleName} ({shortenAddress(acc.address)})
            </option>
          ))}
          <option value="metamask">🦊 MetaMask (Browser Wallet)</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {currentRole && (
          <span
            className="stage-badge"
            style={{
              backgroundColor: `${currentRole.badgeColor}22`,
              color: currentRole.badgeColor,
              border: `1px solid ${currentRole.badgeColor}66`
            }}
          >
            {currentRole.badge}
          </span>
        )}

        <div className="account-badge">
          <span style={{ color: "var(--text-muted)" }}>Address:</span>
          <span className="mono" style={{ fontWeight: 600 }}>{shortenAddress(currentAddress)}</span>
        </div>

        <div className="account-badge">
          <span style={{ color: "var(--text-muted)" }}>Balance:</span>
          <span style={{ fontWeight: 600 }}>{ethBalance} ETH</span>
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={onRefresh}
          title="Reload on-chain contract state and events"
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
