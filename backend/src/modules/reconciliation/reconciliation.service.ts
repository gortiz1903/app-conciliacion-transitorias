import db from '../../config/database';

interface SuggestionMatch {
  movementId: number;
  matchedMovementIds: number[];
  matchType: 'document_number' | 'invoice' | 'purchase_order' | 'amount' | 'reference';
  confidence: 'high' | 'medium' | 'low';
  totalDebit: number;
  totalCredit: number;
  difference: number;
}

/**
 * Generate automatic reconciliation suggestions for a given account+agency+period.
 * Matches debits against credits using multiple criteria.
 */
export async function generateSuggestions(
  accountId: number,
  agencyId: number,
  periodId: number,
  reconciliationType: 'NORMAL' | 'RELATED'
): Promise<SuggestionMatch[]> {
  const suggestions: SuggestionMatch[] = [];

  if (reconciliationType === 'NORMAL') {
    await suggestNormalMatches(accountId, agencyId, periodId, suggestions);
  } else {
    await suggestRelatedMatches(agencyId, periodId, suggestions);
  }

  return suggestions;
}

async function suggestNormalMatches(
  accountId: number,
  agencyId: number,
  periodId: number,
  suggestions: SuggestionMatch[]
): Promise<void> {
  // Get all pending movements for this account+agency+period
  const movements = await db('movements')
    .where({ account_id: accountId, agency_id: agencyId, period_id: periodId, status: 'PENDING' })
    .select('*');

  const debits = movements.filter((m) => parseFloat(m.debit) > 0);
  const credits = movements.filter((m) => parseFloat(m.credit) > 0);

  // Strategy 1: Match by document_number (high confidence)
  matchByField(debits, credits, 'document_number', 'high', suggestions);

  // Strategy 2: Match by invoice number (high confidence)
  matchByField(debits, credits, 'invoice', 'high', suggestions);

  // Strategy 3: Match by purchase_order (medium confidence)
  matchByField(debits, credits, 'purchase_order', 'medium', suggestions);

  // Strategy 4: Match by exact amount (1:1)
  matchByExactAmount(debits, credits, suggestions);

  // Strategy 5: Match N:1 by amount sum
  matchByAmountSum(debits, credits, suggestions);
}

async function suggestRelatedMatches(
  agencyId: number,
  periodId: number,
  suggestions: SuggestionMatch[]
): Promise<void> {
  // For RELATED type: match 82009.X (income) against 92009.X (cost) within same agency
  const account82009 = await db('accounts').where('account_number', '82009').first();
  const account92009 = await db('accounts').where('account_number', '92009').first();
  if (!account82009 || !account92009) return;

  const incomeMovements = await db('movements')
    .where({ account_id: account82009.id, agency_id: agencyId, status: 'PENDING' })
    .where('period_id', '<=', periodId)
    .select('*');

  const costMovements = await db('movements')
    .where({ account_id: account92009.id, agency_id: agencyId, status: 'PENDING' })
    .where('period_id', '<=', periodId)
    .select('*');

  // For related accounts, income entries (82009) cancel cost entries (92009)
  // Match by invoice, document, or client
  matchByField(incomeMovements, costMovements, 'invoice', 'high', suggestions);
  matchByField(incomeMovements, costMovements, 'document_number', 'high', suggestions);
  matchByField(incomeMovements, costMovements, 'client_vendor', 'medium', suggestions);
  matchByExactAmount(incomeMovements, costMovements, suggestions);
}

function matchByField(
  setA: any[],
  setB: any[],
  field: string,
  confidence: 'high' | 'medium' | 'low',
  suggestions: SuggestionMatch[]
): void {
  const alreadyMatched = new Set(suggestions.flatMap((s) => [s.movementId, ...s.matchedMovementIds]));

  for (const a of setA) {
    if (!a[field] || alreadyMatched.has(a.id)) continue;

    const matches = setB.filter(
      (b) => b[field] && b[field] === a[field] && !alreadyMatched.has(b.id)
    );

    if (matches.length > 0) {
      const totalDebit = parseFloat(a.debit) || matches.reduce((sum: number, m: any) => sum + (parseFloat(m.debit) || 0), 0);
      const totalCredit = parseFloat(a.credit) || matches.reduce((sum: number, m: any) => sum + (parseFloat(m.credit) || 0), 0);

      suggestions.push({
        movementId: a.id,
        matchedMovementIds: matches.map((m: any) => m.id),
        matchType: field as any,
        confidence,
        totalDebit,
        totalCredit,
        difference: Math.abs(totalDebit - totalCredit),
      });

      alreadyMatched.add(a.id);
      matches.forEach((m: any) => alreadyMatched.add(m.id));
    }
  }
}

function matchByExactAmount(
  setA: any[],
  setB: any[],
  suggestions: SuggestionMatch[]
): void {
  const alreadyMatched = new Set(suggestions.flatMap((s) => [s.movementId, ...s.matchedMovementIds]));

  for (const a of setA) {
    if (alreadyMatched.has(a.id)) continue;
    const aAmount = parseFloat(a.debit) || parseFloat(a.credit);

    const match = setB.find((b) => {
      if (alreadyMatched.has(b.id)) return false;
      const bAmount = parseFloat(b.debit) || parseFloat(b.credit);
      return Math.abs(aAmount - bAmount) < 0.01;
    });

    if (match) {
      suggestions.push({
        movementId: a.id,
        matchedMovementIds: [match.id],
        matchType: 'amount',
        confidence: 'medium',
        totalDebit: parseFloat(a.debit) + parseFloat(match.debit),
        totalCredit: parseFloat(a.credit) + parseFloat(match.credit),
        difference: 0,
      });
      alreadyMatched.add(a.id);
      alreadyMatched.add(match.id);
    }
  }
}

function matchByAmountSum(
  debits: any[],
  credits: any[],
  suggestions: SuggestionMatch[]
): void {
  const alreadyMatched = new Set(suggestions.flatMap((s) => [s.movementId, ...s.matchedMovementIds]));

  // Try to find N credits that sum to a single debit (or vice versa)
  for (const debit of debits) {
    if (alreadyMatched.has(debit.id)) continue;
    const targetAmount = parseFloat(debit.debit);

    const availableCredits = credits.filter((c) => !alreadyMatched.has(c.id));
    const combination = findSumCombination(availableCredits, targetAmount);

    if (combination.length > 1) {
      suggestions.push({
        movementId: debit.id,
        matchedMovementIds: combination.map((c: any) => c.id),
        matchType: 'amount',
        confidence: 'low',
        totalDebit: targetAmount,
        totalCredit: combination.reduce((sum: number, c: any) => sum + parseFloat(c.credit), 0),
        difference: 0,
      });
      alreadyMatched.add(debit.id);
      combination.forEach((c: any) => alreadyMatched.add(c.id));
    }
  }
}

function findSumCombination(items: any[], target: number, maxItems: number = 5): any[] {
  // Simple greedy approach for N:1 matching — limit to 5 items max
  const sorted = [...items].sort(
    (a, b) => parseFloat(b.credit) - parseFloat(a.credit)
  );

  let remaining = target;
  const result: any[] = [];

  for (const item of sorted) {
    if (result.length >= maxItems) break;
    const amount = parseFloat(item.credit);
    if (amount <= remaining + 0.01) {
      result.push(item);
      remaining -= amount;
      if (Math.abs(remaining) < 0.01) return result;
    }
  }

  return Math.abs(remaining) < 0.01 ? result : [];
}
