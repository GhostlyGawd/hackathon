import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
  type WebSocketRoute,
} from "playwright-core";
import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const hostname = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine((value) => value === value.toLowerCase(), {
    message: "Allowed network hosts must be lowercase exact hostnames",
  })
  .refine((value) => {
    try {
      return new URL(`https://${value}`).hostname === value;
    } catch {
      return false;
    }
  }, "Allowed network hosts must be exact hostnames");

const exactHttpOrigin = z
  .string()
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.origin === value
    );
  }, "Allowed navigation destinations must be exact HTTP origins");

export const isolatedBrowserSessionConfigSchema = z
  .object({
    workspaceId: uuid,
    runId: uuid,
    allowedNavigationOrigins: z.array(exactHttpOrigin).min(1).max(16),
    allowedNetworkHosts: z.array(hostname).min(1).max(32),
    popupPolicy: z.enum(["BLOCK_ALL", "ALLOW_LISTED_ONLY"]),
    downloadPolicy: z.enum(["BLOCK", "ALLOW_ISOLATED"]),
    clipboardPolicy: z.enum(["BLOCK", "ISOLATED"]),
    viewport: z
      .object({
        width: z.number().int().min(320).max(3_840),
        height: z.number().int().min(320).max(2_160),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.allowedNavigationOrigins).size !==
        value.allowedNavigationOrigins.length ||
      new Set(value.allowedNetworkHosts).size !== value.allowedNetworkHosts.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Browser origins and network hosts must be unique",
      });
    }
    const allowedHosts = new Set(value.allowedNetworkHosts);
    if (
      value.allowedNavigationOrigins.some(
        (origin) => !allowedHosts.has(new URL(origin).hostname),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedNetworkHosts"],
        message: "Every allowed navigation origin needs an allowed network host",
      });
    }
  });
export type IsolatedBrowserSessionConfig = z.infer<
  typeof isolatedBrowserSessionConfigSchema
>;

export type BrowserRequestPolicyReason =
  | "ALLOWED"
  | "PROTOCOL_BLOCKED"
  | "URL_CREDENTIALS_BLOCKED"
  | "NAVIGATION_ORIGIN_BLOCKED"
  | "NETWORK_HOST_BLOCKED";

export class BrowserRequestPolicyError extends Error {
  readonly code = "INVALID_BROWSER_REQUEST_URL";

  constructor() {
    super("The browser request URL could not be evaluated safely.");
    this.name = "BrowserRequestPolicyError";
  }
}

export function evaluateBrowserRequestPolicy(
  config: IsolatedBrowserSessionConfig,
  request: { readonly url: string; readonly navigation: boolean },
): Readonly<{ allowed: boolean; reason: BrowserRequestPolicyReason }> {
  let target: URL;
  try {
    target = new URL(request.url);
  } catch {
    throw new BrowserRequestPolicyError();
  }
  const allowedProtocols = request.navigation
    ? ["http:", "https:"]
    : ["http:", "https:", "ws:", "wss:"];
  if (!allowedProtocols.includes(target.protocol)) {
    return Object.freeze({ allowed: false, reason: "PROTOCOL_BLOCKED" });
  }
  if (target.username !== "" || target.password !== "") {
    return Object.freeze({
      allowed: false,
      reason: "URL_CREDENTIALS_BLOCKED",
    });
  }
  if (request.navigation) {
    return config.allowedNavigationOrigins.includes(target.origin)
      ? Object.freeze({ allowed: true, reason: "ALLOWED" })
      : Object.freeze({
          allowed: false,
          reason: "NAVIGATION_ORIGIN_BLOCKED",
        });
  }
  return config.allowedNetworkHosts.includes(target.hostname.toLowerCase())
    ? Object.freeze({ allowed: true, reason: "ALLOWED" })
    : Object.freeze({ allowed: false, reason: "NETWORK_HOST_BLOCKED" });
}

export interface IsolationResourceAllocation {
  readonly workspaceId: string;
  readonly runId: string;
  readonly browserId: string;
  readonly contextId: string;
  readonly clipboardId: string;
  readonly downloadScopeId: string;
}

const isolationResourceAllocationSchema = z
  .object({
    workspaceId: uuid,
    runId: uuid,
    browserId: uuid,
    contextId: uuid,
    clipboardId: uuid,
    downloadScopeId: uuid,
  })
  .strict();

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Object.isFrozen(candidate)
    ) {
      return;
    }
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function allocationResources(
  allocation: IsolationResourceAllocation,
): readonly string[] {
  return [
    allocation.browserId,
    allocation.contextId,
    allocation.clipboardId,
    allocation.downloadScopeId,
  ];
}

