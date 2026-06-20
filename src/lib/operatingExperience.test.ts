import { describe, expect, it } from 'vitest';
import {
  buildOperatingExperienceExportRows,
  calculateTenantHealthScore,
  disabledActionExplanation,
  groupActionsByUrgency,
  guidanceEmptyState,
  normalizeSearchTerm,
  progressCompletionPercent,
  roleExperienceForAdminRole,
  searchResultKindLabel,
} from './operatingExperience';

describe('operating experience helpers', () => {
  it('maps existing admin roles to Layer 3X role experiences', () => {
    expect(roleExperienceForAdminRole('super_admin')).toBe('owner');
    expect(roleExperienceForAdminRole('agent_pret')).toBe('collections_manager');
    expect(roleExperienceForAdminRole('agent_support')).toBe('support_agent');
    expect(roleExperienceForAdminRole(undefined)).toBe('fleet_manager');
  });

  it('sorts and groups next-best-actions by operating urgency', () => {
    const groups = groupActionsByUrgency([
      { title: 'Training', urgency: 'TRAINING_NEEDED', priority_score: 90, created_at: '2026-01-01T00:00:00Z' },
      { title: 'KYC', urgency: 'URGENT', priority_score: 80, created_at: '2026-01-02T00:00:00Z' },
      { title: 'Invoice', urgency: 'TODAY', priority_score: 95, created_at: '2026-01-03T00:00:00Z' },
    ]);

    expect(groups.map((group) => group.urgency)).toEqual(['URGENT', 'TODAY', 'TRAINING_NEEDED']);
    expect(groups[0].items[0].title).toBe('KYC');
  });

  it('explains disabled actions with the missing requirement and fix', () => {
    const explanation = disabledActionExplanation('Activate account', [
      { requirement: 'Signed contract', isMet: false, fix: 'Send the contract for signature.', href: '/admin/contracts' },
      { requirement: 'KYC approved', isMet: true, fix: 'Approve KYC.' },
    ]);

    expect(explanation.disabled).toBe(true);
    expect(explanation.reason).toContain('Signed contract');
    expect(explanation.fix).toBe('Send the contract for signature.');
    expect(explanation.href).toBe('/admin/contracts');
  });

  it('builds empty-state copy from purpose, reason, and first action', () => {
    const empty = guidanceEmptyState({
      title: 'No credit products exist yet',
      what: 'Credit products define what drivers can apply for.',
      why: 'No records exist because no product has been created.',
      ctaLabel: 'Create Credit Product',
      href: '/admin/credit-operations',
    });

    expect(empty.body).toContain('Credit products define');
    expect(empty.body).toContain('no product has been created');
    expect(empty.ctaLabel).toBe('Create Credit Product');
  });

  it('calculates tenant health with bounded component scores', () => {
    expect(calculateTenantHealthScore({
      featureAdoption: 100,
      workflowCompletion: 80,
      trainingCompletion: 60,
      collectionsEfficiency: 40,
      driverAdoption: -10,
    })).toEqual({ healthScore: 56, status: 'WATCH' });
  });

  it('calculates learning completion and normalizes search labels', () => {
    expect(progressCompletionPercent([
      { progress_status: 'COMPLETED' },
      { progress_status: 'IN_PROGRESS' },
      { status: 'COMPLETED' },
    ])).toBe(67);
    expect(normalizeSearchTerm('Éligibilité Crédit')).toBe('eligibilite credit');
    expect(searchResultKindLabel('guided_workflow')).toBe('Workflow');
  });

  it('builds export rows for actions, health, and learning', () => {
    const rows = buildOperatingExperienceExportRows({
      actions: [{ title: 'Review KYC', urgency: 'URGENT', status: 'OPEN', role_key: 'fleet_manager' }],
      healthScores: [{ customer_name: 'QA Tenant', health_score: 88, score_status: 'EXCELLENT' }],
      learningRows: [{ title: 'Fleet basics', category: 'Fleet', progress_status: 'COMPLETED' }],
    });

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'Next Best Action', status: 'Urgent / OPEN' }),
      expect.objectContaining({ section: 'Tenant Health', owner: 'QA Tenant' }),
      expect.objectContaining({ section: 'Learning', status: 'Completed' }),
    ]));
  });
});
