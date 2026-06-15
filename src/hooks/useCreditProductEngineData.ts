import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from '@/hooks/useDriverData';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type CreditQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => CreditQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => CreditQueryBuilder<T>;
  eq: (column: string, value: unknown) => CreditQueryBuilder<T>;
  in: (column: string, values: unknown[]) => CreditQueryBuilder<T>;
  maybeSingle: () => CreditQueryBuilder<T>;
};

type CreditSupabaseClient = {
  from: <T = unknown>(table: string) => CreditQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const creditClient = supabase as unknown as CreditSupabaseClient;

export type CreditProductRow = {
  product_id: string;
  product_type: string;
  name: string;
  description: string | null;
  status: string;
  rules_json: Record<string, unknown>;
  down_payment_rules_json?: Record<string, unknown>;
  asset_rules_json?: Record<string, unknown>;
  activation_rules_json?: Record<string, unknown>;
  vendor_id?: string | null;
  vendors?: { vendor_name?: string | null; vendor_type?: string | null } | null;
  product_versions?: CreditProductVersionRow[];
};

export type CreditProductVersionRow = {
  version_id: string;
  product_id: string;
  version_number: number;
  status: string;
  effective_from: string;
  effective_to: string | null;
  rules_snapshot_json: Record<string, unknown>;
};

export type CreditApplicationRow = {
  application_id: string;
  driver_id: string;
  product_id: string;
  product_version_id: string;
  requested_asset_id: string | null;
  status: string;
  submitted_at: string | null;
  expires_at: string | null;
  eligibility_result: string;
  eligibility_explanation: string;
  score_snapshot: number | null;
  down_payment_amount: number;
  down_payment_currency_code: string;
  created_at: string;
  credit_products?: Pick<CreditProductRow, 'product_id' | 'product_type' | 'name' | 'description'> | null;
  product_versions?: Pick<CreditProductVersionRow, 'version_id' | 'version_number' | 'effective_from'> | null;
  financed_assets?: { description?: string | null; asset_type?: string | null; purchase_price?: number | null; purchase_price_currency_code?: string | null } | null;
};

export type CreditDecisionRow = {
  decision_id: string;
  application_id: string;
  decision: string;
  explanation: string;
  decision_reason_code: string;
  decision_timestamp: string;
};

export type ActivationPackageRow = {
  package_id: string;
  application_id: string;
  status: string;
  validation_status: string;
  validation_results_json: Record<string, unknown>;
  down_payment_invoice_id: string | null;
  created_at: string;
};

export type CreditAccountRow = {
  credit_account_id: string;
  driver_id: string;
  product_id: string;
  asset_id: string | null;
  status: string;
  principal_amount: number;
  principal_currency_code: string;
  activated_at: string;
  credit_products?: Pick<CreditProductRow, 'name' | 'product_type'> | null;
};

export type FinancedAssetRow = {
  asset_id: string;
  asset_type: string;
  description: string;
  vendor_id: string | null;
  purchase_price: number;
  purchase_price_currency_code: string;
  residual_value: number;
  residual_value_currency_code: string;
  asset_condition: string;
  fulfillment_status: string;
  possession_status: string;
  status: string;
  vendors?: { vendor_name?: string | null; vendor_type?: string | null } | null;
};

export type FulfillmentRecordRow = {
  fulfillment_id: string;
  application_id: string | null;
  asset_id: string;
  status: string;
  vendor_id: string | null;
  possession_confirmed_at: string | null;
  asset_condition_at_handover: string | null;
  created_at: string;
};

export type CreditExposureProfileRow = {
  driver_id: string;
  maximum_exposure_limit: number;
  current_exposure: number;
  available_exposure: number;
  currency_code: string;
  last_calculated_at: string | null;
};

export type CreditInvoiceRow = {
  id: string;
  source_application_id: string | null;
  source_credit_account_id: string | null;
  source_product_id: string | null;
  obligation_type: string | null;
  currency_code: string | null;
  status: string;
  total_ttc: number;
  amount_paid?: number | null;
  remaining_due?: number | null;
  invoice_number?: string | null;
  created_at: string;
};

export type DriverCreditEngineData = {
  products: CreditProductRow[];
  applications: CreditApplicationRow[];
  decisions: CreditDecisionRow[];
  activationPackages: ActivationPackageRow[];
  accounts: CreditAccountRow[];
  invoices: CreditInvoiceRow[];
};

export type AdminCreditEngineData = DriverCreditEngineData & {
  assets: FinancedAssetRow[];
  fulfillmentRecords: FulfillmentRecordRow[];
  exposureProfiles: CreditExposureProfileRow[];
};

export const offerTypeToProductType: Record<string, string> = {
  car_loan: 'CAR_OWNERSHIP',
  bike_loan: 'MOTORCYCLE_FINANCING',
  phone_loan: 'PHONE_FINANCING',
  tv_loan: 'TV_APPLIANCE_FINANCING',
};

export function creditStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'DRAFT': return 'Brouillon';
    case 'STARTED': return 'Démarrée';
    case 'SUBMITTED': return 'Soumise';
    case 'UNDER_REVIEW': return 'En revue';
    case 'APPROVED': return 'Approuvée';
    case 'DECLINED': return 'Non retenue';
    case 'WITHDRAWN': return 'Retirée';
    case 'EXPIRED': return 'Expirée';
    case 'PENDING': return 'En attente';
    case 'READY': return 'Prête';
    case 'BLOCKED': return 'Bloquée';
    case 'ACTIVATED': return 'Activée';
    case 'FAILED': return 'Échouée';
    case 'CANCELLED': return 'Annulée';
    case 'ACTIVE': return 'Active';
    case 'AVAILABLE': return 'Disponible';
    case 'ASSIGNED': return 'Assignée';
    case 'PAST_DUE': return 'En retard';
    case 'SUSPENDED': return 'Suspendue';
    case 'COMPLETED': return 'Terminée';
    case 'DEFAULTED': return 'Défaut';
    case 'TERMINATED': return 'Clôturée';
    case 'PASSED': return 'Validée';
    case 'ORDERED': return 'Commandée';
    case 'INSPECTED': return 'Inspectée';
    case 'READY_FOR_HANDOVER': return 'Prête pour remise';
    case 'DELIVERED': return 'Livrée';
    case 'POSSESSION_CONFIRMED': return 'Possession confirmée';
    case 'DAMAGED_BEFORE_POSSESSION': return 'Endommagée avant possession';
    case 'LOST_BEFORE_POSSESSION': return 'Perdue avant possession';
    case 'REPLACEMENT_REQUIRED': return 'Remplacement requis';
    case 'NOT_POSSESSED': return 'Non remise';
    case 'PENDING_CONFIRMATION': return 'Confirmation en attente';
    case 'CONFIRMED': return 'Confirmée';
    case 'RELEASED': return 'Libérée';
    case 'NEW': return 'Neuf';
    case 'NOT_ELIGIBLE': return 'Non éligible - voir conditions';
    case 'ALMOST_ELIGIBLE': return 'Presque éligible';
    case 'ELIGIBLE_FOR_REVIEW': return 'Éligible pour revue';
    case 'ELIGIBLE': return 'Éligible';
    case 'MANUAL_REVIEW': return 'Revue manuelle';
    default: return status || 'En cours';
  }
}

