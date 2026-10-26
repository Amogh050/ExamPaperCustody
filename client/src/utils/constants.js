// Application Constants, Stages, and Hardhat Test Accounts — Day 6

export const CHAIN_ID = 31337;
export const RPC_URL = "http://localhost:8545";
export const API_BASE_URL = "http://localhost:5001/api";

export const STAGES = [
  { id: 0, key: "Created", label: "Created", description: "Uploaded & registered by Setter", color: "#6366f1" },
  { id: 1, key: "Moderated", label: "Moderated", description: "Reviewed & approved by Moderator", color: "#8b5cf6" },
  { id: 2, key: "PrintedSealed", label: "Printed & Sealed", description: "Printed & sealed by Printer", color: "#ec4899" },
  { id: 3, key: "Dispatched", label: "Dispatched", description: "Dispatched to Centre by Controller", color: "#f59e0b" },
  { id: 4, key: "ReceivedAtCentre", label: "Received at Centre", description: "Receipt confirmed by Centre", color: "#0ea5e9" },
  { id: 5, key: "KeyReleased", label: "Key Released", description: "Time-locked key released by Centre", color: "#10b981" },
  { id: 6, key: "Opened", label: "Opened", description: "Exam officially opened by Controller", color: "#059669" },
  { id: 7, key: "Compromised", label: "🚨 Compromised", description: "Emergency freeze: paper tampered or leaked", color: "#ef4444" }
];

export const STAGE_NAMES = STAGES.map(s => s.label);

// Standard Hardhat Test Accounts with pre-configured project roles
export const HARDHAT_ACCOUNTS = [
  {
    roleKey: "controller",
    roleName: "Controller (Admin)",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    badge: "Admin",
    badgeColor: "#6366f1"
  },
  {
    roleKey: "setter",
    roleName: "Paper Setter",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    badge: "Author",
    badgeColor: "#8b5cf6"
  },
  {
    roleKey: "moderator",
    roleName: "Moderator",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb2173f1a004aac530e0e980e2ddf82e37e96b3",
    badge: "Reviewer",
    badgeColor: "#ec4899"
  },
  {
    roleKey: "printer",
    roleName: "Secure Printer",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    badge: "Printer",
    badgeColor: "#f59e0b"
  },
  {
    roleKey: "centre1",
    roleName: "Exam Centre 1",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec3427449b222584ab17150431b9daea29fb81591034f239b417578b92",
    badge: "Centre",
    badgeColor: "#0ea5e9"
  },
  {
    roleKey: "centre2",
    roleName: "Exam Centre 2",
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    badge: "Centre",
    badgeColor: "#0ea5e9"
  },
  {
    roleKey: "outsider",
    roleName: "Public Observer / Student",
    address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    badge: "Public",
    badgeColor: "#64748b"
  }
];
