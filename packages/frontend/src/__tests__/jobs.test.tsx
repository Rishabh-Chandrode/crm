import { describe, it, expect, vi } from 'vitest';
import JobsPage from '../app/(dashboard)/jobs/page';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('JobsPage Component (Redirect)', () => {
  it('redirects to /applications', () => {
    JobsPage();
    expect(redirect).toHaveBeenCalledWith('/applications');
  });
});
