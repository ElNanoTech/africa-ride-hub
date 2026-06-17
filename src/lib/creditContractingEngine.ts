export type ContractStatus =
  | 'NOT_REQUIRED'
  | 'DRAFT_PENDING'
  | 'DRAFT_CREATED'
  | 'SENT_FOR_SIGNATURE'
  | 'VIEWED'
  | 'PARTIALLY_EXECUTED'
  | 'FULLY_EXECUTED'
  | 'EXPIRED'
  | 'DECLINED_BY_DRIVER'
  | 'VOIDED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export type ContractSignerType =
  | 'DRIVER'
  | 'ADMIN'
  | 'MANAGER'
  | 'EXECUTIVE'
  | 'GUARANTOR'
  | 'VENDOR'
  | 'WITNESS';

export type RequiredContractSigner = {
  signer_type: ContractSignerType;
  sequence: number;
  required: boolean;
  label: string;
};

export type ContractActivationGateInput = {
  requiresContract: boolean;
  latestAgreementSigned: boolean;
  contractStatus?: ContractStatus | null;
  contractExpired?: boolean;
  contractMatchesDecision?: boolean;
  contractMatchesProductVersion?: boolean;
  contractMatchesAsset?: boolean;
  contractMoneyMatches?: boolean;
  requiredSignaturesComplete?: boolean;
};

const signerLabels: Record<ContractSignerType, string> = {
  DRIVER: 'Signature conducteur',
  ADMIN: 'Signature equipe KIRA',
  MANAGER: 'Validation manager',
  EXECUTIVE: 'Validation direction',
  GUARANTOR: 'Garant non disponible',
  VENDOR: 'Validation fournisseur',
  WITNESS: 'Temoin',
};

export function normalizeRequiredSigners(input: Array<ContractSignerType | Partial<RequiredContractSigner>>): RequiredContractSigner[] {
  return input.map((item, index) => {
    const signerType = typeof item === 'string' ? item : item.signer_type;
    if (!signerType) throw new Error('signer_type is required');
    return {
      signer_type: signerType,
      sequence: typeof item === 'string' ? index + 1 : item.sequence ?? index + 1,
      required: typeof item === 'string' ? true : item.required ?? true,
      label: typeof item === 'string' ? signerLabels[signerType] : item.label ?? signerLabels[signerType],
    };
  });
}

export function assertNoUnsupportedSigners(signers: RequiredContractSigner[]) {
  if (signers.some((signer) => signer.signer_type === 'GUARANTOR')) {
    throw new Error('Guarantor signing requires a guarantor identity domain upstream');
  }
}

export function canSignerSign(
  signerType: ContractSignerType,
  requiredSigners: RequiredContractSigner[],
  signedTypes: ContractSignerType[],
) {
  const signer = requiredSigners.find((item) => item.signer_type === signerType && item.required);
  if (!signer) return { allowed: false, reason: 'Signer is not required.' };
  if (signedTypes.includes(signerType)) return { allowed: false, reason: 'Signer already completed.' };

  const missingPrior = requiredSigners
    .filter((item) => item.required && item.sequence < signer.sequence)
    .filter((item) => !signedTypes.includes(item.signer_type));
  if (missingPrior.length > 0) {
    return { allowed: false, reason: `${missingPrior[0].label} must sign first.` };
  }

  return { allowed: true, reason: null };
}

export function nextContractStatus(requiredSigners: RequiredContractSigner[], signedTypes: ContractSignerType[]): ContractStatus {
  const required = requiredSigners.filter((signer) => signer.required);
  const complete = required.every((signer) => signedTypes.includes(signer.signer_type));
  return complete ? 'FULLY_EXECUTED' : 'PARTIALLY_EXECUTED';
}

export function driverContractStatusLabel(status: ContractStatus | null | undefined) {
  switch (status) {
    case 'FULLY_EXECUTED': return 'Accord signe';
    case 'SENT_FOR_SIGNATURE': return 'Pret a signer';
    case 'VIEWED': return 'Lecture en cours';
    case 'PARTIALLY_EXECUTED': return 'En attente equipe KIRA';
    case 'DRAFT_CREATED':
    case 'DRAFT_PENDING': return 'Preparation du contrat';
    case 'DECLINED_BY_DRIVER': return 'Signature refusee';
    case 'VOIDED':
    case 'CANCELLED': return 'Contrat annule';
    case 'SUPERSEDED': return 'Nouvelle version emise';
    case 'EXPIRED': return 'Contrat expire';
    case 'NOT_REQUIRED': return 'Contrat non requis';
    default: return 'Contrat en cours';
  }
}

export function evaluateContractActivationGate(input: ContractActivationGateInput) {
  const blockers: string[] = [];
  if (!input.requiresContract) return { ready: true, blockers };

  if (!input.latestAgreementSigned || input.contractStatus !== 'FULLY_EXECUTED') blockers.push('signed_agreement_required');
  if (input.contractExpired) blockers.push('contract_expired');
  if (input.contractMatchesDecision === false) blockers.push('contract_decision_mismatch');
  if (input.contractMatchesProductVersion === false) blockers.push('contract_product_version_mismatch');
  if (input.contractMatchesAsset === false) blockers.push('contract_asset_mismatch');
  if (input.contractMoneyMatches === false) blockers.push('contract_money_mismatch');
  if (input.requiredSignaturesComplete === false) blockers.push('contract_signatures_incomplete');

  return { ready: blockers.length === 0, blockers };
}
