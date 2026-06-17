import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import {
  makeCreditIdempotencyKey,
  type CreditApplicationRow,
  type CreditProductRow,
} from '@/hooks/useCreditProductEngineData';
import type { UnderwritingDecisionRow } from '@/hooks/useUnderwritingOperationsData';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type ContractQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => ContractQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => ContractQueryBuilder<T>;
  eq: (column: string, value: unknown) => ContractQueryBuilder<T>;
  in: (column: string, values: unknown[]) => ContractQueryBuilder<T>;
  maybeSingle: () => ContractQueryBuilder<T>;
};

type ContractSupabaseClient = {
  from: <T = unknown>(table: string) => ContractQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const contractClient = supabase as unknown as ContractSupabaseClient;

export type ContractTemplateRow = {
  template_id: string;
  product_id: string;
  product_version_id: string | null;
  template_name: string;
  template_type: string;
  language: string;
  country: string;
  status: string;
  template_body: string;
  plain_language_summary: string;
  summary_version: string;
  required_signers_json: Array<Record<string, unknown>>;
  required_fields_json: Record<string, unknown>;
  version: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type CreditContractRow = {
  contract_id: string;
  application_id: string;
  decision_id: string;
  product_id: string;
  product_version_id: string;
  template_id: string;
  template_version: number;
  contract_status: string;
  contract_snapshot_json: Record<string, unknown>;
  contract_hash: string;
  snapshot_hash: string;
  signature_hash: string | null;
  final_pdf_hash: string | null;
  signature_provider: string;
  driver_id: string;
  asset_id: string | null;
  credit_account_id: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  driver_signed_at: string | null;
  admin_signed_at: string | null;
  fully_executed_at: string | null;
  expires_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  superseded_by_contract_id: string | null;
  created_at: string;
};

export type ContractSignatureEventRow = {
  signature_event_id: string;
  contract_id: string;
  signer_id: string | null;
  signer_type: string;
  signer_sequence: number;
  signature_status: string;
  signature_method: string;
  signature_provider: string;
  event_at: string;
  signed_at: string | null;
  consent_summary_version: string | null;
  language_displayed: string;
  created_at: string;
};

export type ContractAuditEventRow = {
  audit_event_id: string;
  contract_id: string | null;
  actor_id: string | null;
  actor_type: string;
  event_type: string;
  reason: string | null;
  created_at: string;
};

export type ContractFileRow = {
  file_id: string;
  contract_id: string;
  file_type: string;
  storage_reference: string;
  file_hash: string;
  generated_at: string;
};

export type DriverContractStatusRow = {
  contract_id: string;
  application_id: string;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  primary_action_label: string;
  can_view: boolean;
  can_sign: boolean;
  can_decline: boolean;
  product_name: string;
  asset_label: string;
  summary_json: {
    title?: string;
    language?: string;
    summary_version?: string;
    summary_text?: string;
    principal_amount?: number;
    principal_currency_code?: string;
    down_payment_amount?: number;
    down_payment_currency_code?: string;
    expires_at?: string | null;
  };
  required_actions_json: Array<{ label?: string; status_label?: string; is_pending?: boolean }>;
  expires_at: string | null;
  signed_at: string | null;
};

export type AdminContractingOperationsData = {
  products: CreditProductRow[];
  applications: CreditApplicationRow[];
  underwritingDecisions: UnderwritingDecisionRow[];
  templates: ContractTemplateRow[];
  contracts: CreditContractRow[];
  signatureEvents: ContractSignatureEventRow[];
  auditEvents: ContractAuditEventRow[];
  files: ContractFileRow[];
};

async function fetchProducts(): Promise<CreditProductRow[]> {
  const { data, error } = await contractClient
    .from<CreditProductRow[]>('credit_products')
    .select('product_id, product_type, name, description, status, rules_json, down_payment_rules_json, asset_rules_json, activation_rules_json, vendor_id, product_versions(version_id, product_id, version_number, status, effective_from, effective_to, rules_snapshot_json, contract_requirements_json)')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchApplications(): Promise<CreditApplicationRow[]> {
  const { data, error } = await contractClient
    .from<CreditApplicationRow[]>('credit_applications')
    .select(`
      application_id, driver_id, product_id, product_version_id, requested_asset_id,
      status, submitted_at, expires_at, eligibility_result, eligibility_explanation,
      score_snapshot, down_payment_amount, down_payment_currency_code, created_at,
      credit_products(product_id, product_type, name, description),
      product_versions(version_id, version_number, effective_from),
      financed_assets(description, asset_type, purchase_price, purchase_price_currency_code)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchUnderwritingDecisions(): Promise<UnderwritingDecisionRow[]> {
  const { data, error } = await contractClient
    .from<UnderwritingDecisionRow[]>('underwriting_decisions')
    .select(`
      decision_id, application_id, decision, trust_assessment, financial_assessment,
      risk_assessment, exposure_assessment, decision_score_value, decision_score_grade,
      decision_risk_level, decision_risk_snapshot_json, requested_exposure_amount,
      requested_exposure_currency_code, current_exposure_amount, current_exposure_currency_code,
      maximum_exposure_amount, maximum_exposure_currency_code, available_exposure_amount,
      available_exposure_currency_code, evaluated_policy_set_id, evaluated_policy_version,
      evaluated_policy_snapshot_json, extension_results_json, reason_codes_json,
      driver_explanation, admin_explanation, decision_valid_until, decision_timestamp
    `)
    .order('decision_timestamp', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function latestContractForApplication(applicationId: string, contracts: CreditContractRow[]) {
  return contracts.find((contract) => contract.application_id === applicationId) ?? null;
}

export function latestDecisionForApplication(applicationId: string, decisions: UnderwritingDecisionRow[]) {
  return decisions.find((decision) => decision.application_id === applicationId) ?? null;
}

export function useAdminContractingOperationsData() {
  return useQuery({
    queryKey: ['admin-contracting-operations'],
    queryFn: async (): Promise<AdminContractingOperationsData> => {
      const [products, applications, underwritingDecisions, templates, contracts, signatureEvents, auditEvents, files] = await Promise.all([
        fetchProducts(),
        fetchApplications(),
        fetchUnderwritingDecisions(),
        contractClient
          .from<ContractTemplateRow[]>('contract_templates')
          .select('template_id, product_id, product_version_id, template_name, template_type, language, country, status, template_body, plain_language_summary, summary_version, required_signers_json, required_fields_json, version, effective_from, effective_to, created_at')
          .order('version', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        contractClient
          .from<CreditContractRow[]>('credit_contracts')
          .select('contract_id, application_id, decision_id, product_id, product_version_id, template_id, template_version, contract_status, contract_snapshot_json, contract_hash, snapshot_hash, signature_hash, final_pdf_hash, signature_provider, driver_id, asset_id, credit_account_id, sent_at, viewed_at, driver_signed_at, admin_signed_at, fully_executed_at, expires_at, voided_at, void_reason, declined_at, decline_reason, superseded_by_contract_id, created_at')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        contractClient
          .from<ContractSignatureEventRow[]>('contract_signature_events')
          .select('signature_event_id, contract_id, signer_id, signer_type, signer_sequence, signature_status, signature_method, signature_provider, event_at, signed_at, consent_summary_version, language_displayed, created_at')
          .order('event_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        contractClient
          .from<ContractAuditEventRow[]>('contract_audit_events')
          .select('audit_event_id, contract_id, actor_id, actor_type, event_type, reason, created_at')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        contractClient
          .from<ContractFileRow[]>('contract_files')
          .select('file_id, contract_id, file_type, storage_reference, file_hash, generated_at')
          .order('generated_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
      ]);

      return { products, applications, underwritingDecisions, templates, contracts, signatureEvents, auditEvents, files };
    },
  });
}

export function useDriverContractStatuses(enabled = true) {
  return useQuery({
    queryKey: ['driver-contract-statuses'],
    enabled,
    queryFn: async (): Promise<DriverContractStatusRow[]> => {
      const { data, error } = await contractClient.rpc<DriverContractStatusRow[]>('get_driver_contract_statuses');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateContractQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-contracting-operations'] });
  queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
  queryClient.invalidateQueries({ queryKey: ['admin-underwriting-operations'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
  queryClient.invalidateQueries({ queryKey: ['driver-contract-statuses'] });
}

export function useGenerateCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { data, error } = await contractClient.rpc('generate_credit_contract', {
        p_application_id: applicationId,
        p_idempotency_key: makeCreditIdempotencyKey('contract-generate'),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Contrat Layer 3C genere.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur generation contrat'),
  });
}

export function useSendCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await contractClient.rpc('send_credit_contract', {
        p_contract_id: contractId,
        p_idempotency_key: makeCreditIdempotencyKey('contract-send'),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Contrat envoye pour signature.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur envoi contrat'),
  });
}

export function useAdminSignCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, signerType }: { contractId: string; signerType: 'ADMIN' | 'MANAGER' | 'EXECUTIVE' }) => {
      const { data, error } = await contractClient.rpc('admin_sign_credit_contract', {
        p_contract_id: contractId,
        p_signer_type: signerType,
        p_reason: `Countersignature ${signerType.toLowerCase()} Layer 3C`,
        p_idempotency_key: makeCreditIdempotencyKey(`contract-${signerType.toLowerCase()}-sign`),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Signature interne enregistree.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur signature interne'),
  });
}

export function useVoidCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, reason }: { contractId: string; reason: string }) => {
      const { data, error } = await contractClient.rpc('void_credit_contract', {
        p_contract_id: contractId,
        p_reason: reason,
        p_idempotency_key: makeCreditIdempotencyKey('contract-void'),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Contrat annule avec audit.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur annulation contrat'),
  });
}

export function useReissueCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, reason }: { contractId: string; reason: string }) => {
      const { data, error } = await contractClient.rpc('reissue_credit_contract', {
        p_contract_id: contractId,
        p_reason: reason,
        p_idempotency_key: makeCreditIdempotencyKey('contract-reissue'),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Nouvelle version de contrat emise.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur reemission contrat'),
  });
}

export function useDriverViewCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await contractClient.rpc('driver_view_credit_contract', {
        p_contract_id: contractId,
        p_idempotency_key: makeCreditIdempotencyKey('driver-contract-view'),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => invalidateContractQueries(queryClient),
    onError: (error: Error) => toast.error(error.message || 'Erreur lecture contrat'),
  });
}

export function useDriverSignCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await contractClient.rpc('driver_sign_credit_contract', {
        p_contract_id: contractId,
        p_consent_confirmed: true,
        p_idempotency_key: makeCreditIdempotencyKey('driver-contract-sign'),
        p_device_metadata_json: { source: 'driver_credit_flow' },
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Signature enregistree.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur signature contrat'),
  });
}

export function useDriverDeclineCreditContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await contractClient.rpc('driver_decline_credit_contract', {
        p_contract_id: contractId,
        p_reason: 'Refus conducteur depuis le parcours credit',
        p_idempotency_key: makeCreditIdempotencyKey('driver-contract-decline'),
      });
      if (error) throw error;
      return data as CreditContractRow;
    },
    onSuccess: () => {
      invalidateContractQueries(queryClient);
      toast.success('Refus de signature enregistre.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur refus contrat'),
  });
}
