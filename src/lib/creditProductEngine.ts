export type CurrencyCode = 'XOF' | 'USD' | 'EUR' | string;

export type Money = {
  amount: number;
  currency_code: CurrencyCode;
};

export const CURRENCY_DECIMAL_SCALE: Record<string, number> = {
  XOF: 0,
  USD: 2,
  EUR: 2,
};

export type CreditProductType =
  | 'CAR_OWNERSHIP'
  | 'MOTORCYCLE_FINANCING'
  | 'PHONE_FINANCING'
  | 'TV_APPLIANCE_FINANCING'
  | 'EQUIPMENT_FINANCING'
  | 'FLEET_EXPANSION'
  | 'OTHER';

export type CreditProductStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED' | 'ARCHIVED';

export type CreditProductVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED' | 'ARCHIVED';

export type EligibilityResult =
  | 'NOT_ELIGIBLE'
  | 'ALMOST_ELIGIBLE'
  | 'ELIGIBLE_FOR_REVIEW'
  | 'ELIGIBLE'
  | 'MANUAL_REVIEW';

export type ApplicationStatus =
  | 'DRAFT'
  | 'STARTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export type ActivationStatus = 'PENDING' | 'READY' | 'BLOCKED' | 'ACTIVATED' | 'FAILED' | 'CANCELLED';

export type FulfillmentStatus =
  | 'PENDING'
  | 'ORDERED'
  | 'ASSIGNED'
  | 'INSPECTED'
  | 'READY_FOR_HANDOVER'
  | 'DELIVERED'
  | 'POSSESSION_CONFIRMED'
  | 'DAMAGED_BEFORE_POSSESSION'
  | 'LOST_BEFORE_POSSESSION'
  | 'REPLACEMENT_REQUIRED'
  | 'CANCELLED'
  | 'FAILED';

export type CreditObligationType =
  | 'DOWN_PAYMENT'
  | 'CREDIT_FEE'
  | 'ACTIVATION_FEE'
  | 'OWNERSHIP_INSTALLMENT'
  | 'MOTORCYCLE_INSTALLMENT'
  | 'PHONE_INSTALLMENT'
  | 'EQUIPMENT_INSTALLMENT';

export type DownPaymentRule =
  | { type: 'FIXED'; amount: number; currency_code: CurrencyCode }
  | { type: 'PERCENTAGE'; percent: number; currency_code?: CurrencyCode }
  | { type: 'NONE'; currency_code?: CurrencyCode };

export type CreditProductRules = {
  min_score?: number;
  manual_review_below_score?: number;
  down_payment?: DownPaymentRule;
  activation_fee?: Money;
  credit_fee?: Money;
  required_documents?: string[];
  eligibility_explanation?: string;
};

export type CreditProduct = {
  product_id: string;
  product_type: CreditProductType;
  status: CreditProductStatus;
  name: string;
  rules_json: CreditProductRules;
};

export type ProductVersion = {
  version_id: string;
  product_id: string;
  version_number: number;
  effective_from: string;
  effective_to?: string | null;
  status: CreditProductVersionStatus;
  rules_snapshot_json: CreditProductRules;
};

export type ApplicationSnapshotInput = {
  application_id: string;
  driver_id: string;
  product: CreditProduct;
  productVersion: ProductVersion;
  score: number | null;
  scoreSource: 'driver_scores.current_score' | 'unavailable';
  scoreUpdatedAt?: string | null;
  eligibility: CreditEligibility;
  requestedAssetId?: string | null;
  requestedTerms?: Record<string, unknown>;
  kycReferenceId?: string | null;
  submittedAt: string;
  money: {
    downPayment: Money;
    activationFee?: Money | null;
    creditFee?: Money | null;
  };
};

export type ApplicationSnapshot = {
  application_id: string;
  driver_id: string;
  submitted_at: string;
  product_snapshot: {
    product_id: string;
    product_type: CreditProductType;
    product_name: string;
    product_status: CreditProductStatus;
  };
  product_version_snapshot: {
    version_id: string;
    version_number: number;
    effective_from: string;
    effective_to: string | null;
    rules_snapshot_json: CreditProductRules;
  };
  eligibility_snapshot: CreditEligibility;
  score_snapshot: {
    score: number | null;
    source: 'driver_scores.current_score' | 'unavailable';
    updated_at: string | null;
  };
  requested_asset_id: string | null;
  requested_terms_json: Record<string, unknown>;
  kyc_reference_id: string | null;
  obligations_snapshot: {
    down_payment: Money;
    activation_fee: Money | null;
    credit_fee: Money | null;
  };
  privacy_note: string;
};

