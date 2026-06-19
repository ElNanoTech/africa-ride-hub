import { describe, expect, it } from 'vitest';
import {
  buildExecutiveNarrative,
  buildPortfolioExportRows,
  normalizeFunnelStages,
  percentLabel,
  recommendedActionLabel,
} from './creditPortfolioAnalytics';

describe('credit portfolio analytics helpers', () => {
  it('fills missing funnel stages with zero-count source-linked placeholders', () => {
    const stages = normalizeFunnelStages([
      {
        stage_order: 2,
        stage_key: 'application',
        stage_label: 'Application',
        record_count: 4,
        conversion_rate: null,
        source_tables: 'credit_applications',
      },
    ]);

    expect(stages).toHaveLength(8);
    expect(stages[0]).toMatchObject({
      stage_key: 'eligible_driver',
      record_count: 0,
      source_tables: 'source pending',
    });
    expect(stages[1]).toMatchObject({
      stage_key: 'application',
      record_count: 4,
      source_tables: 'credit_applications',
    });
  });

  it('generates executive narrative only from supplied metrics', () => {
    const narrative = buildExecutiveNarrative(
      {
        active_credit_accounts: 12,
        portfolio_at_risk_rate: 9.4,
        completed_ownership_count: 2,
      },
      [
        {
          product_name: 'Vehicle ownership',
          product_type: 'vehicle_ownership',
          recommended_action: 'tighten_policy',
        },
      ],
      [{ title: 'High exposure at risk', severity: 'HIGH', recommended_action: 'Review now' }],
    );

    expect(narrative).toContain('PAR is 9.4%');
    expect(narrative).toContain('2 drivers reached ownership completion');
    expect(narrative).toContain('1 product require leadership review');
    expect(narrative).toContain('1 executive attention item');
  });

  it('builds export rows with source names and safe display labels', () => {
    const rows = buildPortfolioExportRows(
      {
        active_credit_accounts: 3,
        total_deployed_exposure: 5000000,
        current_outstanding_balance: 3200000,
        portfolio_at_risk_rate: 0,
      },
      [{ product_name: 'Phone financing', product_type: 'phone', recommended_action: 'monitor' }],
      [{ title: 'Data quality anomaly', severity: 'MEDIUM', recommended_action: 'Review source records' }],
    );

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'Portfolio at risk rate', source: 'v_credit_portfolio_health', value: '0%' }),
        expect.objectContaining({ metric: 'Phone financing', value: 'Surveiller', source: 'v_credit_product_performance' }),
        expect.objectContaining({ metric: 'Data quality anomaly', source: 'v_credit_executive_attention_items' }),
      ]),
    );
  });

  it('formats percentages and recommended action labels defensively', () => {
    expect(percentLabel(null)).toBe('0%');
    expect(percentLabel(12.345)).toBe('12.3%');
    expect(recommendedActionLabel('pause_product')).toBe('Mettre en pause');
    expect(recommendedActionLabel('unknown')).toBe('Action a confirmer');
  });
});
