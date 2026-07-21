import { describe, expect, it, vi } from "vitest";
import {
  COMPUTER_USE_FIXED_INSTRUCTIONS,
  ComputerUseResponseError,
  FetchComputerUseResponsesTransport,
  buildComputerUseRequest,
  computerUseRunConfigSchema,
  evaluateComputerActionPolicy,
  parseComputerUseResponse,
} from "../../apps/runner/src/computer-use";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function policy() {
  return computerUseRunConfigSchema.parse({
    workspaceId,
    runId,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    authorizedGoal:
      "Submit the prefilled fictional response and stop after the controlled receipt appears.",
    startUrl: "https://classroom.pactwire.test/student",
    allowedOrigins: ["https://classroom.pactwire.test"],
    allowedComputerActions: [
      "screenshot",
      "click",
      "type",
      "keypress",
      "scroll",
      "wait",
      "move",
    ],
    trustedControls: [
      {
        dataTestId: "student-response",
        authorizationAction: "SUBMIT",
        disposition: "ALLOW",
      },
      {
        dataTestId: "submit-assignment",
        authorizationAction: "SUBMIT",
        disposition: "ALLOW",
      },
      {
        dataTestId: "risky-action",
        authorizationAction: "MESSAGE",
        disposition: "HUMAN_REQUIRED",
      },
      {
        dataTestId: "delete-account",
        authorizationAction: "DELETE",
        disposition: "PROHIBIT",
      },
    ],
    maxTurns: 8,
    maxActions: 32,
    maxTransportRetries: 1,
    requestTimeoutMs: 30_000,
  });
}

const allowedTarget = {
  origin: "https://classroom.pactwire.test",
  dataTestIds: ["submit-assignment"],
  tagName: "button",
  inputType: "submit",
  href: null,
  formAction: "https://classroom.pactwire.test/student",
};