export class IsolationResourceConflictError extends Error {
  readonly code = "ISOLATION_RESOURCE_CONFLICT";

  constructor() {
    super("A browser run or isolation resource was already allocated.");
    this.name = "IsolationResourceConflictError";
  }
}

export class IsolationResourceRegistry {
  readonly #active = new Map<string, IsolationResourceAllocation>();
  readonly #usedRuns = new Set<string>();
  readonly #usedResources = new Set<string>();

  register(candidate: IsolationResourceAllocation): void {
    const allocation = isolationResourceAllocationSchema.parse(candidate);
    const resources = allocationResources(allocation);
    if (
      this.#usedRuns.has(allocation.runId) ||
      new Set(resources).size !== resources.length ||
      resources.some((resource) => this.#usedResources.has(resource))
    ) {
      throw new IsolationResourceConflictError();
    }
    this.#usedRuns.add(allocation.runId);
    for (const resource of resources) this.#usedResources.add(resource);
    this.#active.set(allocation.runId, immutableClone(allocation));
  }

  release(runIdCandidate: string): void {
    const runId = uuid.parse(runIdCandidate);
    if (!this.#active.delete(runId)) throw new IsolationResourceConflictError();
  }

  activeAllocations(): readonly IsolationResourceAllocation[] {
    return immutableClone([...this.#active.values()]);
  }
}

export type IsolatedBrowserSessionState =
  | "ACTIVE"
  | "FINALIZING"
  | "CLOSED"
  | "CRASHED"
  | "FAILED";

export interface IsolationPolicyViolation {
  readonly sequence: number;
  readonly occurredAt: string;
  readonly reason:
    | Exclude<BrowserRequestPolicyReason, "ALLOWED">
    | "POPUP_BLOCKED";
  readonly targetHost: string | null;
  readonly targetUrlSha256: string;
}

export interface IsolationSessionEvent {
  readonly sequence: number;
  readonly occurredAt: string;
  readonly type:
    | "SESSION_STARTED"
    | "POLICY_BLOCKED"
    | "POPUP_BLOCKED"
    | "DOWNLOAD_STARTED"
    | "DOWNLOAD_BLOCKED"
    | "FINALIZATION_STARTED"
    | "FINALIZATION_COMPLETED"
    | "PAGE_CRASHED"
    | "BROWSER_DISCONNECTED"
    | "SESSION_ABORTED"
    | "RESOURCES_RELEASED";
  readonly reason?: string;
}

export interface IsolationArtifactScope {
  readonly workspaceId: string;
  readonly runId: string;
  readonly page: Page;
  readonly downloadDirectory: string;
  readonly events: readonly IsolationSessionEvent[];
  readonly violations: readonly IsolationPolicyViolation[];
}

export interface IsolationSessionDiagnostics extends IsolationResourceAllocation {
  readonly state: IsolatedBrowserSessionState;
  readonly browserConnected: boolean;
  readonly temporaryRootExists: boolean;
  readonly downloadDirectory: string;
}

export interface IsolatedBrowserSession {
  readonly workspaceId: string;
  readonly runId: string;
  readonly page: Page;
  readonly state: IsolatedBrowserSessionState;
  readonly events: readonly IsolationSessionEvent[];
  readonly violations: readonly IsolationPolicyViolation[];
  finalizeArtifacts<T>(
    finalizer: (scope: IsolationArtifactScope) => Promise<T>,
  ): Promise<T>;
  abort(reason: string): Promise<void>;
  waitForTermination(): Promise<void>;
  diagnostics(): Promise<IsolationSessionDiagnostics>;
}

export class BrowserSessionUnavailableError extends Error {
  readonly code = "BROWSER_SESSION_UNAVAILABLE";

  constructor(state: IsolatedBrowserSessionState) {
    super(`The isolated browser session is not active (${state}).`);
    this.name = "BrowserSessionUnavailableError";
  }
}

interface BrowserIsolationRuntimeOptions {
  readonly launchArgs?: readonly string[];
  readonly temporaryBase?: string;
  readonly now?: () => string;
  readonly resourceId?: () => string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeTarget(url: string): {
  readonly host: string | null;
  readonly hash: string;
} {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || null, hash: sha256(url) };
  } catch {
    return { host: null, hash: sha256(url) };
  }
}

function assertOwnedTemporaryRoot(root: string, base: string): void {
  const relative = path.relative(path.resolve(base), path.resolve(root));
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative) ||
    !path.basename(root).startsWith("pactwire-run-")
  ) {
    throw new Error("Refusing to clean a browser path outside its owned root");
  }
}

async function installClipboardPolicy(
  context: BrowserContext,
  policy: "BLOCK" | "ISOLATED",
): Promise<void> {
  await context.addInitScript(
    ({ clipboardPolicy }) => {
      let isolatedValue = "";
      const blocked = () =>
        new DOMException("Clipboard access is not allowed for this run.", "NotAllowedError");
      const clipboard = Object.freeze({
        readText() {
          return clipboardPolicy === "BLOCK"
            ? Promise.reject(blocked())
            : Promise.resolve(isolatedValue);
        },
        writeText(value: string) {
          if (clipboardPolicy === "BLOCK") return Promise.reject(blocked());
          isolatedValue = String(value);
          return Promise.resolve();
        },
        read() {
          return Promise.reject(blocked());
        },
        write() {
          return Promise.reject(blocked());
        },
      });
      Reflect.defineProperty(Navigator.prototype, "clipboard", {
        configurable: false,
        enumerable: true,
        get: () => clipboard,
      });
    },
    { clipboardPolicy: policy },
  );
}

class ManagedBrowserSession implements IsolatedBrowserSession {
  readonly #allocation: IsolationResourceAllocation;
  readonly #browser: Browser;
  readonly #context: BrowserContext;
  readonly #config: IsolatedBrowserSessionConfig;
  readonly #downloadDirectory: string;
  readonly #events: IsolationSessionEvent[] = [];
  readonly #now: () => string;
  readonly #release: () => void;
  readonly #temporaryBase: string;
  readonly #temporaryRoot: string;
  readonly #violations: IsolationPolicyViolation[] = [];
  #cleanupPromise: Promise<void> | undefined;
  #closingIntentionally = false;
  #resolveTermination: (() => void) | undefined;
  readonly #termination: Promise<void>;
  #state: IsolatedBrowserSessionState = "ACTIVE";

