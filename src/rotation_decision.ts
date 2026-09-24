export type DeploymentCheck = {
  deployment: string;
  stillUsesOldKey: boolean;
};

export type RotationDecision = {
  status: "follow-up-required" | "ready-to-retire-old-key";
  technicianFollowUp: string[];
  dispatchStatus: Record<string, "update-key" | "verified">;
  workOrderPhotos: string[];
};

export function decideRotation(
  checks: DeploymentCheck[],
  workOrderPhotos: string[],
): RotationDecision {
  const technicianFollowUp = checks
    .filter((check) => check.stillUsesOldKey)
    .map((check) => check.deployment);

  return {
    status: technicianFollowUp.length > 0
      ? "follow-up-required"
      : "ready-to-retire-old-key",
    technicianFollowUp,
    dispatchStatus: Object.fromEntries(
      checks.map((check) => [
        check.deployment,
        check.stillUsesOldKey ? "update-key" : "verified",
      ]),
    ),
    workOrderPhotos,
  };
}

export function checksFromLogData(
  data: unknown,
  deployments: string[],
  oldKeyMarker: string,
): DeploymentCheck[] {
  const searchableLogText = JSON.stringify(data).toLowerCase();
  const marker = oldKeyMarker.toLowerCase();

  return deployments.map((deployment) => {
    const name = deployment.toLowerCase();
    return {
      deployment,
      stillUsesOldKey: searchableLogText.includes(name)
        && searchableLogText.includes(marker),
    };
  });
}
