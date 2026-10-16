/**
 * Referral availability logic for job applications.
 * Referrals can be requested anytime except when a job is expired, closed, or rejected.
 */
export function canAskReferral(status?: string | null): boolean {
  if (!status) return true;
  const s = status.trim().toLowerCase();
  return s !== 'rejected' && s !== 'closed' && s !== 'expired';
}