export function makeCreditIdempotencyKey(scope: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}:${id}`;
}

async function fetchProducts(): Promise<CreditProductRow[]> {
  const { data, error } = await creditClient
    .from<CreditProductRow[]>('credit_products')
    .select(`
      product_id, product_type, name, description, status, rules_json,
      down_payment_rules_json, asset_rules_json, activation_rules_json, vendor_id,
      vendors(vendor_name, vendor_type),
      product_versions(version_id, product_id, version_number, status, effective_from, effective_to, rules_snapshot_json)
    `)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchApplications(driverId?: string | null): Promise<CreditApplicationRow[]> {
  let query = creditClient
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

  if (driverId) query = query.eq('driver_id', driverId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchDecisions(applicationIds: string[]): Promise<CreditDecisionRow[]> {
  if (applicationIds.length === 0) return [];
  const { data, error } = await creditClient
    .from<CreditDecisionRow[]>('credit_decisions')
    .select('decision_id, application_id, decision, explanation, decision_reason_code, decision_timestamp')
    .in('application_id', applicationIds)
    .order('decision_timestamp', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchActivationPackages(applicationIds: string[]): Promise<ActivationPackageRow[]> {
  if (applicationIds.length === 0) return [];
  const { data, error } = await creditClient
    .from<ActivationPackageRow[]>('activation_packages')
    .select('package_id, application_id, status, validation_status, validation_results_json, down_payment_invoice_id, created_at')
    .in('application_id', applicationIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchAccounts(driverId?: string | null): Promise<CreditAccountRow[]> {
  let query = creditClient
    .from<CreditAccountRow[]>('credit_accounts')
    .select(`
      credit_account_id, driver_id, product_id, asset_id, status,
      principal_amount, principal_currency_code, activated_at,
      credit_products(name, product_type)
    `)
    .order('created_at', { ascending: false });
  if (driverId) query = query.eq('driver_id', driverId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchInvoices(applicationIds: string[]): Promise<CreditInvoiceRow[]> {
  if (applicationIds.length === 0) return [];
  const { data, error } = await creditClient
    .from<CreditInvoiceRow[]>('invoice')
    .select('id, source_application_id, source_credit_account_id, source_product_id, obligation_type, currency_code, status, total_ttc, amount_paid, remaining_due, invoice_number, created_at')
    .in('source_application_id', applicationIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useDriverCreditEngineData() {
  const { data: driverId, isLoading: driverIdLoading } = useDriverId();

  return useQuery({
    queryKey: ['driver-credit-engine', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<DriverCreditEngineData> => {
      const [products, applications, accounts] = await Promise.all([
        fetchProducts(),
        fetchApplications(driverId),
        fetchAccounts(driverId),
      ]);
      const applicationIds = applications.map((app) => app.application_id);
      const [decisions, activationPackages, invoices] = await Promise.all([
        fetchDecisions(applicationIds),
        fetchActivationPackages(applicationIds),
        fetchInvoices(applicationIds),
      ]);
      return { products, applications, decisions, activationPackages, accounts, invoices };
    },
    meta: { driverIdLoading },
  });
}

export function useSubmitCreditApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, requestedAssetId }: { productId: string; requestedAssetId?: string | null }) => {
      const { data, error } = await creditClient.rpc('submit_credit_application', {
        p_product_id: productId,
        p_requested_asset_id: requestedAssetId ?? null,
        p_requested_terms_json: {},
        p_kyc_reference_id: null,
        p_idempotency_key: makeCreditIdempotencyKey('credit-application'),
      });
      if (error) throw error;
      return data as CreditApplicationRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      toast.success('Demande crédit soumise avec snapshot produit.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la demande crédit');
    },
  });
}

export function useAdminCreditEngineData() {
  return useQuery({
    queryKey: ['admin-credit-engine'],
    queryFn: async (): Promise<AdminCreditEngineData> => {
      const [products, applications, accounts, assets, fulfillmentRecords, exposureProfiles] = await Promise.all([
        fetchProducts(),
        fetchApplications(),
        fetchAccounts(),
        creditClient
          .from<FinancedAssetRow[]>('financed_assets')
          .select('asset_id, asset_type, description, vendor_id, purchase_price, purchase_price_currency_code, residual_value, residual_value_currency_code, asset_condition, fulfillment_status, possession_status, status, vendors(vendor_name, vendor_type)')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        creditClient
          .from<FulfillmentRecordRow[]>('fulfillment_records')
          .select('fulfillment_id, application_id, asset_id, status, vendor_id, possession_confirmed_at, asset_condition_at_handover, created_at')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        creditClient
          .from<CreditExposureProfileRow[]>('credit_exposure_profiles')
          .select('driver_id, maximum_exposure_limit, current_exposure, available_exposure, currency_code, last_calculated_at')
          .order('last_calculated_at', { ascending: false, nullsFirst: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
      ]);

      const applicationIds = applications.map((app) => app.application_id);
      const [decisions, activationPackages, invoices] = await Promise.all([
        fetchDecisions(applicationIds),
        fetchActivationPackages(applicationIds),
        fetchInvoices(applicationIds),
      ]);

      return {
        products,
        applications,
        decisions,
        activationPackages,
        accounts,
        invoices,
        assets,
        fulfillmentRecords,
        exposureProfiles,
      };
    },
  });
}

export function useReviewCreditApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, decision, explanation }: { applicationId: string; decision: string; explanation: string }) => {
      const { data, error } = await creditClient.rpc('review_credit_application', {
        p_application_id: applicationId,
        p_decision: decision,
        p_decision_reason_code: decision === 'DECLINED' ? 'POLICY_NOT_MET' : 'LAYER3A_FOUNDATION_REVIEW',
        p_explanation: explanation,
        p_conditions_json: {},
        p_idempotency_key: makeCreditIdempotencyKey('credit-review'),
      });
      if (error) throw error;
      return data as CreditDecisionRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Décision crédit enregistrée.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur lors de la décision'),
  });
}

export function useCreateDownPaymentInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { data, error } = await creditClient.rpc('create_credit_down_payment_invoice', {
        p_application_id: applicationId,
        p_idempotency_key: makeCreditIdempotencyKey('credit-down-payment'),
      });
      if (error) throw error;
      return data as CreditInvoiceRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Facture d’apport créée via Financial Engine.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur facture d’apport'),
  });
}

export function useEvaluateActivationPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const idempotencyKey = makeCreditIdempotencyKey('credit-activation-package');
      const { data, error } = await creditClient.rpc('create_activation_package', {
        p_application_id: applicationId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as ActivationPackageRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Package d’activation évalué.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur package activation'),
  });
}

export function useActivateCreditAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const idempotencyKey = makeCreditIdempotencyKey('credit-account-activation');
      const { data, error } = await creditClient.rpc('activate_credit_account', {
        p_application_id: applicationId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditAccountRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Compte crédit activé sans échéancier récurrent.');
    },
    onError: (error: Error) => toast.error(error.message || 'Activation bloquée'),
  });
}
