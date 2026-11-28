import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, View } from "react-native";

import {
  getJkmApplicantReview,
  getJkmExternalSubmissionState,
  submitJkmApplication
} from "../../../services/applications/jkm/jkmApplicationService.ts";

import {
  buildPrefilledJkmApplicationData,
  getJkmApplicationData,
  saveJkmApplicationData
} from "../../../services/applications/jkm/jkmApplicationDataService";

import {
  getApplicationPreliminaryEligibility,
  persistApplicationEligibilityAssessment
} from "../../../services/applications/applicationEligibilityService";

import {
  getOrCreateJkmApplication,
  getApplicationById
} from "../../../services/applications/applicationServices";

import {
  assessApplicantEligibility
} from "../../../services/eligibility/eligibility";

import type {
  JkmApplicantReview,
  JkmApplicationDraftData,
  JkmProgramCode,
  JkmSubmissionResult
} from "../../../types/applications";

import useApplicationSections from "../../../hooks/applications/useApplicationSections";
import useApplicationSubmission from "../../../hooks/applications/useApplicationSubmission";

import ApplicationScreenLayout from "../../../components/applications/shared/ApplicationScreenLayout";
import ApplicationSummaryCard from "../../../components/applications/shared/ApplicationSummaryCard";
import ApplicantInformationSection from "../../../components/applications/shared/ApplicantInformationSection";
import ApplicationReadinessSection from "../../../components/applications/shared/ApplicationReadinessSection";
import PreliminaryEligibilitySection from "../../../components/applications/shared/PreliminaryEligibilitySection";
import ApplicationDetailsSection from "../../../components/applications/shared/ApplicationDetailsSection";
import SubmissionConfirmationSection from "../../../components/applications/shared/SubmissionConfirmationSection";
import ApplicationSubmissionActions from "../../../components/applications/shared/ApplicationSubmissionActions";
import ApplicationDeclaration from "../../../components/applications/shared/ApplicationDeclaration";

import JkmProgramSpecificSection from "../../../components/applications/jkm/JkmProgramSpecificSection";

import ApplicationAlert from "../../../components/ui/Alert";

import { isExistingSubmission } from "../../../utils/applicationUtils";

import { getSavedEligibilityAnswers } from "../../../services/eligibility/eligibilityQuestionnaireService";

import type { ProgramEligibilityAnswers } from "../../../services/eligibility/eligibilityDataService";

interface JkmApplicationScreenProps {
  programCode?: JkmProgramCode;
  applicationId?: string;
}

export default function JkmApplicationScreen({
    programCode = "BA",
    applicationId
}: JkmApplicationScreenProps) {
  return (
      <JkmApplicationContent
          key={`${programCode}:${applicationId ?? "new"}`}
          programCode={programCode}
          applicationId={applicationId}
      />
  );
}

