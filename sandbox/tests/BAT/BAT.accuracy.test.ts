import { describe, expect, test } from "@jest/globals";
import { adaptJkmEligibilityResponse } from "../../../src/adapters/jkmEligibilityAdapter.ts";
import { evaluateProgramEligibility } from "../../../src/utils/eligibility/eligibilityEngine.ts";
import type { EligibilityFacts, EligibilityRule, EligibilityStatus } from "../../../src/types/eligibility.ts";
import type { EligibilityThresholds } from "../../../src/utils/eligibility/eligibilityThresholds.ts";
import { batApiResponse } from "../../fixtures/batApiResponse.ts";

function createEligibleBatFacts(
    overrides: Partial<EligibilityFacts> = {}
): EligibilityFacts {
  return {
    age: null,
    ageByBirthYear: null,
    citizenship: "Malaysian",
    residenceCountry: "Malaysia",
    state: null,
    maritalStatus: null,

    monthlyPersonalIncome: null,
    monthlyHouseholdIncome: 2000,
    householdSize: 2,
    perCapitaHouseholdIncome: 700,

    numberOfDependents: null,
    numberOfEligibleChildren: null,
    hasChildren: null,
    hasEligibleChildren: null,
    isFullTimeStudent: null,
    isFullTimeIptaIptsStudent: null,

    receivesJkmMonthlyAssistance: null,
    isJkmTargetGroup: true,

    isOku: null,
    okuRegistered: null,
    hasChronicIllness: null,
    isBedridden: null,
    requiresContinuousTreatment: null,
    continuousTreatmentMonths: null,

    residesInJkmInstitution: null,
    residesInExcludedCareCentre: null,
    residesInExcludedInstitution: null,
    livesWithFamilyOrCaregiver: null,
    dependsOnFamilyOrCaregiver: null,
    familyOrCaregiverIncomeExceedsPgk: null,

    applicantIsPatient: null,
    applicantIsCaregiver: null,
    patientCitizenship: null,
    patientResidenceCountry: null,
    patientIsOku: null,
    patientHasChronicIllness: null,
    patientIsBedridden: null,
    patientRequiresContinuousTreatment: null,
    patientContinuousTreatmentMonths: null,
    hasCaregiver: null,
    caregiverCitizenship: null,
    caregiverProvidesIntensiveCare: null,

    hasMedicalOrJkmRecommendation: true,
    requestedAssistiveEquipment: null,
    estimatedEquipmentCost: 5000,
    hasHospitalReferral: null,

    socioeconomicAssessmentRequired: null,
    medicalAssessmentRequired: null,

    baAdditionalCircumstancesRequireReview: null,
    batRecommendationOrEquipmentRequiresReview: false,
    batSpecialConsiderationRequested: false,
    bptMedicalOrCaregiverReviewRequired: null,

    ...overrides,
  };
}

// Synthetic PGK values for testing only, not official JKM thresholds.
const testThresholds: EligibilityThresholds = {
  BAT_POOR_HOUSEHOLD_PGK: 2500,
  BAT_POOR_PER_CAPITA_PGK: 600,
};

function getBatRules(): EligibilityRule[] {
  return adaptJkmEligibilityResponse(
      structuredClone(batApiResponse),
      "BAT"
  );
}

function evaluate(
    facts: EligibilityFacts,
    thresholds: EligibilityThresholds = testThresholds
) {
  return evaluateProgramEligibility(
      "BAT",
      getBatRules(),
      facts,
      thresholds
  );
}

type BatEvaluationResult = ReturnType<typeof evaluate>;

function expectRule(
    result: BatEvaluationResult,
    ruleId: string,
    matched: boolean | null
): void {
  const rule = result.ruleResults.find(
      (item) => item.ruleId === ruleId
  );

  expect(rule).toBeDefined();
  expect(rule?.matched).toBe(matched);
}

function expectStatusAndRules(
    result: BatEvaluationResult,
    status: EligibilityStatus,
    matchedRuleIds: string[]
): void {
  expect(result.status).toBe(status);
  expect(result.matchedRuleIds).toEqual(matchedRuleIds);
}

