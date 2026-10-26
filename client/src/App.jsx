// Main Application Component — Day 6
//
// ExamCustody: Role Dashboards, Event-Driven Timeline, Public Hash Verification,
// and Human-Readable Revert Messages connected to Hardhat (localhost:8545, chainId: 31337).

import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import deployment from "./deployment.json";
import { HARDHAT_ACCOUNTS, API_BASE_URL, STAGES } from "./utils/constants";
import {
  getSigner,
  getContract,
  decodeContractError,
  fetchPaperTimeline
} from "./utils/ethereum";

import Navbar from "./components/Navbar";
import RoleBar from "./components/RoleBar";
import PaperList from "./components/PaperList";
import PaperTimeline from "./components/PaperTimeline";
import RoleActions from "./components/RoleActions";
import VerifyHashPage from "./components/VerifyHashPage";
import CreatePaperModal from "./components/CreatePaperModal";
import DecryptedPaperModal from "./components/DecryptedPaperModal";

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "verify"
  const [selectedRoleKey, setSelectedRoleKey] = useState("controller");
  const [currentAddress, setCurrentAddress] = useState(HARDHAT_ACCOUNTS[0].address);
  const [ethBalance, setEthBalance] = useState("10000.0");

  const [papers, setPapers] = useState([]);
  const [selectedPaperId, setSelectedPaperId] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const [loadingPapers, setLoadingPapers] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);

  const [notification, setNotification] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [decryptedData, setDecryptedData] = useState(null);

  // Check Express key service health
  useEffect(() => {
    async function checkServer() {
      try {
        const res = await fetch(`${API_BASE_URL}/status`);
        if (res.ok) setServerOnline(true);
      } catch (err) {
        setServerOnline(false);
      }
    }
    checkServer();
    const interval = setInterval(checkServer, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update signer address and balance when role changes
  useEffect(() => {
    async function updateSignerInfo() {
      try {
        const signer = await getSigner(
          selectedRoleKey === "metamask" ? "metamask" : HARDHAT_ACCOUNTS.find(a => a.roleKey === selectedRoleKey)
        );
        const address = await signer.getAddress();
        setCurrentAddress(address);

        const provider = signer.provider;
        if (provider) {
          const balance = await provider.getBalance(address);
          setEthBalance(Number(ethers.formatEther(balance)).toFixed(2));
        }
      } catch (err) {
        setNotification({
          type: "error",
          message: decodeContractError(err)
        });
      }
    }
    updateSignerInfo();
  }, [selectedRoleKey]);

  // Load all papers from on-chain mapping
  const loadPapers = useCallback(async () => {
    setLoadingPapers(true);
    try {
      const contract = getContract();
      const count = await contract.paperCount();
      const total = Number(count);

      const loaded = [];
      for (let i = 1; i <= total; i++) {
        const p = await contract.papers(i);
        const stageNum = Number(p.stage);
        loaded.push({
          id: Number(p.id),
          ciphertextHash: p.ciphertextHash,
          fileRef: p.fileRef,
          examTime: Number(p.examTime),
          stage: stageNum,
          stageLabel: STAGES.find(s => s.id === stageNum)?.label || `Stage ${stageNum}`,
          centre: p.centre
        });
      }

      setPapers(loaded);
      if (loaded.length > 0 && !selectedPaperId) {
        setSelectedPaperId(loaded[0].id);
      }
    } catch (err) {
      console.error("Error loading papers from contract:", err);
    } finally {
      setLoadingPapers(false);
    }
  }, [selectedPaperId]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  // Load timeline events for selected paper
  useEffect(() => {
    if (!selectedPaperId) {
      setTimeline([]);
      return;
    }

    async function loadTimelineEvents() {
      setLoadingTimeline(true);
      try {
        const contract = getContract();
        const events = await fetchPaperTimeline(selectedPaperId, contract);
        setTimeline(events);
      } catch (err) {
        console.error("Error loading timeline:", err);
      } finally {
        setLoadingTimeline(false);
      }
    }

    loadTimelineEvents();
  }, [selectedPaperId]);

  // Stage transition execution
  const handleTransition = async (functionName, args) => {
    setActionLoading(true);
    setNotification(null);

    try {
      const currentRole = HARDHAT_ACCOUNTS.find(a => a.roleKey === selectedRoleKey);
      const signer = await getSigner(selectedRoleKey === "metamask" ? "metamask" : currentRole);
      const contract = getContract(signer);

      console.log(`Executing ${functionName}(${args.join(", ")}) with signer ${await signer.getAddress()}`);
      const tx = await contract[functionName](...args);
      setNotification({
        type: "warning",
        message: `Transaction sent! Waiting for confirmation (tx: ${tx.hash.substring(0, 10)}...)...`
      });

      await tx.wait();

      setNotification({
        type: "success",
        message: `Transaction Confirmed! Action '${functionName}' completed successfully on blockchain.`
      });

      await loadPapers();
      if (selectedPaperId) {
        const events = await fetchPaperTimeline(selectedPaperId, getContract());
        setTimeline(events);
      }
    } catch (err) {
      // Decode Solidity custom error into student-friendly text
      const friendlyMessage = decodeContractError(err);
      setNotification({
        type: "error",
        message: friendlyMessage
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Emergency compromise handler
  const handleFlagCompromised = async (paperId) => {
    await handleTransition("flagCompromised", [paperId]);
  };

  // Setter create paper handler
  const handleCreatePaper = async (data) => {
    setActionLoading(true);
    setNotification(null);

    try {
      const currentRole = HARDHAT_ACCOUNTS.find(a => a.roleKey === selectedRoleKey);
      const signer = await getSigner(selectedRoleKey === "metamask" ? "metamask" : currentRole);
      const contract = getContract(signer);

      const tx = await contract.createPaper(
        data.ciphertextHash,
        data.fileRef,
        data.examTime,
        data.centre
      );
      await tx.wait();

      setNotification({
        type: "success",
        message: `Exam paper created successfully on-chain!`
      });

      setCreateModalOpen(false);
      await loadPapers();
    } catch (err) {
      setNotification({
        type: "error",
        message: decodeContractError(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Centre request AES key from Express Key Service
  const handleRequestKey = async (paperId) => {
    setActionLoading(true);
    setNotification(null);

    try {
      const currentRole = HARDHAT_ACCOUNTS.find(a => a.roleKey === selectedRoleKey);
      const signer = await getSigner(selectedRoleKey === "metamask" ? "metamask" : currentRole);
      const walletAddress = await signer.getAddress();

      // Step 1: Request fresh challenge from backend
      const challengeRes = await fetch(`${API_BASE_URL}/challenge/${paperId}?wallet=${walletAddress}`);
      if (!challengeRes.ok) {
        const errJson = await challengeRes.json();
        throw new Error(errJson.error || "Failed to obtain challenge from key service.");
      }
      const { challenge } = await challengeRes.json();

      // Step 2: Sign challenge with Centre wallet
      const signature = await signer.signMessage(challenge);

      // Step 3: Request decryption key
      const keyRes = await fetch(`${API_BASE_URL}/key/${paperId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          walletAddress,
          challenge
        })
      });

      const keyData = await keyRes.json();
      if (!keyRes.ok) {
        throw new Error(keyData.error || "Key release denied by Key Service.");
      }

      // Step 4: Request decrypted text from helper
      const decRes = await fetch(`${API_BASE_URL}/papers/${paperId}/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyHex: keyData.keyHex })
      });
      const decResult = await decRes.json();

      setDecryptedData({
        paperId,
        keyHex: keyData.keyHex,
        subject: decResult.subject,
        plaintext: decResult.plaintext || "Decryption completed."
      });

      setNotification({
        type: "success",
        message: "Decryption key successfully released to authenticated exam centre!"
      });
    } catch (err) {
      setNotification({
        type: "error",
        message: err.message
      });
    } finally {
      setActionLoading(false);
    }
  };

  const selectedPaper = papers.find(p => p.id === selectedPaperId) || null;

  return (
    <div className="app-container">
      {/* 1. Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        serverOnline={serverOnline}
        contractAddress={deployment.contractAddress}
      />

      {/* 2. Role Switcher & Account Details */}
      <RoleBar
        selectedRoleKey={selectedRoleKey}
        setSelectedRoleKey={setSelectedRoleKey}
        currentAddress={currentAddress}
        ethBalance={ethBalance}
        onRefresh={() => {
          loadPapers();
          if (selectedPaperId) {
            fetchPaperTimeline(selectedPaperId, getContract()).then(setTimeline);
          }
        }}
      />

      {/* 3. Notification & Readable Revert Alert Box */}
      {notification && (
        <div className={`alert-box alert-${notification.type}`}>
          <span style={{ fontSize: "1.2rem" }}>
            {notification.type === "error" ? "❌" : notification.type === "success" ? "✅" : "⏳"}
          </span>
          <div style={{ flex: 1 }}>{notification.message}</div>
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Tab 1: Custody Dashboard */}
      {activeTab === "dashboard" && (
        <div>
          <div className="grid-2">
            {/* Left: Paper Catalog List */}
            <PaperList
              papers={papers}
              selectedPaperId={selectedPaperId}
              onSelectPaper={setSelectedPaperId}
              loading={loadingPapers}
            />

            {/* Right: Paper Timeline & Event Audit Trail */}
            <PaperTimeline
              paper={selectedPaper}
              timeline={timeline}
              loadingTimeline={loadingTimeline}
            />
          </div>

          {/* Action Execution Panel */}
          <RoleActions
            paper={selectedPaper}
            selectedRoleKey={selectedRoleKey}
            currentAddress={currentAddress}
            onTransition={handleTransition}
            onFlagCompromised={handleFlagCompromised}
            onRequestKey={handleRequestKey}
            onOpenCreateModal={() => setCreateModalOpen(true)}
            actionLoading={actionLoading}
          />
        </div>
      )}

      {/* 5. Tab 2: Public File Hash Verification Page */}
      {activeTab === "verify" && (
        <VerifyHashPage
          contract={getContract()}
          papers={papers}
        />
      )}

      {/* 6. Modals */}
      <CreatePaperModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreatePaper={handleCreatePaper}
        loading={actionLoading}
      />

      <DecryptedPaperModal
        isOpen={Boolean(decryptedData)}
        onClose={() => setDecryptedData(null)}
        data={decryptedData}
      />
    </div>
  );
}