export type CreditEligibility = {
  result: EligibilityResult;
  driverLabel: string;
  explanation: string;
  score: number | null;
  minScore: number | null;
  gap: number;
};

export type ActivationReadinessInput = {
  applicationStatus: ApplicationStatus;
  decision: 'APPROVED' | 'APPROVED_WITH_CONDITIONS' | 'DECLINED' | 'MANUAL_REVIEW' | null;
  downPaymentAmount: number;
  downPaymentInvoiceStatus?: string | null;
  fulfillmentStatus?: FulfillmentStatus | null;
  possessionConfirmedAt?: string | null;
  hasPhysicalAsset: boolean;
  riskHold?: boolean;
  fraudHold?: boolean;
  agreementSigned?: boolean;
};

export type ActivationReadiness = {
  status: ActivationStatus;
  ready: boolean;
  blockingReasons: string[];
};

export type ExposureItem = {
  status: string;
  principal: Money;
};

export function assertValidMoney(money: Money): Money {
  if (!Number.isInteger(money.amount)) {
    throw new Error('Money amount must be an integer minor-unit value');
  }
  if (money.amount < 0) {
    throw new Error('Money amount cannot be negative');
  }
  if (!money.currency_code) {
    throw new Error('Money currency_code is required');
  }
  return money;
}

export function currencyScale(currencyCode: CurrencyCode): number {
  return CURRENCY_DECIMAL_SCALE[currencyCode] ?? 2;
}

export function formatMoney(money: Money): string {
  assertValidMoney(money);
  const scale = currencyScale(money.currency_code);
  const value = money.amount / 10 ** scale;
  return `${new Intl.NumberFormat('fr-CI', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(value)} ${money.currency_code === 'XOF' ? 'FCFA' : money.currency_code}`;
}

export function getActiveProductVersion(productId: string, versions: ProductVersion[], at = new Date()): ProductVersion | null {
  const timestamp = at.getTime();
  const active = versions.filter((version) => {
    if (version.product_id !== productId || version.status !== 'ACTIVE') return false;
    const starts = new Date(version.effective_from).getTime() <= timestamp;
    const ends = !version.effective_to || new Date(version.effective_to).getTime() > timestamp;
    return starts && ends;
  });

  if (active.length > 1) {
    throw new Error(`Only one ACTIVE product version is allowed for product ${productId}`);
  }

  return active[0] ?? null;
}

export function calculateDownPayment(rule: DownPaymentRule | undefined, purchasePrice: Money): Money {
  assertValidMoney(purchasePrice);
  if (!rule || rule.type === 'NONE') return { amount: 0, currency_code: rule?.currency_code ?? purchasePrice.currency_code };

  if (rule.type === 'FIXED') {
    return assertValidMoney({ amount: rule.amount, currency_code: rule.currency_code });
  }

  const percent = Math.max(0, rule.percent);
  return assertValidMoney({
    amount: Math.round((purchasePrice.amount * percent) / 100),
    currency_code: rule.currency_code ?? purchasePrice.currency_code,
  });
}

export function evaluateCreditEligibility(rules: CreditProductRules, authoritativeScore: number | null): CreditEligibility {
  const minScore = Number.isFinite(rules.min_score) ? Number(rules.min_score) : null;
  const reviewScore = Number.isFinite(rules.manual_review_below_score) ? Number(rules.manual_review_below_score) : null;

  if (authoritativeScore == null || minScore == null) {
    return {
      result: 'MANUAL_REVIEW',
      driverLabel: 'En attente de vérification',
      explanation: 'Le score KIRA confirmé doit être disponible avant la revue crédit.',
      score: authoritativeScore,
      minScore,
      gap: minScore ?? 0,
    };
  }

  const gap = Math.max(0, minScore - authoritativeScore);
  if (gap === 0) {
    return {
      result: 'ELIGIBLE',
      driverLabel: 'Éligible',
      explanation: rules.eligibility_explanation ?? 'Votre score KIRA confirmé atteint le minimum du produit.',
      score: authoritativeScore,
      minScore,
      gap,
    };
  }

  if (reviewScore != null && authoritativeScore >= reviewScore) {
    return {
      result: 'ELIGIBLE_FOR_REVIEW',
      driverLabel: 'Éligible pour revue',
      explanation: `Votre score KIRA confirmé est proche du minimum. Il manque ${gap} point${gap > 1 ? 's' : ''}.`,
      score: authoritativeScore,
      minScore,
      gap,
    };
  }

  if (gap <= 75) {
    return {
      result: 'ALMOST_ELIGIBLE',
      driverLabel: 'Presque éligible',
      explanation: `Il manque ${gap} point${gap > 1 ? 's' : ''} pour ouvrir ce produit.`,
      score: authoritativeScore,
      minScore,
      gap,
    };
  }

  return {
    result: 'NOT_ELIGIBLE',
    driverLabel: 'Non éligible - voir conditions',
    explanation: `Score minimum requis : ${minScore}. Score KIRA confirmé : ${authoritativeScore}.`,
    score: authoritativeScore,
    minScore,
    gap,
  };
}