function expectCondition(
    result: BatEvaluationResult,
    ruleId: string,
    field: keyof EligibilityFacts,
    passed: boolean | null
): void {
  const rule = result.ruleResults.find(
      (item) => item.ruleId === ruleId
  );

  expect(rule).toBeDefined();

  const conditions = [
    ...(rule?.matchedConditions ?? []),
    ...(rule?.unmetConditions ?? []),
    ...(rule?.missingInformation ?? []),
  ];

  const matchingConditions = conditions.filter(
      (condition) => condition.field === field
  );

  expect(matchingConditions.length).toBeGreaterThan(0);

  expect(
      matchingConditions.some(
          (condition) => condition.passed === passed
      )
  ).toBe(true);
}

describe("BAT Eligibility Accuracy Validation", () => {
  test("ACC-001 - All standard requirements satisfied", () => {
    const result = evaluate(createEligibleBatFacts());

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", false);

    expectCondition(result, "BAT-001", "citizenship", true);
    expectCondition(result, "BAT-001", "residenceCountry", true);
    expectCondition(result, "BAT-001", "isJkmTargetGroup", true);
    expectCondition(
        result,
        "BAT-001",
        "monthlyHouseholdIncome",
        true
    );
    expectCondition(
        result,
        "BAT-001",
        "hasMedicalOrJkmRecommendation",
        true
    );

    expect(result.ruleResults).toHaveLength(6);
  });

  test("ACC-002 - Applicant is not Malaysian", () => {
    const result = evaluate(
        createEligibleBatFacts({
          citizenship: "Non-Malaysian",
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);
    expectCondition(result, "BAT-001", "citizenship", false);
  });

  test("ACC-003 - Applicant resides outside Malaysia", () => {
    const result = evaluate(
        createEligibleBatFacts({
          residenceCountry: "Singapore",
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);
    expectCondition(result, "BAT-001", "residenceCountry", false);
  });

  test("ACC-004 - Applicant is not in JKM target group", () => {
    const result = evaluate(
        createEligibleBatFacts({
          isJkmTargetGroup: false,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);
    expectCondition(result, "BAT-001", "isJkmTargetGroup", false);
  });

  test("ACC-005 - Household income equals synthetic PGK limit", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 2500,
          perCapitaHouseholdIncome: 700,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-006", false);
    expectCondition(
        result,
        "BAT-001",
        "monthlyHouseholdIncome",
        true
    );
  });

  test("ACC-006 - Per-capita income equals synthetic PGK limit", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 600,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-006", false);
    expectCondition(
        result,
        "BAT-001",
        "perCapitaHouseholdIncome",
        true
    );
  });

  test("ACC-007 - Both income values exceed PGK thresholds", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 700,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-001",
        "monthlyHouseholdIncome",
        false
    );
    expectCondition(
        result,
        "BAT-001",
        "perCapitaHouseholdIncome",
        false
    );
  });

  test("ACC-008 - Medical or JKM recommendation is absent", () => {
    const result = evaluate(
        createEligibleBatFacts({
          hasMedicalOrJkmRecommendation: false,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);
    expectCondition(
        result,
        "BAT-001",
        "hasMedicalOrJkmRecommendation",
        false
    );
  });

  test("ACC-009 - Recommendation status is unknown", () => {
    const result = evaluate(
        createEligibleBatFacts({
          hasMedicalOrJkmRecommendation: null,
        })
    );

    expectStatusAndRules(
        result,
        "insufficient_information",
        []
    );

    expectRule(result, "BAT-001", null);
    expectRule(result, "BAT-005", null);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-001",
        "hasMedicalOrJkmRecommendation",
        null
    );

    expect(result.missingInformation.length).toBeGreaterThan(0);
  });

  test("ACC-010 - Household income missing but per-capita qualifies", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: null,
          perCapitaHouseholdIncome: 500,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", false);
    expectCondition(
        result,
        "BAT-001",
        "perCapitaHouseholdIncome",
        true
    );
  });

  test("ACC-011 - Both income values are missing", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: null,
          perCapitaHouseholdIncome: null,
        })
    );

    expectStatusAndRules(
        result,
        "insufficient_information",
        []
    );

    expectRule(result, "BAT-001", null);
    expectRule(result, "BAT-005", null);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-001",
        "monthlyHouseholdIncome",
        null
    );
    expectCondition(
        result,
        "BAT-001",
        "perCapitaHouseholdIncome",
        null
    );
  });

  test("ACC-012 - Missing PGK thresholds produce unknown eligibility", () => {
    const result = evaluate(
        createEligibleBatFacts(),
        {}
    );

    expectStatusAndRules(
        result,
        "insufficient_information",
        []
    );

    expectRule(result, "BAT-001", null);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", null);
    expectRule(result, "BAT-006", false);
  });

  test("ACC-013 - Missing household PGK does not block qualifying per-capita income", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 500,
        }),
        {
          BAT_POOR_PER_CAPITA_PGK: 600,
        }
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-006", false);
    expectCondition(
        result,
        "BAT-001",
        "perCapitaHouseholdIncome",
        true
    );
  });

  test("ACC-014 - Invalid PGK threshold does not create a false result", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 700,
        }),
        {
          BAT_POOR_HOUSEHOLD_PGK: Number.NaN,
          BAT_POOR_PER_CAPITA_PGK: 600,
        }
    );

    expectStatusAndRules(
        result,
        "insufficient_information",
        []
    );

    expectRule(result, "BAT-001", null);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", null);
    expectRule(result, "BAT-006", false);
  });

  test("ACC-015 - Equipment costing RM10,000 needs no additional approval", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 10000,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-003",
        "estimatedEquipmentCost",
        false
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        false
    );
  });

  test("ACC-016 - Equipment costing RM10,001 requires further approval", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 10001,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-003"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-003", true);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-003",
        "estimatedEquipmentCost",
        true
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        false
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-017 - Equipment costing RM20,000 requires further approval", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 20000,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-003"]
    );

    expectRule(result, "BAT-003", true);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        false
    );
  });

  test("ACC-018 - Equipment above RM20,000 requires further assessment", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 20001,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-006"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", true);

    expectCondition(
        result,
        "BAT-003",
        "estimatedEquipmentCost",
        false
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-019 - Recommendation or equipment review required", () => {
    const result = evaluate(
        createEligibleBatFacts({
          batRecommendationOrEquipmentRequiresReview: true,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-002"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", true);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-002",
        "batRecommendationOrEquipmentRequiresReview",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-020 - Unknown review flag does not block preliminary eligibility", () => {
    const result = evaluate(
        createEligibleBatFacts({
          batRecommendationOrEquipmentRequiresReview: null,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", null);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", false);

    expect(
        result.missingInformation.some(
            (condition) =>
                condition.field === "batRecommendationOrEquipmentRequiresReview"
        )
    ).toBe(false);
  });

  test("ACC-021 - Special consideration requires manual verification", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 700,
          batSpecialConsiderationRequested: true,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-004"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-004", true);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-004",
        "batSpecialConsiderationRequested",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-022 - Unknown special consideration preserves insufficient information", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 700,
          batSpecialConsiderationRequested: null,
        })
    );

    expectStatusAndRules(
        result,
        "insufficient_information",
        []
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-004", null);
    expectRule(result, "BAT-005", null);
    expectRule(result, "BAT-006", false);
  });

  test("ACC-023 - No preliminary match and no special consideration", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 700,
          batSpecialConsiderationRequested: false,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);
  });

  test("ACC-024 - Contradictory outcomes require manual verification", () => {
    const conflictingRules: EligibilityRule[] = [
      {
        id: "BAT-CONFLICT-ELIGIBLE",
        programCode: "BAT",
        name: "Conflicting preliminary eligibility",
        description: "Controlled eligible outcome",
        outcome: "potentially_eligible",
        conditions: {
          operator: "AND",
          conditions: [
            {
              id: "CONFLICT-001",
              field: "citizenship",
              operator: "eq",
              value: "Malaysian",
              description: "Applicant is Malaysian",
            },
          ],
        },
      },
      {
        id: "BAT-CONFLICT-INELIGIBLE",
        programCode: "BAT",
        name: "Conflicting preliminary ineligibility",
        description: "Controlled ineligible outcome",
        outcome: "potentially_ineligible",
        conditions: {
          operator: "AND",
          conditions: [
            {
              id: "CONFLICT-002",
              field: "citizenship",
              operator: "eq",
              value: "Malaysian",
              description: "Applicant is Malaysian",
            },
          ],
        },
      },
    ];

    const result = evaluateProgramEligibility(
        "BAT",
        conflictingRules,
        createEligibleBatFacts()
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        [
          "BAT-CONFLICT-ELIGIBLE",
          "BAT-CONFLICT-INELIGIBLE",
        ]
    );

    expectRule(result, "BAT-CONFLICT-ELIGIBLE", true);
    expectRule(result, "BAT-CONFLICT-INELIGIBLE", true);
  });

  // BAT-006 equipment cost accuracy validation
  test("ACC-025 - Equipment costing RM10,000.01 requires further approval", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 10000.01,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-003"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-003", true);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-003",
        "estimatedEquipmentCost",
        true
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        false
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-026 - Equipment costing RM20,000.01 requires further assessment", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 20000.01,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-006"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", true);

    expectCondition(
        result,
        "BAT-003",
        "estimatedEquipmentCost",
        false
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-027 - Equipment costing RM25,000 requires further assessment", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 25000,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-006"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", true);

    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-028 - High equipment cost does not override failed preliminary eligibility", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 25000,
          isJkmTargetGroup: false,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_ineligible",
        ["BAT-005"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", true);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-001",
        "isJkmTargetGroup",
        false
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );
  });

  test("ACC-029 - High equipment cost preserves unknown eligibility when PGK thresholds are unresolved", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 25000,
        }),
        {}
    );

    expectStatusAndRules(
        result,
        "insufficient_information",
        []
    );

    expectRule(result, "BAT-001", null);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", null);
    expectRule(result, "BAT-006", null);

    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );

    expect(result.manualVerification).toHaveLength(0);
    expect(result.ruleResults).toHaveLength(6);
  });

  test("ACC-030 - Unknown equipment cost preserves preliminary eligibility", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: null,
        })
    );

    expectStatusAndRules(
        result,
        "potentially_eligible",
        ["BAT-001"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", null);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", null);

    expectCondition(
        result,
        "BAT-003",
        "estimatedEquipmentCost",
        null
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        null
    );

    expect(result.manualVerification).toHaveLength(0);
  });

  test("ACC-031 - High equipment cost and recommendation review both require manual verification", () => {
    const result = evaluate(
        createEligibleBatFacts({
          estimatedEquipmentCost: 25000,
          batRecommendationOrEquipmentRequiresReview: true,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-001", "BAT-002", "BAT-006"]
    );

    expectRule(result, "BAT-001", true);
    expectRule(result, "BAT-002", true);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", false);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", true);

    expectCondition(
        result,
        "BAT-002",
        "batRecommendationOrEquipmentRequiresReview",
        true
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-032 - High equipment cost does not override special consideration pathway", () => {
    const result = evaluate(
        createEligibleBatFacts({
          monthlyHouseholdIncome: 3000,
          perCapitaHouseholdIncome: 700,
          estimatedEquipmentCost: 25000,
          batSpecialConsiderationRequested: true,
        })
    );

    expectStatusAndRules(
        result,
        "manual_verification",
        ["BAT-004"]
    );

    expectRule(result, "BAT-001", false);
    expectRule(result, "BAT-002", false);
    expectRule(result, "BAT-003", false);
    expectRule(result, "BAT-004", true);
    expectRule(result, "BAT-005", false);
    expectRule(result, "BAT-006", false);

    expectCondition(
        result,
        "BAT-004",
        "batSpecialConsiderationRequested",
        true
    );
    expectCondition(
        result,
        "BAT-006",
        "estimatedEquipmentCost",
        true
    );

    expect(result.manualVerification.length).toBeGreaterThan(0);
  });

  test("ACC-033 - Eligibility version 2 contains all six BAT rules", () => {
    const rules = getBatRules();

    expect(batApiResponse.data.version).toBe(2);
    expect(batApiResponse.data.criteria.schemaVersion).toBe(1);

    expect(rules).toHaveLength(6);

    expect(rules.map((rule) => rule.id)).toEqual([
      "BAT-001",
      "BAT-002",
      "BAT-003",
      "BAT-004",
      "BAT-005",
      "BAT-006",
    ]);

    const highCostRule = rules.find(
        (rule) => rule.id === "BAT-006"
    );

    expect(highCostRule).toBeDefined();
    expect(highCostRule?.programCode).toBe("BAT");
    expect(highCostRule?.outcome).toBe("manual_verification");
  });
});
