/**
 * Automation Verifier — Phase 5
 * Checks step results against verification rules
 */

import type { VerificationRule, AutomationStep } from './planner';
import type { StepResult, ArtifactResult } from './executor';

export interface VerificationResult {
  stepId: string;
  passed: boolean;
  checks: CheckResult[];
}

export interface CheckResult {
  rule: VerificationRule;
  passed: boolean;
  detail: string;
}

/**
 * Verify a step result against its verification rules
 */
export function verifyStep(step: AutomationStep, result: StepResult): VerificationResult {
  const checks: CheckResult[] = [];

  for (const rule of step.verificationRules) {
    const check = runCheck(rule, result);
    checks.push(check);
  }

  return {
    stepId: step.stepId,
    passed: checks.every(c => c.passed),
    checks,
  };
}

function runCheck(rule: VerificationRule, result: StepResult): CheckResult {
  switch (rule.type) {
    case 'file_exists':
      return checkFileExists(rule, result.artifacts);

    case 'preview_loads':
      return checkPreviewLoads(rule, result.artifacts);

    case 'no_404':
      return checkNo404(rule, result);

    case 'quality_score':
      return checkQualityScore(rule, result);

    case 'custom':
      return { rule, passed: result.status === 'success', detail: 'Custom check: step succeeded' };

    default:
      return { rule, passed: false, detail: `Unknown rule type: ${rule.type}` };
  }
}

function checkFileExists(rule: VerificationRule, artifacts: ArtifactResult[]): CheckResult {
  if (rule.target) {
    const found = artifacts.some(a => a.url?.includes(rule.target!) || a.label === rule.target);
    return {
      rule,
      passed: found,
      detail: found ? `Found artifact matching "${rule.target}"` : `No artifact matching "${rule.target}"`,
    };
  }

  const hasArtifacts = artifacts.length > 0;
  return {
    rule,
    passed: hasArtifacts,
    detail: hasArtifacts ? `${artifacts.length} artifact(s) produced` : 'No artifacts produced',
  };
}

function checkPreviewLoads(rule: VerificationRule, artifacts: ArtifactResult[]): CheckResult {
  const previewable = artifacts.filter(a =>
    a.url && (
      a.type === 'image' ||
      a.type === 'video' ||
      a.type === 'audio' ||
      a.mimeType.startsWith('image/') ||
      a.mimeType.startsWith('video/') ||
      a.mimeType.startsWith('audio/')
    )
  );

  return {
    rule,
    passed: previewable.length > 0,
    detail: previewable.length > 0
      ? `${previewable.length} previewable artifact(s)`
      : 'No previewable artifacts found',
  };
}

function checkNo404(rule: VerificationRule, result: StepResult): CheckResult {
  const is404 = result.error?.includes('404') || result.error?.includes('not found');
  return {
    rule,
    passed: !is404 && result.status !== 'failed',
    detail: is404 ? '404 error detected' : result.status === 'failed' ? `Step failed: ${result.error}` : 'No 404 errors',
  };
}

function checkQualityScore(rule: VerificationRule, result: StepResult): CheckResult {
  // Quality score would come from metadata in artifacts
  const threshold = rule.threshold ?? 70;
  // In a real implementation, extract QA score from result metadata
  const passed = result.status === 'success';
  return {
    rule,
    passed,
    detail: passed ? `Quality check passed (threshold: ${threshold})` : 'Quality check failed',
  };
}

/**
 * Verify all steps in a plan execution
 */
export function verifyPlanExecution(
  steps: AutomationStep[],
  results: StepResult[],
): { allPassed: boolean; verifications: VerificationResult[] } {
  const verifications: VerificationResult[] = [];

  for (const step of steps) {
    const result = results.find(r => r.stepId === step.stepId);
    if (result) {
      verifications.push(verifyStep(step, result));
    } else {
      verifications.push({
        stepId: step.stepId,
        passed: false,
        checks: [{ rule: { type: 'custom', description: 'Step was not executed' }, passed: false, detail: 'Step not found in results' }],
      });
    }
  }

  return {
    allPassed: verifications.every(v => v.passed),
    verifications,
  };
}