export function createApplicationSnapshot(input: ApplicationSnapshotInput): ApplicationSnapshot {
  return {
    application_id: input.application_id,
    driver_id: input.driver_id,
    submitted_at: input.submittedAt,
    product_snapshot: {
      product_id: input.product.product_id,
      product_type: input.product.product_type,
      product_name: input.product.name,
      product_status: input.product.status,
    },
    product_version_snapshot: {
      version_id: input.productVersion.version_id,
      version_number: input.productVersion.version_number,
      effective_from: input.productVersion.effective_from,
      effective_to: input.productVersion.effective_to ?? null,
      rules_snapshot_json: input.productVersion.rules_snapshot_json,
    },
    eligibility_snapshot: input.eligibility,
    score_snapshot: {
      score: input.score,
      source: input.scoreSource,
      updated_at: input.scoreUpdatedAt ?? null,
    },
    requested_asset_id: input.requestedAssetId ?? null,
    requested_terms_json: input.requestedTerms ?? {},
    kyc_reference_id: input.kycReferenceId ?? null,
    obligations_snapshot: {
      down_payment: assertValidMoney(input.money.downPayment),
      activation_fee: input.money.activationFee ? assertValidMoney(input.money.activationFee) : null,
      credit_fee: input.money.creditFee ? assertValidMoney(input.money.creditFee) : null,
    },
    privacy_note: 'Immutable credit snapshot stores business records, references, status values, and KYC reference IDs rather than raw identity documents.',
  };
}

export function evaluateActivationReadiness(input: ActivationReadinessInput): ActivationReadiness {
  const blockingReasons: string[] = [];

  if (input.applicationStatus !== 'APPROVED') blockingReasons.push('Application must be approved.');
  if (!['APPROVED', 'APPROVED_WITH_CONDITIONS'].includes(input.decision ?? '')) blockingReasons.push('Approved decision is required.');
  if (!input.agreementSigned) blockingReasons.push('Signed agreement is required.');
  if (input.downPaymentAmount > 0 && input.downPaymentInvoiceStatus !== 'paid') blockingReasons.push('Down-payment invoice must be settled.');
  if (input.riskHold) blockingReasons.push('Risk hold must be cleared.');
  if (input.fraudHold) blockingReasons.push('Fraud hold must be cleared.');

  if (input.hasPhysicalAsset) {
    if (input.fulfillmentStatus === 'DAMAGED_BEFORE_POSSESSION') blockingReasons.push('Asset was damaged before possession; replacement or cancellation is required.');
    if (input.fulfillmentStatus === 'LOST_BEFORE_POSSESSION') blockingReasons.push('Asset was lost before possession; replacement or cancellation is required.');
    if (input.fulfillmentStatus !== 'POSSESSION_CONFIRMED' || !input.possessionConfirmedAt) {
      blockingReasons.push('Driver and admin possession confirmation is required.');
    }
  }

  return {
    status: blockingReasons.length === 0 ? 'READY' : 'BLOCKED',
    ready: blockingReasons.length === 0,
    blockingReasons,
  };
}

export function calculateCurrentExposure(items: ExposureItem[], currency_code: CurrencyCode): Money {
  const activeStatuses = new Set(['ACTIVE', 'PAST_DUE', 'SUSPENDED', 'APPROVED_PENDING_ACTIVATION']);
  const amount = items
    .filter((item) => activeStatuses.has(item.status))
    .reduce((sum, item) => {
      assertValidMoney(item.principal);
      if (item.principal.currency_code !== currency_code) {
        throw new Error('Exposure calculation requires one currency at a time');
      }
      return sum + item.principal.amount;
    }, 0);

  return { amount, currency_code };
}

export function isRecurringObligationType(type: CreditObligationType): boolean {
  return type.endsWith('_INSTALLMENT');
}

export function assertLayer3AObligation(type: CreditObligationType): CreditObligationType {
  if (isRecurringObligationType(type)) {
    throw new Error('Layer 3A must not generate recurring installment invoices');
  }
  return type;
}

export function driverAssetLabel(input: { description?: string | null; plate?: string | null; financingLabel?: string | null }): string {
  const description = input.description?.trim() || 'Actif financé';
  const plate = input.plate?.trim();
  const financingLabel = input.financingLabel?.trim() || 'Financé';
  return plate ? `${description} - ${plate}` : `${description} - ${financingLabel}`;
}
