import type { CallerContext, Incident } from "./types";

export const TRUSTED_CONTACTS = [
  { name: "Dad · Rajesh Sharma", number: "+91 98107 44120", relation: "Saved as Papa" },
  { name: "Mom · Anita Sharma", number: "+91 98201 22811", relation: "Saved as Maa" },
  { name: "Branch RM · Neha Iyer", number: "+91 22 4001 9000", relation: "HDFC relationship manager" },
];

export const SAMPLE_CALLER: CallerContext = {
  cli: "+91 90000 18442",
  kycName: "Claims to be Rohan Mehta, CFO",
  cliMatchesContact: false,
  transactionType: "NEFT — vendor payout",
  amountInr: 1850000,
};

export const SAMPLE_INCIDENTS: Incident[] = [
  {
    id: "inc_seed_1",
    timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    mode: "operations",
    durationMs: 74000,
    source: "live",
    label: "Inbound · claimed CFO",
    action: "hold",
    actionReason: "CLI unknown + high synthetic risk during payout instruction",
    result: {
      score: 84,
      band: "high",
      windowMs: 1600,
      retention: "features_only",
      layers: {
        acoustic: { score: 0.86, reasons: ["Vocoder-like high-frequency cutoff"] },
        prosody: { score: 0.74, reasons: ["Unusually flat pitch contour"] },
        neural: { score: null, reasons: ["Neural anti-spoof unloaded"] },
        context: { score: 0.72, reasons: ["Urgency language: approve the transfer"] },
      },
    },
  },
  {
    id: "inc_seed_2",
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    mode: "protect",
    durationMs: 38000,
    source: "upload",
    label: "Family callback check",
    result: {
      score: 22,
      band: "genuine",
      windowMs: 1800,
      retention: "features_only",
      layers: {
        acoustic: { score: 0.18, reasons: ["Spectral shape is consistent with a live human vocal tract"] },
        prosody: { score: 0.2, reasons: ["Pitch micro-variation looks human"] },
        neural: { score: null, reasons: ["Neural anti-spoof unloaded"] },
        context: { score: 0.08, reasons: ["No social-engineering context flags raised"] },
      },
    },
  },
  {
    id: "inc_seed_3",
    timestamp: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
    mode: "protect",
    durationMs: 51000,
    source: "demo",
    label: "UPI urgency clip",
    result: {
      score: 61,
      band: "review",
      windowMs: 1500,
      retention: "features_only",
      layers: {
        acoustic: { score: 0.48, reasons: ["Energy envelope too stable across windows"] },
        prosody: { score: 0.55, reasons: ["Speaking energy lacks natural bursts and pauses"] },
        neural: { score: null, reasons: ["Neural anti-spoof unloaded"] },
        context: { score: 0.7, reasons: ["Urgency language: send money / OTP"] },
      },
    },
  },
];