  readonly page: Page;

  constructor(input: {
    readonly allocation: IsolationResourceAllocation;
    readonly browser: Browser;
    readonly config: IsolatedBrowserSessionConfig;
    readonly context: BrowserContext;
    readonly downloadDirectory: string;
    readonly now: () => string;
    readonly page: Page;
    readonly release: () => void;
    readonly temporaryBase: string;
    readonly temporaryRoot: string;
  }) {
    this.#allocation = input.allocation;
    this.#browser = input.browser;
    this.#config = input.config;
    this.#context = input.context;
    this.#downloadDirectory = input.downloadDirectory;
    this.#now = input.now;
    this.page = input.page;
    this.#release = input.release;
    this.#temporaryBase = input.temporaryBase;
    this.#temporaryRoot = input.temporaryRoot;
    this.#termination = new Promise((resolve) => {
      this.#resolveTermination = resolve;
    });
    this.#record("SESSION_STARTED");
  }

  get workspaceId(): string {
    return this.#allocation.workspaceId;
  }

  get runId(): string {
    return this.#allocation.runId;
  }

  get state(): IsolatedBrowserSessionState {
    return this.#state;
  }

  get events(): readonly IsolationSessionEvent[] {
    return immutableClone(this.#events);
  }

  get violations(): readonly IsolationPolicyViolation[] {
    return immutableClone(this.#violations);
  }

  #record(type: IsolationSessionEvent["type"], reason?: string): void {
    this.#events.push({
      sequence: this.#events.length + 1,
      occurredAt: new Date(this.#now()).toISOString(),
      type,
      ...(reason ? { reason } : {}),
    });
  }

  recordViolation(
    reason: IsolationPolicyViolation["reason"],
    url: string,
  ): void {
    const target = safeTarget(url);
    this.#violations.push({
      sequence: this.#violations.length + 1,
      occurredAt: new Date(this.#now()).toISOString(),
      reason,
      targetHost: target.host,
      targetUrlSha256: target.hash,
    });
    this.#record(reason === "POPUP_BLOCKED" ? "POPUP_BLOCKED" : "POLICY_BLOCKED", reason);
  }

  attachPage(page: Page): void {
    page.on("crash", () => {
      if (this.#closingIntentionally || this.#cleanupPromise) return;
      this.#record("PAGE_CRASHED", "PAGE_CRASHED");
      void this.#terminate("CRASHED", "PAGE_CRASHED");
    });
    page.on("download", () => {
      if (this.#config.downloadPolicy === "ALLOW_ISOLATED") {
        this.#record("DOWNLOAD_STARTED");
      } else {
        this.#record("DOWNLOAD_BLOCKED", "DOWNLOAD_POLICY_BLOCKED");
      }
    });
  }

  handleBrowserDisconnected(): void {
    if (this.#closingIntentionally || this.#cleanupPromise) return;
    this.#record("BROWSER_DISCONNECTED", "BROWSER_DISCONNECTED");
    void this.#terminate("CRASHED", "BROWSER_DISCONNECTED");
  }

  async #terminate(
    terminalState: "CLOSED" | "CRASHED" | "FAILED",
    reason: string,
  ): Promise<void> {
    if (this.#cleanupPromise) return this.#cleanupPromise;
    this.#state = terminalState;
    this.#closingIntentionally = true;
    if (terminalState === "FAILED") this.#record("SESSION_ABORTED", reason);
    this.#cleanupPromise = (async () => {
      try {
        await this.#context.close().catch(() => undefined);
        if (this.#browser.isConnected()) {
          await this.#browser.close().catch(() => undefined);
        }
        assertOwnedTemporaryRoot(this.#temporaryRoot, this.#temporaryBase);
        await rm(this.#temporaryRoot, { force: true, recursive: true });
      } finally {
        this.#release();
        this.#record("RESOURCES_RELEASED", reason);
        this.#resolveTermination?.();
      }
    })();
    return this.#cleanupPromise;
  }

  async finalizeArtifacts<T>(
    finalizer: (scope: IsolationArtifactScope) => Promise<T>,
  ): Promise<T> {
    if (this.#state !== "ACTIVE") {
      throw new BrowserSessionUnavailableError(this.#state);
    }
    this.#state = "FINALIZING";
    this.#record("FINALIZATION_STARTED");
    try {
      const result = await finalizer({
        workspaceId: this.workspaceId,
        runId: this.runId,
        page: this.page,
        downloadDirectory: this.#downloadDirectory,
        events: this.events,
        violations: this.violations,
      });
      if (this.#state !== "FINALIZING" || this.#cleanupPromise) {
        await this.waitForTermination();
        throw new BrowserSessionUnavailableError(this.#state);
      }
      this.#record("FINALIZATION_COMPLETED");
      await this.#terminate("CLOSED", "ARTIFACTS_FINALIZED");
      return result;
    } catch (error) {
      if (!this.#cleanupPromise) {
        await this.#terminate("FAILED", "ARTIFACT_FINALIZATION_FAILED");
      }
      throw error;
    }
  }

  abort(reason: string): Promise<void> {
    if (["CLOSED", "CRASHED", "FAILED"].includes(this.#state)) {
      return this.waitForTermination();
    }
    return this.#terminate("FAILED", reason);
  }

  waitForTermination(): Promise<void> {
    return this.#termination;
  }

  diagnostics(): Promise<IsolationSessionDiagnostics> {
    return Promise.resolve(
      immutableClone({
        ...this.#allocation,
        state: this.#state,
        browserConnected: this.#browser.isConnected(),
        temporaryRootExists: existsSync(this.#temporaryRoot),
        downloadDirectory: this.#downloadDirectory,
      }),
    );
  }
}

async function enforceRoutePolicy(
  session: ManagedBrowserSession,
  config: IsolatedBrowserSessionConfig,
  route: Route,
): Promise<void> {
  const request = route.request();
  const decision = evaluateBrowserRequestPolicy(config, {
    url: request.url(),
    navigation: request.isNavigationRequest(),
  });
  if (!decision.allowed) {
    session.recordViolation(
      decision.reason as Exclude<BrowserRequestPolicyReason, "ALLOWED">,
      request.url(),
    );
    await route.abort("blockedbyclient").catch(() => undefined);
    return;
  }
  await route.fallback().catch(() => undefined);
}

async function enforceWebSocketPolicy(
  session: ManagedBrowserSession,
  config: IsolatedBrowserSessionConfig,
  route: WebSocketRoute,
): Promise<void> {
  const decision = evaluateBrowserRequestPolicy(config, {
    url: route.url(),
    navigation: false,
  });
  if (!decision.allowed) {
    session.recordViolation(
      decision.reason as Exclude<BrowserRequestPolicyReason, "ALLOWED">,
      route.url(),
    );
    await route
      .close({ code: 1008, reason: "Blocked by the isolated run policy" })
      .catch(() => undefined);
    return;
  }
  route.connectToServer();
}

export class BrowserIsolationManager {
  readonly #launchArgs: readonly string[];
  readonly #now: () => string;
  readonly #registry = new IsolationResourceRegistry();
  readonly #resourceId: () => string;
  readonly #sessions = new Map<string, ManagedBrowserSession>();
  readonly #temporaryBase: string;

  constructor(options: BrowserIsolationRuntimeOptions = {}) {
    this.#launchArgs = Object.freeze([...(options.launchArgs ?? [])]);
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#resourceId = options.resourceId ?? randomUUID;
    this.#temporaryBase = path.resolve(options.temporaryBase ?? tmpdir());
  }

  get activeSessionCount(): number {
    return this.#sessions.size;
  }

  async startSession(candidate: unknown): Promise<IsolatedBrowserSession> {
    const config = isolatedBrowserSessionConfigSchema.parse(candidate);
    const allocation = isolationResourceAllocationSchema.parse({
      workspaceId: config.workspaceId,
      runId: config.runId,
      browserId: this.#resourceId(),
      contextId: this.#resourceId(),
      clipboardId: this.#resourceId(),
      downloadScopeId: this.#resourceId(),
    });
    this.#registry.register(allocation);
    let temporaryRoot: string | undefined;
    let browser: Browser | undefined;
    try {
      temporaryRoot = await mkdtemp(
        path.join(this.#temporaryBase, "pactwire-run-"),
      );
      const downloadDirectory = path.join(
        temporaryRoot,
        `downloads-${config.runId}`,
      );
      await mkdir(downloadDirectory, { recursive: false });
      browser = await chromium.launch({
        args: [...this.#launchArgs],
        downloadsPath: downloadDirectory,
        headless: true,
      });
      const context = await browser.newContext({
        acceptDownloads: config.downloadPolicy === "ALLOW_ISOLATED",
        permissions: [],
        serviceWorkers: "block",
        viewport: config.viewport,
      });
      await installClipboardPolicy(context, config.clipboardPolicy);
      const page = await context.newPage();
      const session = new ManagedBrowserSession({
        allocation,
        browser,
        config,
        context,
        downloadDirectory,
        now: this.#now,
        page,
        release: () => {
          if (this.#sessions.delete(config.runId)) {
            this.#registry.release(config.runId);
          }
        },
        temporaryBase: this.#temporaryBase,
        temporaryRoot,
      });
      this.#sessions.set(config.runId, session);
      session.attachPage(page);
      browser.on("disconnected", () => session.handleBrowserDisconnected());
      context.on("page", (openedPage) => {
        if (openedPage === page) return;
        if (config.popupPolicy === "BLOCK_ALL") {
          session.recordViolation("POPUP_BLOCKED", openedPage.url());
          void openedPage.close().catch(() => undefined);
          return;
        }
        session.attachPage(openedPage);
      });
      await context.route("**/*", (route) =>
        enforceRoutePolicy(session, config, route),
      );
      await context.routeWebSocket(/.*/u, (route) =>
        enforceWebSocketPolicy(session, config, route),
      );
      return session;
    } catch (error) {
      this.#sessions.delete(config.runId);
      await browser?.close().catch(() => undefined);
      if (temporaryRoot) {
        assertOwnedTemporaryRoot(temporaryRoot, this.#temporaryBase);
        await rm(temporaryRoot, { force: true, recursive: true });
      }
      if (
        this.#registry
          .activeAllocations()
          .some((active) => active.runId === config.runId)
      ) {
        this.#registry.release(config.runId);
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.#sessions.values()].map((session) =>
        session.abort("MANAGER_SHUTDOWN"),
      ),
    );
  }
}

export const isolationTraceSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    source: z.literal("PACTWIRE_ISOLATED_BROWSER"),
    capturedAt: timestamp,
    sessions: z.array(
      z
        .object({
          workspaceId: uuid,
          runId: uuid,
          terminalState: z.enum(["CLOSED", "CRASHED", "FAILED"]),
          events: z.array(
            z
              .object({
                sequence: z.number().int().positive(),
                occurredAt: timestamp,
                type: z.string().min(1),
                reason: z.string().min(1).optional(),
              })
              .strict(),
          ),
          violations: z.array(
            z
              .object({
                sequence: z.number().int().positive(),
                occurredAt: timestamp,
                reason: z.string().min(1),
                targetHost: z.string().nullable(),
                targetUrlSha256: z.string().regex(/^[a-f0-9]{64}$/u),
              })
              .strict(),
          ),
          assertions: z.record(z.string(), z.boolean()),
        })
        .strict(),
    ),
  })
  .strict();
