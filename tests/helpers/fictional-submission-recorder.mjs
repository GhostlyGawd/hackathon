export const fictionalSubmissionRecorderCheckpointId =
  "student-submission-request";

export function createFictionalSubmissionRecorderConfig({
  workspaceId,
  runId,
  secrets,
}) {
  return {
    workspaceId,
    runId,
    captureMode: "BROWSER_CDP",
    authorizedRequestRules: [
      {
        host: "classroom-service.pactwire.test",
        method: "POST",
        path: "/collect",
        fields: ["studentEmail", "submission"],
      },
    ],
    requiredCheckpoints: [
      {
        id: fictionalSubmissionRecorderCheckpointId,
        required: true,
        host: "classroom-service.pactwire.test",
        method: "POST",
        path: "/collect",
        requiredRequestFields: ["studentEmail", "submission"],
        requireResponseMetadata: true,
      },
    ],
    secrets,
  };
}
