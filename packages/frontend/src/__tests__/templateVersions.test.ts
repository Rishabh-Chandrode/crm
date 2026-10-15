import { describe, it, expect } from 'vitest';
import {
  latestSelectableVersion,
  latestTemplateCards,
  versionsInFamily,
} from '../lib/templateVersions';

const referralV1 = { id: 't-1', family_id: 'fam-1', name: 'referral', version: 1, deleted_at: null };
const referralV2 = { id: 't-2', family_id: 'fam-1', name: 'referral', version: 2, deleted_at: null };
const deletedOutreach = { id: 't-del', family_id: 'fam-2', name: 'outreach', version: 1, deleted_at: '2026-01-01' };

describe('template version grouping', () => {
  it('keeps one card for the latest version of each family', () => {
    const cards = latestTemplateCards([referralV1, referralV2, deletedOutreach]);
    expect(cards.map((card) => card.id).sort()).toEqual(['t-2', 't-del']);
  });

  it('lists family versions with the newest first', () => {
    expect(versionsInFamily([referralV1, referralV2], 'fam-1').map((row) => row.version)).toEqual([2, 1]);
  });

  it('selects the latest live version by default', () => {
    expect(latestSelectableVersion([referralV1, { ...referralV2, deleted_at: '2026-02-01' }])?.id).toBe('t-1');
    expect(latestSelectableVersion([referralV1, referralV2])?.id).toBe('t-2');
  });
});