function JkmApplicationContent({
    programCode,
    applicationId
}: {
  programCode: JkmProgramCode;
  applicationId?: string;
}) {
  const { t } = useTranslation();

  const submission = useApplicationSubmission<JkmSubmissionResult>();

  const sections = useApplicationSections({
    confirmationExpanded: true
  });

  const {
    application,
    setApplication,
    confirmation,
    externalSubmissionState,
    setExternalSubmissionState,
    preliminaryEligibility,
    setPreliminaryEligibility,

    loading,
    setLoading,
    saving,
    setSaving,
    submitting,
    setSubmitting,

    setSubmissionStateVerified,
    error,
    setError,

    operationRef,
    applicationRef,

    alreadySubmitted,
    requiresRecovery,
    applicationLocked,
    canEdit,
    mode,
    getCanSubmit,
    applyConfirmation
  } = submission;

  const {
    showApplicationDetails,
    setShowApplicationDetails,
    showApplicantDetails,
    setShowApplicantDetails,
    showReadiness,
    setShowReadiness,
    showPreliminaryEligibility,
    setShowPreliminaryEligibility,
    showConfirmationDetails,
    setShowConfirmationDetails
  } = sections;

  const [applicant, setApplicant] = useState<JkmApplicantReview | null>(null);
  const [applicationData, setApplicationData] = useState<JkmApplicationDraftData | null>(null);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [showProgramSpecificData, setShowProgramSpecificData] = useState(true);
  const latestApplicationDataRef = useRef<JkmApplicationDraftData | null>(null);

  useEffect(() => {
    latestApplicationDataRef.current = applicationData;
  }, [applicationData]);

  const loadApplication = useCallback(async () => {
    if (operationRef.current) {
      return;
    }

    operationRef.current = true;

    try {
      setLoading(true);
      setError(null);
      setSubmissionStateVerified(false);
      latestApplicationDataRef.current = null;

      const existingApplicationId = applicationId ?? applicationRef.current?.id;

      const jkmApplication =
          existingApplicationId
              ? await getApplicationById(
                  existingApplicationId,
                  programCode
              )
              : await getOrCreateJkmApplication(programCode);

      applicationRef.current = jkmApplication;

      const [
        applicantReview,
        submissionState,
        eligibilitySnapshot,
        savedApplicationData
      ] = await Promise.all([
        getJkmApplicantReview(
            jkmApplication.profileId,
            programCode
        ),

        getJkmExternalSubmissionState(
            jkmApplication.id
        ),

        getApplicationPreliminaryEligibility(
            jkmApplication.id
        ),

        getJkmApplicationData(
            jkmApplication.id
        )
      ]);

      setApplication(jkmApplication);
      setApplicant(applicantReview);
      setExternalSubmissionState(submissionState);
      setPreliminaryEligibility(eligibilitySnapshot);

      const initializedApplicationData =
          savedApplicationData ??
          (
              isExistingSubmission(submissionState) ||
              jkmApplication.status === "simulated_submitted"
                  ? null
                  : await buildPrefilledJkmApplicationData(programCode)
          );

      latestApplicationDataRef.current = initializedApplicationData;
      setApplicationData(initializedApplicationData);

      setDeclarationAccepted(false);
      setSubmissionStateVerified(true);

      if (submissionState === "submitted") {
        const result = await submitJkmApplication(
            jkmApplication.id,
            programCode
        );

        applyConfirmation(result, jkmApplication);
        setShowConfirmationDetails(true);
      }
    } catch (err) {
      setError(
          err instanceof Error
              ? err.message
              : "applications.jkm.messages.loadError"
      );

      setSubmissionStateVerified(false);
    } finally {
      operationRef.current = false;
      setLoading(false);
    }
  }, [
    programCode,
    applicationId,
    operationRef,
    applicationRef,
    setLoading,
    setError,
    setSubmissionStateVerified,
    setApplication,
    setExternalSubmissionState,
    setPreliminaryEligibility,
    applyConfirmation,
    setShowConfirmationDetails
  ]);

  useEffect(() => {
    void loadApplication();
  }, [loadApplication]);


  const baData =
      applicationData?.programCode === "BA"
          ? applicationData.programSpecificData
          : null;

  const batData =
      applicationData?.programCode === "BAT"
          ? applicationData.programSpecificData
          : null;

  // BA programme-specific validation
  const baDataComplete =
      !!baData &&
      typeof baData.receivesOtherJkmMonthlyAssistance === "boolean" &&
      (
          baData.receivesOtherJkmMonthlyAssistance
              ? !!baData.currentJkmAssistanceProgram?.trim()
              : !baData.currentJkmAssistanceProgram?.trim()
      ) &&
      (
          baData.additionalCircumstances?.otherCircumstances !== true ||
          !!baData.additionalCircumstances.description?.trim()
      );

  // BAT beneficiary validation
  const batBeneficiary = batData?.beneficiary;

  const batBeneficiaryTypeValid =
      batBeneficiary?.type === "applicant" ||
      batBeneficiary?.type === "dependent";

  const batBeneficiaryIdentificationNo =
      batBeneficiary?.identificationNo?.replace(/\D/g, "") ?? "";

  const applicantIdentificationNo =
      applicant?.identificationNo?.replace(/\D/g, "") ?? "";

  const batDependentIdentificationValid =
      !batBeneficiaryIdentificationNo ||
      (
          batBeneficiaryIdentificationNo.length === 12 &&
          batBeneficiaryIdentificationNo !== applicantIdentificationNo
      );

  const batBeneficiaryComplete =
      batBeneficiaryTypeValid &&
      (
          batBeneficiary?.type === "applicant" ||
          (
              batBeneficiary?.type === "dependent" &&
              !!batBeneficiary.fullName?.trim() &&
              !!batBeneficiary.relationshipToApplicant?.trim() &&
              batDependentIdentificationValid
          )
      );

  // BAT dependent health validation
  const batTreatmentStartDate =
      batBeneficiary?.health?.treatmentStartDate?.trim() ?? "";

  const batTreatmentStartDateValid =
      !batTreatmentStartDate ||
      (
          /^\d{4}-\d{2}-\d{2}$/.test(batTreatmentStartDate) &&
          Number.isFinite(Date.parse(batTreatmentStartDate)) &&
          new Date(batTreatmentStartDate)
              .toISOString()
              .slice(0, 10) === batTreatmentStartDate
      );

  const batBeneficiaryHealthComplete =
      batBeneficiary?.type !== "dependent" ||
      batTreatmentStartDateValid;

  // BAT equipment validation
  const batEquipment = batData?.equipment;

  const batEstimatedCost = batEquipment?.estimatedCost;

  const batEstimatedCostValid =
      batEstimatedCost === null ||
      batEstimatedCost === undefined ||
      (
          typeof batEstimatedCost === "number" &&
          Number.isFinite(batEstimatedCost) &&
          batEstimatedCost >= 0
      );

  const batRequiresAdditionalJustification =
      typeof batEstimatedCost === "number" &&
      batEstimatedCost > 20000;

  const batEquipmentComplete =
      !!batEquipment?.equipmentType?.trim() &&
      !!batEquipment.equipmentDescription?.trim() &&
      !!batEquipment.purpose?.trim() &&
      batEstimatedCostValid &&
      (
          !batRequiresAdditionalJustification ||
          !!batData?.additionalJustification?.trim()
      );

  // BAT recommendation validation
  const batRecommendation = batData?.recommendation;

  const batRecommendingAuthority = batRecommendation?.recommendingAuthority;

  const batRecommendingAuthorityValid =
      batRecommendingAuthority === "medical_officer" ||
      batRecommendingAuthority === "jkm_officer" ||
      batRecommendingAuthority === "other";

  const batRecommendationComplete =
      (
          batRecommendingAuthority === null ||
          batRecommendingAuthority === undefined ||
          batRecommendingAuthorityValid
      ) &&
      (
          batRecommendation?.recommendationAvailable !== true ||
          batRecommendingAuthorityValid
      ) &&
      (
          batRecommendingAuthority !== "other" ||
          !!batRecommendation?.recommendationDetails?.trim()
      );

  // BAT programme-specific validation
  const batDataComplete =
      !!batData &&
      batBeneficiaryComplete &&
      batBeneficiaryHealthComplete &&
      batEquipmentComplete &&
      batRecommendationComplete;

  // Determine programme-specific application readiness
  const programSpecificDataComplete =
      applicationData?.programCode === "BA"
          ? baDataComplete
          : applicationData?.programCode === "BAT"
              ? batDataComplete
              : false;

  const applicationReady =
      applicant?.profileReady === true &&
      programSpecificDataComplete;

  const canSave =
      canEdit &&
      (
          applicationData?.programCode === "BA" ||
          applicationData?.programCode === "BAT"
      );

  const canSubmit = getCanSubmit(
      applicationReady,
      declarationAccepted
  );

  const handleProgramSpecificDataChange = (
      data: JkmApplicationDraftData
  ) => {
    if (
        !canEdit ||
        operationRef.current ||
        data.programCode !== programCode
    ) {
      return;
    }

    setApplicationData(data);
    latestApplicationDataRef.current = data;
    setDeclarationAccepted(false);
  };

  const refreshSubmissionState = async (
      applicationId: string
  ) => {
    try {
      const submissionState =
          await getJkmExternalSubmissionState(applicationId);

      setExternalSubmissionState(submissionState);
      setSubmissionStateVerified(true);
    } catch {
      setSubmissionStateVerified(false);
    }
  };

  const handleSaveDraft = async () => {
    const dataToSave = latestApplicationDataRef.current;

    if (
        !application ||
        !dataToSave ||
        !canSave ||
        operationRef.current
    ) {
      return;
    }

    operationRef.current = true;

    try {
      setSaving(true);
      setError(null);

      const submissionState =
          await getJkmExternalSubmissionState(
              application.id
          );

      setExternalSubmissionState(submissionState);
      setSubmissionStateVerified(true);

      if (isExistingSubmission(submissionState)) {
        throw new Error(
            "applications.jkm.messages.applicationLocked"
        );
      }

      const savedData =
          await saveJkmApplicationData(
              application.id,
              dataToSave
          );

      latestApplicationDataRef.current = savedData;
      setApplicationData(savedData);

      Alert.alert(
          t("applications.jkm.buttons.saveDraft"),
          t("applications.jkm.messages.draftSaved")
      );
    } catch (err) {
      const message =
          err instanceof Error
              ? err.message
              : "applications.jkm.messages.draftSaveError";

      setError(message);

      await refreshSubmissionState(application.id);

      Alert.alert(
          t("applications.jkm.messages.attentionRequired"),
          t(message, { defaultValue: message })
      );
    } finally {
      operationRef.current = false;
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const latestApplicationData = latestApplicationDataRef.current;

    if (
        !application ||
        !canSubmit ||
        operationRef.current
    ) {
      return;
    }

    operationRef.current = true;

    try {
      setSubmitting(true);
      setError(null);

      const submissionState =
          await getJkmExternalSubmissionState(
              application.id
          );

      setExternalSubmissionState(submissionState);
      setSubmissionStateVerified(true);

      if (!isExistingSubmission(submissionState)) {
        if (
            !latestApplicationData ||
            !applicationReady ||
            !declarationAccepted ||
            alreadySubmitted ||
            requiresRecovery
        ) {
          throw new Error(
              "applications.jkm.messages.incompleteApplication"
          );
        }

        await saveJkmApplicationData(
            application.id,
            latestApplicationData
        );


        let eligibilityAnswers: ProgramEligibilityAnswers = {};

        // Use the latest BAT application declarations
        if (latestApplicationData.programCode === "BAT") {
          const savedAnswers = await getSavedEligibilityAnswers("BAT");
          const batData = latestApplicationData.programSpecificData;
          const recommendationAvailable = batData.recommendation.recommendationAvailable;
          const recommendingAuthority = batData.recommendation.recommendingAuthority;

          const hasMedicalOrJkmRecommendation =
              recommendationAvailable === false
                  ? false
                  : recommendationAvailable === true
                      ? (
                          recommendingAuthority === "medical_officer" ||
                          recommendingAuthority === "jkm_officer"
                      )
                      : null;

          eligibilityAnswers = {
            bat: {
              ...savedAnswers,

              requestedAssistiveEquipment: true,

              estimatedEquipmentCost:
                  batData.equipment.estimatedCost ?? null,

              hasMedicalOrJkmRecommendation,
            },
          };
        }

        const assessment =
            await assessApplicantEligibility(
                programCode,
                {
                  answers: eligibilityAnswers,
                }
            );

        const snapshot =
            await persistApplicationEligibilityAssessment(
                application.id,
                assessment
            );

        setPreliminaryEligibility(snapshot);
        setShowPreliminaryEligibility(true);
      } else {
        const snapshot =
            await getApplicationPreliminaryEligibility(
                application.id
            );

        setPreliminaryEligibility(snapshot);
      }

      const result =
          await submitJkmApplication(
              application.id,
              programCode
          );

      applyConfirmation(result, application);
      setShowConfirmationDetails(true);

      Alert.alert(
          result.alreadySubmitted
              ? t("applications.jkm.messages.alreadySubmittedTitle")
              : t("applications.jkm.messages.successTitle"),

          t("applications.jkm.messages.successDescription", {
            referenceNo: result.referenceNo
          })
      );
    } catch (err) {
      const message =
          err instanceof Error
              ? err.message
              : "applications.jkm.messages.submissionError";

      setError(message);

      await refreshSubmissionState(application.id);

      Alert.alert(
          t("applications.jkm.messages.attentionRequired"),
          t(message, { defaultValue: message })
      );
    } finally {
      operationRef.current = false;
      setSubmitting(false);
    }
  };

  return (
      <ApplicationScreenLayout
          provider="jkm"
          programCode={programCode}
          loading={loading}
          error={error}
          actions={
            <ApplicationSubmissionActions
                provider="jkm"
                mode={mode}
                canSubmit={canSubmit}
                canSave={canSave}
                submitting={submitting}
                refreshing={loading}
                saving={saving}
                onSubmit={handleSubmit}
                onRefresh={loadApplication}
                onSaveDraft={
                  (
                      applicationData?.programCode === "BA" ||
                      applicationData?.programCode === "BAT"
                  )
                      ? handleSaveDraft
                      : undefined
                }
            />
          }
      >
        <ApplicationSummaryCard
            provider="jkm"
            application={application}
            confirmation={confirmation}
        />

        <ApplicantInformationSection
            provider="jkm"
            applicant={applicant}
            expanded={showApplicantDetails}
            onExpandedChange={setShowApplicantDetails}
        />

        <ApplicationReadinessSection
            provider="jkm"
            applicant={applicant}
            programSpecificDataComplete={programSpecificDataComplete}
            applicationLocked={applicationLocked}
            expanded={showReadiness}
            onExpandedChange={setShowReadiness}
        />

        {applicationData && (
            <View className="gap-2">
              <JkmProgramSpecificSection
                  data={applicationData}
                  onChange={handleProgramSpecificDataChange}
                  disabled={!canEdit}
                  expanded={showProgramSpecificData}
                  onExpandedChange={setShowProgramSpecificData}
              />

              {applicationLocked && (
                  <Text className="text-xs text-muted-foreground">
                    {t("applications.jkm.messages.applicationLocked")}
                  </Text>
              )}
            </View>
        )}

        {application && (
            <PreliminaryEligibilitySection
                provider="jkm"
                assessment={preliminaryEligibility}
                alreadySubmitted={alreadySubmitted}
                requiresRecovery={requiresRecovery}
                expanded={showPreliminaryEligibility}
                onExpandedChange={setShowPreliminaryEligibility}
            />
        )}

        <ApplicationDetailsSection
            provider="jkm"
            application={application}
            expanded={showApplicationDetails}
            onExpandedChange={setShowApplicationDetails}
        />

        {externalSubmissionState === "pending" && (
            <ApplicationAlert
                variant="warning"
                title={t("applications.jkm.messages.pendingTitle")}
            >
              {t("applications.jkm.messages.pendingDescription")}
            </ApplicationAlert>
        )}

        {externalSubmissionState === "unknown" && (
            <ApplicationAlert
                variant="warning"
                title={t("applications.jkm.messages.unknownTitle")}
            >
              {t("applications.jkm.messages.unknownDescription")}
            </ApplicationAlert>
        )}

        {externalSubmissionState === "failed" && (
            <ApplicationAlert
                variant="error"
                title={t("applications.jkm.messages.failedTitle")}
            >
              {t("applications.jkm.messages.failedDescription")}
            </ApplicationAlert>
        )}

        <SubmissionConfirmationSection
            provider="jkm"
            confirmation={confirmation}
            alreadySubmitted={alreadySubmitted}
            expanded={showConfirmationDetails}
            onExpandedChange={setShowConfirmationDetails}
        />

        {application && !applicationLocked && (
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">
                {t("applications.jkm.messages.reviewDescription")}
              </Text>

              <ApplicationDeclaration
                  title={t("applications.jkm.sections.applicationReview")}
                  description={t("applications.jkm.messages.declaration")}
                  accepted={declarationAccepted}
                  onChange={setDeclarationAccepted}
                  disabled={!canEdit}
              />
            </View>
        )}

        <ApplicationAlert variant="info">
          {t("applications.jkm.messages.simulationDisclaimer")}
        </ApplicationAlert>
      </ApplicationScreenLayout>
  );
}