describe("RUN-03 policy-bounded computer use", () => {
  it("accepts only a frozen explicit GPT-5.6 Sol policy", () => {
    const parsed = policy();
    expect(parsed.model).toBe("gpt-5.6-sol");
    expect(parsed.allowedOrigins).toEqual([
      "https://classroom.pactwire.test",
    ]);
    expect(parsed.trustedControls).toHaveLength(4);
    expect(() =>
      computerUseRunConfigSchema.parse({
        ...parsed,
        allowedOrigins: ["https://*.pactwire.test"],
      }),
    ).toThrow();
    expect(() =>
      computerUseRunConfigSchema.parse({
        ...parsed,
        model: "gpt-5.6",
      }),
    ).toThrow();
    expect(() =>
      computerUseRunConfigSchema.parse({
        ...parsed,
        trustedControls: [
          ...parsed.trustedControls,
          {
            dataTestId: "submit-assignment",
            authorizationAction: "SUBMIT",
            disposition: "ALLOW",
          },
        ],
      }),
    ).toThrow(/unique/iu);
  });

  it("allows a reviewed control but stops unknown, risky, prohibited, and external targets beneath the model", () => {
    expect(
      evaluateComputerActionPolicy(policy(), {
        action: { type: "click", x: 850, y: 610, button: "left" },
        target: allowedTarget,
        secretValues: [],
      }),
    ).toMatchObject({
      allowed: true,
      outcome: "ALLOW",
      reason: "TRUSTED_CONTROL",
      controlId: "submit-assignment",
      authorizationAction: "SUBMIT",
    });

    expect(
      evaluateComputerActionPolicy(policy(), {
        action: { type: "click", x: 5, y: 5, button: "left" },
        target: { ...allowedTarget, dataTestIds: ["unreviewed-control"] },
        secretValues: [],
      }),
    ).toMatchObject({
      allowed: false,
      outcome: "BLOCK",
      reason: "UNTRUSTED_CONTROL",
    });

    expect(
      evaluateComputerActionPolicy(policy(), {
        action: { type: "click", x: 5, y: 5, button: "left" },
        target: { ...allowedTarget, dataTestIds: ["risky-action"] },
        secretValues: [],
      }),
    ).toMatchObject({
      allowed: false,
      outcome: "HUMAN_REQUIRED",
      reason: "HUMAN_REVIEW_REQUIRED",
      authorizationAction: "MESSAGE",
    });

    expect(
      evaluateComputerActionPolicy(policy(), {
        action: { type: "click", x: 5, y: 5, button: "left" },
        target: { ...allowedTarget, dataTestIds: ["delete-account"] },
        secretValues: [],
      }),
    ).toMatchObject({
      allowed: false,
      outcome: "BLOCK",
      reason: "PROHIBITED_ACTION",
      authorizationAction: "DELETE",
    });

    expect(
      evaluateComputerActionPolicy(policy(), {
        action: { type: "click", x: 5, y: 5, button: "left" },
        target: {
          ...allowedTarget,
          href: "https://outside.invalid/collect",
        },
        secretValues: [],
      }),
    ).toMatchObject({
      allowed: false,
      outcome: "BLOCK",
      reason: "DESTINATION_OUTSIDE_SCOPE",
    });

    expect(
      evaluateComputerActionPolicy(policy(), {
        action: {
          type: "click",
          x: 850,
          y: 610,
          button: "left",
          keys: ["CTRL"],
        },
        target: allowedTarget,
        secretValues: [],
      }),
    ).toMatchObject({
      allowed: false,
      outcome: "BLOCK",
      reason: "MODIFIER_KEYS_NOT_ALLOWED",
    });
  });

  it("blocks configured secret representations without copying them into the decision", () => {
    const secret = "FICTIONAL-RUN03-SECRET-9wZ!";
    const decision = evaluateComputerActionPolicy(policy(), {
      action: {
        type: "type",
        text: `Bearer ${Buffer.from(secret).toString("base64")}`,
      },
      target: { ...allowedTarget, dataTestIds: ["student-response"] },
      secretValues: [secret],
    });
    expect(decision).toMatchObject({
      allowed: false,
      outcome: "BLOCK",
      reason: "SECRET_REPRESENTATION_BLOCKED",
    });
    expect(JSON.stringify(decision)).not.toContain(secret);
    expect(JSON.stringify(decision)).not.toContain(
      Buffer.from(secret).toString("base64"),
    );
  });

  it("builds the official batched computer-call exchange and repeats fixed instructions on continuation", () => {
    const initial = buildComputerUseRequest({ config: policy() });
    expect(initial).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "medium" },
      tools: [{ type: "computer" }],
      instructions: COMPUTER_USE_FIXED_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: policy().authorizedGoal,
            },
          ],
        },
      ],
    });
    expect(initial).not.toHaveProperty("previous_response_id");

    const next = buildComputerUseRequest({
      config: policy(),
      previousResponseId: "resp_fixture_01",
      output: {
        callId: "call_fixture_01",
        screenshotDataUrl: "data:image/png;base64,ZmFrZS1wbmc=",
      },
    });
    expect(next).toMatchObject({
      model: "gpt-5.6-sol",
      instructions: COMPUTER_USE_FIXED_INSTRUCTIONS,
      previous_response_id: "resp_fixture_01",
      input: [
        {
          type: "computer_call_output",
          call_id: "call_fixture_01",
          output: {
            type: "computer_screenshot",
            image_url: "data:image/png;base64,ZmFrZS1wbmc=",
            detail: "original",
          },
        },
      ],
    });
  });

  it("parses official batched actions and rejects legacy or unknown action shapes", () => {
    expect(
      parseComputerUseResponse({
        id: "resp_fixture_01",
        status: "completed",
        output: [
          {
            type: "computer_call",
            call_id: "call_fixture_01",
            actions: [
              { type: "move", x: 800, y: 500 },
              {
                type: "click",
                x: 800,
                y: 500,
                button: "left",
                keys: null,
              },
              { type: "wait" },
            ],
          },
        ],
      }),
    ).toEqual({
      responseId: "resp_fixture_01",
      status: "completed",
      calls: [
        {
          callId: "call_fixture_01",
          pendingSafetyCheckCount: 0,
          actions: [
            { type: "move", x: 800, y: 500 },
            {
              type: "click",
              x: 800,
              y: 500,
              button: "left",
              keys: null,
            },
            { type: "wait" },
          ],
        },
      ],
      refused: false,
    });
    expect(() =>
      parseComputerUseResponse({
        id: "resp_legacy",
        status: "completed",
        output: [
          {
            type: "computer_call",
            call_id: "call_legacy",
            action: { type: "click", x: 1, y: 1 },
          },
        ],
      }),
    ).toThrow(ComputerUseResponseError);
    expect(() =>
      parseComputerUseResponse({
        id: "resp_unknown",
        status: "completed",
        output: [
          {
            type: "computer_call",
            call_id: "call_unknown",
            actions: [{ type: "open_terminal" }],
          },
        ],
      }),
    ).toThrow(ComputerUseResponseError);
  });

  it("uses only the Responses endpoint and returns bounded HTTP errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "raw provider detail" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = new FetchComputerUseResponsesTransport({
      apiKey: "sk-fixture-never-log",
      fetcher,
      timeoutMs: 1_000,
    });
    await expect(transport.create(buildComputerUseRequest({ config: policy() })))
      .rejects.toMatchObject({
        code: "OPENAI_RESPONSES_HTTP_ERROR",
        status: 429,
        message: "The computer-use model request failed (HTTP 429).",
      });
    expect(fetcher).toHaveBeenCalledOnce();
    const call = fetcher.mock.calls[0];
    expect(call?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(call?.[1]?.method).toBe("POST");
    expect(new Headers(call?.[1]?.headers).get("authorization")).toBe(
      "Bearer sk-fixture-never-log",
    );
  });
});
