import process from "node:process";
import {
  fixtureVersionSchema,
  startFixtureServer,
} from "./index.js";

const version = fixtureVersionSchema.parse(
  process.env.PACTWIRE_FIXTURE_VERSION ?? "BASELINE",
);
const port = Number.parseInt(process.env.PACTWIRE_FIXTURE_PORT ?? "4110", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PACTWIRE_FIXTURE_PORT must be an integer from 1 to 65535");
}

const server = await startFixtureServer({
  host: process.env.PACTWIRE_FIXTURE_HOST ?? "127.0.0.1",
  port,
  seed: process.env.PACTWIRE_FIXTURE_SEED ?? "local-fictional-demo",
  version,
});

process.stdout.write(
  [
    `Pactwire Classroom Fixture ${version}`,
    `Server: ${server.origin}`,
    `Browser URL: ${server.classroomOrigin}`,
    "Launch Chromium with --host-resolver-rules=MAP *.pactwire.test 127.0.0.1",
    "All identities and content are fictional.",
    "",
  ].join("\n"),
);

let closing = false;
const close = async (): Promise<void> => {
  if (closing) return;
  closing = true;
  await server.close();
};
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
