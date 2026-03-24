export type UserRole = 'ADMIN' | 'CONCILIADOR' | 'AUDITOR';
export type ReconciliationType = 'NORMAL' | 'RELATED';
export type MovementStatus = 'PENDING' | 'RECONCILED_WITH_DIFF' | 'RECONCILED_COMPLETE' | 'CLOSED';
export type AccountPeriodState = 'PENDING' | 'IN_PROGRESS' | 'CLOSED';
export type AgingColor = 'green' | 'yellow' | 'orange' | 'red';

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  agencies: Agency[];
}

export interface Agency {
  id: number;
  code: string;
  name: string;
  suffix: string;
  active: boolean;
}

export interface Account {
  id: number;
  account_number: string;
  name: string;
  reconciliation_type: ReconciliationType;
  active: boolean;
}

export interface Period {
  id: number;
  code: string;
  start_date: string;
  end_date: string;
  status: 'OPEN' | 'CLOSED';
}

export interface Movement {
  id: number;
  agency_id: number;
  period_id: number;
  account_id: number;
  entry_date: string;
  entry_number: string;
  entry_type: string;
  full_account_number: string;
  account_name: string;
  debit: number;
  credit: number;
  reference: string;
  document_number: string;
  client_vendor: string;
  purchase_order: string;
  invoice: string;
  status: MovementStatus;
  // Joined fields
  agency_code?: string;
  agency_name?: string;
  account_number?: string;
  account_display_name?: string;
  period_code?: string;
}

export interface ReconciliationGroup {
  id: number;
  account_id: number;
  agency_id: number;
  period_id: number;
  reconciliation_type: ReconciliationType;
  status: 'RECONCILED_WITH_DIFF' | 'RECONCILED_COMPLETE';
  total_debit: number;
  total_credit: number;
  difference: number;
  reconciled_by: string;
  reconciled_at: string;
  notes: string;
}

export interface MovementSplit {
  id: number;
  movement_id: number;
  amount: number;
  description: string;
  created_by: string;
  created_at: string;
}

export interface MovementComment {
  id: number;
  movement_id: number;
  user_id: string;
  display_name: string;
  comment: string;
  created_at: string;
}

export interface ReconciliationSuggestion {
  movementId: number;
  matchedMovementIds: number[];
  matchType: 'document_number' | 'invoice' | 'purchase_order' | 'amount' | 'reference';
  confidence: 'high' | 'medium' | 'low';
  totalDebit: number;
  totalCredit: number;
  difference: number;
}

export interface ReconciliationProof {
  pendingBalance: number;
  systemBalance: number;
  adjustments: number;
  difference: number;
  isBalanced: boolean;
}

export interface DashboardSummary {
  agencySummary: Array<{
    id: number;
    code: string;
    name: string;
    total_accounts: number;
    closed_count: number;
    in_progress_count: number;
    pending_count: number;
  }>;
  aging: Array<{
    aging_color: AgingColor;
    count: number;
    total_debit: number;
    total_credit: number;
  }>;
  pendingAdjustments: number;
}

export function getAgingColor(entryDate: string): AgingColor {
  const days = Math.floor((Date.now() - new Date(entryDate).getTime()) / 86400000);
  if (days <= 30) return 'green';
  if (days <= 60) return 'yellow';
  if (days <= 90) return 'orange';
  return 'red';
}

export function getAgingLabel(color: AgingColor): string {
  switch (color) {
    case 'green': return '0-30 dias';
    case 'yellow': return '31-60 dias';
    case 'orange': return '61-90 dias';
    case 'red': return '+90 dias';
  }
}
