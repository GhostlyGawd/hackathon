import { QUALITY_PROFILE } from "@pactwire/core";

export function GET(): Response {
  return Response.json(
    {
      product: "Pactwire",
      service: "web",
      status: "ok",
      qualityProfile: {
        version: QUALITY_PROFILE.version,
        accessibility: QUALITY_PROFILE.accessibility.standard,
        consoleInteractionP95Ms:
          QUALITY_PROFILE.performance.consoleInteractionP95Ms,
        runProgressP95Ms: QUALITY_PROFILE.performance.runProgressP95Ms,
        packagedBrowser: `${QUALITY_PROFILE.compatibility.packagedBrowser} ${QUALITY_PROFILE.compatibility.packagedChromiumVersion} (revision ${QUALITY_PROFILE.compatibility.packagedChromiumRevision})`,
      },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
