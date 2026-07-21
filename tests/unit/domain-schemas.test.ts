import { describe, expect, it } from "vitest";
import {
  agreementVersionSchema,
  auditEventSchema,
  authorizationSchema,
  canaryMatchSchema,
  canarySchema,
  destinationRecordSchema,
  evidenceReceiptSchema,
  findingSchema,
  humanDecisionSchema,
  journeyVersionSchema,
  observationSchema,
  personaSchema,
  requirementVersionSchema,
  runSchema,
  softwareRecordSchema,
  userRoleSchema,
  workspaceSchema,
} from "../../packages/core/src/domain";
import {
  domainIds,
  humanActor,
  makeQueuedRun,
  modelActor,
} from "../helpers/domain-fixtures";

const createdAt = "2026-07-19T18:30:00.000Z";
const hash = "a".repeat(64);

describe("core domain schemas", () => {
  it("accepts one valid fictional record for every core entity", () => {
    const records = [
      [workspaceSchema, { id: domainIds.workspace, name: "Fictional District", createdAt, createdBy: humanActor }],
      [
        userRoleSchema,
        {
          id: "10101010-1010-4010-8010-101010101010",
          workspaceId: domainIds.workspace,
          userId: "fictional-reviewer",
          role: "REVIEWER",
          assignedAt: createdAt,
          assignedBy: humanActor,
        },
      ],
      [
        softwareRecordSchema,
        {
          id: domainIds.software,
          workspaceId: domainIds.workspace,
          name: "Fixture LMS",
          vendorName: "Fictional Vendor",
          authorizedTenantUrl: "https://fixture.pactwire.invalid",
          districtOwner: "Fictional Curriculum Office",
          knownVersion: "fixture-v1",
          approvalState: "UNKNOWN",
          approvalOrigin: {
            id: "20202020-2020-4020-8020-202020202020",
            workspaceId: domainIds.workspace,
            softwareId: domainIds.software,
            state: "UNKNOWN",
            setBy: {
              kind: "HUMAN",
              actorId: "fictional-officer",
              displayName: "Morgan Vale (Fictional)",
            },
            reason: "Fictional district record has no approval decision.",
            recordedBy: humanActor,
            recordedAt: createdAt,
          },
          createdAt,
          createdBy: humanActor,
        },
      ],
      [
        authorizationSchema,
        {
          id: domainIds.authorization,
          workspaceId: domainIds.workspace,
          softwareId: domainIds.software,
          version: 1,
          status: "ACTIVE",
          validFrom: createdAt,
          reviewAt: "2026-07-20T12:00:00.000Z",
          expiresAt: "2026-07-20T18:30:00.000Z",
          authorityBasis: "District-owned fictional training tenant.",
          allowedBaseUrl: "https://fixture.pactwire.invalid/classroom",
          allowedDomains: ["fixture.pactwire.invalid"],
          allowedActions: ["NAVIGATE"],
          prohibitedActions: ["DELETE"],
          redirectPolicy: "ALLOW_LISTED_ONLY",
          popupPolicy: "BLOCK_ALL",
          attestation: {
            authorityConfirmed: true,
            syntheticAccountsOnlyConfirmed: true,
            statement: "The fictional district controls this training tenant.",
          },
          attestedBy: humanActor,
          attestedAt: createdAt,
        },
      ],
      [
        agreementVersionSchema,
        {
          id: domainIds.agreement,
          workspaceId: domainIds.workspace,
          softwareId: domainIds.software,
          version: 1,
          sourceObjectKey: `agreements/sha256/${hash}.pdf`,
          sourceSha256: hash,
          sourceMimeType: "application/pdf",
          sourceFileName: "Fictional Agreement.pdf",
          sourceByteLength: 1,
          effectiveFrom: "2026-07-01",
          effectiveUntil: "2027-06-30",
          normalizedText: "Fixture",
          pageMap: [
            {
              pageNumber: 1,
              startOffset: 0,
              endOffset: 7,
              text: "Fixture",
              textSha256: hash,
            },
          ],
          createdAt,
          createdBy: humanActor,
        },
      ],
      [
        requirementVersionSchema,
        {
          id: domainIds.requirement,
          workspaceId: domainIds.workspace,
          agreementVersionId: domainIds.agreement,
          requirementKey: "recipient-rule",
          version: 1,
          modelRunId: "89898989-8989-4989-8989-898989898989",
          status: "PROPOSED",
          executable: false,
          plainLanguage: "Do not send the fictional email to an unapproved recipient.",
          details: {
            plainLanguage:
              "Do not send the fictional email to an unapproved recipient.",
            sourceText: "Fictional source text",
            pageNumber: 1,
            section: "Recipients",
            dataField: "Fictional student email",
            action: "Send",
            recipientRestriction: "District-authorized recipient only",
            purposeRestriction: null,
            ambiguity: "CLEAR",
            ambiguityReason: null,
            suggestedObservableTest:
              "Submit a fictional email and record its request destinations.",
          },
          citation: {
            page: 1,
            startOffset: 10,
            endOffset: 20,
            quotedTextSha256: hash,
          },
          proposedBy: modelActor,
          createdAt,
        },
      ],
      [
        destinationRecordSchema,
        {
          id: "12121212-1212-4212-8212-121212121212",
          workspaceId: domainIds.workspace,
          hostname: "unknown.pactwire.invalid",
          ownership: "UNKNOWN",
          classification: "UNREVIEWED",
        },
      ],
      [
        personaSchema,
        {
          id: "13131313-1313-4313-8313-131313131313",
          workspaceId: domainIds.workspace,
          role: "STUDENT",
          fictional: true,
          displayName: "Fictional Student",
          email: "student@pactwire.invalid",
          fields: { grade: "7" },
          fictionalConfirmation: {
            statementVersion: "fictional-only-v1",
            confirmedAt: createdAt,
            confirmedBy: humanActor,
          },
          scanResult: {
            scannerVersion: "likely-real-v1",
            outcome: "CLEAR",
            findings: [],
          },
          createdAt,
          createdBy: humanActor,
        },
      ],
      [
        journeyVersionSchema,
        {
          id: domainIds.journeyVersion,
          workspaceId: domainIds.workspace,
          softwareId: domainIds.software,
          agreementVersionId: domainIds.agreement,
          journeyId: domainIds.journey,
          version: 1,
          sourceVersionId: null,
          name: "Student submits fictional work",
          role: "STUDENT",
          goal: "Submit the unique fictional response.",
          startState: "Signed in to the fictional student workspace.",
          requirementVersionIds: [domainIds.requirement],
          authorizationId: domainIds.authorization,
          personaId: "13131313-1313-4313-8313-131313131313",
          testFields: [
            {
              fieldId: "student-email",
              sourceField: "email",
              requirementVersionId: domainIds.requirement,
            },
          ],
          allowedActions: ["SUBMIT"],
          prohibitedActions: ["MESSAGE"],
          checkpoints: [
            {
              checkpointId: "network-submit",
              required: true,
              description: "Capture the fictional submission request.",
              observationSource: "NETWORK",
              requiredVisibility: true,
              requirementVersionIds: [domainIds.requirement],
              testFieldIds: ["student-email"],
            },
          ],
          steps: [
            {
              stepId: "submit-work",
              instruction: "Submit the fictional work.",
              action: "SUBMIT",
            },
          ],
          createdAt,
          createdBy: humanActor,
        },
      ],
      [runSchema, makeQueuedRun()],
      [
        canarySchema,
        {
          id: "14141414-1414-4414-8414-141414141414",
          workspaceId: domainIds.workspace,
          runId: domainIds.run,
          personaId: "13131313-1313-4313-8313-131313131313",
          sourceField: "email",
          value: `pw-${"a".repeat(32)}@canary.pactwire.invalid`,
          generatedAt: createdAt,
        },
      ],
      [
        observationSchema,
        {
          id: domainIds.observation,
          workspaceId: domainIds.workspace,
          runId: domainIds.run,
          source: "NETWORK",
          recorderVersion: "recorder-v1",
          sequence: 1,
          observedAt: createdAt,
          payloadHash: hash,
          facts: { hostname: "fixture.pactwire.invalid" },
        },
      ],
      [
        canaryMatchSchema,
        {
          id: "15151515-1515-4515-8515-151515151515",
          workspaceId: domainIds.workspace,
          runId: domainIds.run,
          canaryId: "14141414-1414-4414-8414-141414141414",
          observationId: domainIds.observation,
          transform: "EXACT",
          matchedValueHash: hash,
          createdAt,
        },
      ],
      [
        findingSchema,
        {
          id: domainIds.finding,
          workspaceId: domainIds.workspace,
          runId: domainIds.run,
          requirementVersionId: domainIds.requirement,
          state: "NO_CONFLICT_OBSERVED_IN_NAMED_TESTS",
          checkpoints: [
            {
              checkpointId: "network-submit",
              required: true,
              exercised: true,
              visible: true,
            },
          ],
          observationIds: [],
          limitations: ["Only the named fictional submission was exercised."],
          createdAt,
        },
      ],
      [
        evidenceReceiptSchema,
        {
          id: domainIds.receipt,
          workspaceId: domainIds.workspace,
          runId: domainIds.run,
          findingId: domainIds.finding,
          manifestHash: hash,
          contentHash: hash,
          artifactHashes: { "observation.json": hash },
          createdAt,
        },
      ],
      [
        humanDecisionSchema,
        {
          id: "16161616-1616-4616-8616-161616161616",
          workspaceId: domainIds.workspace,
          softwareId: domainIds.software,
          runId: domainIds.run,
          outcome: "KEEP_HOLD",
          rationale: "The fictional conflict needs review.",
          namedScopeAcknowledged: true,
          actor: humanActor,
          signedAt: createdAt,
        },
      ],
      [
        auditEventSchema,
        {
          eventId: "17171717-1717-4717-8717-171717171717",
          eventType: "AUDIT_RECORDED",
          workspaceId: domainIds.workspace,
          subjectType: "software",
          subjectId: domainIds.software,
          action: "created",
          actor: humanActor,
          occurredAt: createdAt,
          details: {},
        },
      ],
    ] as const;

    for (const [schema, record] of records) {
      expect(schema.safeParse(record).success).toBe(true);
    }
  });

  it("allows a model proposal but not a model-confirmed executable rule", () => {
    const result = requirementVersionSchema.safeParse({
      id: domainIds.requirement,
      workspaceId: domainIds.workspace,
      agreementVersionId: domainIds.agreement,
      requirementKey: "recipient-rule",
      version: 1,
      status: "CONFIRMED",
      executable: true,
      predicate: { operator: "equals" },
      plainLanguage: "Synthetic recipient restriction.",
      citation: {
        startOffset: 1,
        endOffset: 2,
        quotedTextSha256: hash,
      },
      confirmedBy: modelActor,
      confirmedAt: createdAt,
      createdAt,
    });

    expect(result.success).toBe(false);
  });

  it("rejects real-looking persona email domains and empty required checkpoints", () => {
    expect(
      personaSchema.safeParse({
        id: "13131313-1313-4313-8313-131313131313",
        workspaceId: domainIds.workspace,
        role: "STUDENT",
        fictional: true,
        displayName: "Fictional Student",
        email: "student@example.com",
        fields: {},
        createdAt,
        createdBy: humanActor,
      }).success,
    ).toBe(false);
    expect(
      journeyVersionSchema.safeParse({
        id: domainIds.journeyVersion,
        workspaceId: domainIds.workspace,
        softwareId: domainIds.software,
        agreementVersionId: domainIds.agreement,
        journeyId: domainIds.journey,
        version: 1,
        sourceVersionId: null,
        name: "Empty journey",
        role: "STUDENT",
        goal: "Try the fictional journey.",
        startState: "Signed in to the fictional workspace.",
        requirementVersionIds: [domainIds.requirement],
        authorizationId: domainIds.authorization,
        personaId: "13131313-1313-4313-8313-131313131313",
        testFields: [
          {
            fieldId: "student-email",
            sourceField: "email",
            requirementVersionId: domainIds.requirement,
          },
        ],
        allowedActions: ["NAVIGATE"],
        prohibitedActions: [],
        checkpoints: [
          {
            checkpointId: "optional",
            required: false,
            description: "Optional",
            observationSource: "SCREENSHOT",
            requiredVisibility: false,
            requirementVersionIds: [domainIds.requirement],
            testFieldIds: ["student-email"],
          },
        ],
        steps: [
          {
            stepId: "navigate",
            instruction: "Open the fictional workspace.",
            action: "NAVIGATE",
          },
        ],
        createdAt,
        createdBy: humanActor,
      }).success,
    ).toBe(false);
  });

  it("rejects human-confirmation metadata on an UNKNOWN destination", () => {
    const result = destinationRecordSchema.safeParse({
      id: "65656565-6565-4565-8565-656565656565",
      workspaceId: domainIds.workspace,
      hostname: "unknown.pactwire.invalid",
      ownership: "UNKNOWN",
      classification: "UNREVIEWED",
      entityName: "Unconfirmed Fictional Entity",
      confirmedBy: humanActor,
      confirmedAt: createdAt,
    });

    expect(result.success).toBe(false);
  });

  it("rejects ambiguous journey checkpoints and action scope", () => {
    const result = journeyVersionSchema.safeParse({
      id: domainIds.journeyVersion,
      workspaceId: domainIds.workspace,
      softwareId: domainIds.software,
      agreementVersionId: domainIds.agreement,
      journeyId: domainIds.journey,
      version: 1,
      sourceVersionId: null,
      name: "Ambiguous fictional journey",
      role: "STUDENT",
      goal: "Submit the fictional work.",
      startState: "Signed in to the fictional student workspace.",
      requirementVersionIds: [domainIds.requirement],
      authorizationId: domainIds.authorization,
      personaId: "13131313-1313-4313-8313-131313131313",
      testFields: [
        {
          fieldId: "student-email",
          sourceField: "email",
          requirementVersionId: domainIds.requirement,
        },
      ],
      allowedActions: ["SUBMIT"],
      prohibitedActions: ["SUBMIT"],
      checkpoints: [
        {
          checkpointId: "network-submit",
          required: true,
          description: "First definition",
          observationSource: "NETWORK",
          requiredVisibility: true,
          requirementVersionIds: [domainIds.requirement],
          testFieldIds: ["student-email"],
        },
        {
          checkpointId: "network-submit",
          required: true,
          description: "Contradictory duplicate definition",
          observationSource: "NETWORK",
          requiredVisibility: true,
          requirementVersionIds: [domainIds.requirement],
          testFieldIds: ["student-email"],
        },
      ],
      steps: [
        {
          stepId: "submit",
          instruction: "Submit the fictional work.",
          action: "SUBMIT",
        },
      ],
      createdAt,
      createdBy: humanActor,
    });

    expect(result.success).toBe(false);
  });
});
