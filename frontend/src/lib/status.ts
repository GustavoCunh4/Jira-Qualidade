export type StatusTone = "done" | "progress" | "planned" | "blocked" | "warning" | "neutral";

export function getStatusTone(status?: string | null, labels?: string[]) {
  const raw = (status || "").toLowerCase();
  const lowerLabels = (labels || []).map((label) => label.toLowerCase());

  if (lowerLabels.some((label) => label === "blocked" || label === "blocker")) return "blocked";
  if (raw.includes("conclu") || raw === "done" || raw.includes("resolved")) return "done";
  if (raw.includes("andamento") || raw.includes("progress") || raw.includes("review")) return "progress";
  if (raw.includes("planej") || raw.includes("plan")) return "planned";
  if (raw.includes("pendente") || raw.includes("to do") || raw.includes("todo")) return "warning";
  return "neutral";
}

export function isLikelyDoneStatus(status?: string | null) {
  const raw = (status || "").toLowerCase();
  return raw.includes("conclu") || raw === "done" || raw.includes("resolv");
}

export function isLikelyInProgressStatus(status?: string | null) {
  const raw = (status || "").toLowerCase();
  return raw.includes("andamento") || raw.includes("progress") || raw.includes("review");
}

export function isBlocked(labels?: string[]) {
  return (labels || []).some((label) => {
    const l = label.toLowerCase();
    return l === "blocked" || l === "blocker";
  });
}

export function priorityWeight(priority?: string | null) {
  const p = (priority || "").toLowerCase();
  if (p.includes("highest")) return 5;
  if (p.includes("high") || p.includes("alta")) return 4;
  if (p.includes("medium") || p.includes("media") || p.includes("média")) return 3;
  if (p.includes("low") || p.includes("baixa")) return 2;
  if (p.includes("lowest")) return 1;
  return 0;
}
