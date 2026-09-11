import type { CallerContext, Incident, Scenario } from "./types";

export const TRUSTED_CONTACTS = [
  { name: "Dad · Rajesh Sharma", number: "+91 98107 44120", relation: "Saved as Papa" },
  { name: "Mom · Anita Sharma", number: "+91 98201 22811", relation: "Saved as Maa" },
  { name: "Branch RM · Neha Iyer", number: "+91 22 4001 9000", relation: "HDFC relationship manager" },
];

export const SCENARIOS: Scenario[] = [
  {
    id: "family-upi",
    title: "Family UPI emergency",
    victim: "Daughter in Delhi",
    line: "Beta, I’m in trouble. Send money to this UPI now. Don’t tell Maa.",
    mode: "protect",
    preset: "standard",
    context: { unknownNumber: true, firstTimeCaller: true, urgencyLanguage: true },
    caller: {
      cli: "+91 84xxx 22910",
      kycName: "Claims to be Papa",
      cliMatchesContact: false,
      transactionType: "UPI — emergency",
      amountInr: 48000,
    },
    result: {
      score: 79,
      band: "high",
      windowMs: 1700,
      retention: "features_only",
      layers: {
        acoustic: { score: 0.8, reasons: ["Vocoder-like high-frequency cutoff"] },
        prosody: { score: 0.7, reasons: ["Unusually flat pitch contour"] },
        neural: { score: null, reasons: ["Neural anti-spoof unloaded"] },
        context: { score: 0.78, reasons: ["Urgency language: send money / kisi ko mat batana"] },
      },
    },
  },
  {
    id: "cfo-neft",
    title: "CFO vendor payout",
    victim: "Treasury analyst",
    line: "This is Rohan. Approve the NEFT now. Do not call anyone on the floor.",
    mode: "operations",
    preset: "high_value",
    context: { unknownNumber: true, firstTimeCaller: true, urgencyLanguage: true },
    caller: {
      cli: "+91 90000 18442",
      kycName: "Claims to be Rohan Mehta, CFO",
      cliMatchesContact: false,
      transactionType: "NEFT — vendor payout",
      amountInr: 1850000,
    },
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
    id: "official-otp",
    title: "Official KYC callback",
    victim: "Branch staff",
    line: "Income Tax. Confirm the OTP I just sent or the account will be frozen.",
    mode: "operations",
    preset: "standard",
    context: { unknownNumber: true, firstTimeCaller: true, urgencyLanguage: true },
    caller: {
      cli: "+91 11 4000 0000",
      kycName: "Claims to be ITD officer",
      cliMatchesContact: false,
      transactionType: "OTP disclosure",
      amountInr: 0,
    },
    result: {
      score: 68,
      band: "review",
      windowMs: 1500,
      retention: "features_only",
      layers: {
        acoustic: { score: 0.52, reasons: ["Energy envelope too stable across windows"] },
        prosody: { score: 0.58, reasons: ["Speaking energy lacks natural bursts and pauses"] },
        neural: { score: null, reasons: ["Neural anti-spoof unloaded"] },
        context: { score: 0.8, reasons: ["Urgency language: OTP / account freeze"] },
      },
    },
  },
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
