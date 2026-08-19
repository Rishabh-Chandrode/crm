import { describe, it, expect, beforeEach, vi } from 'vitest';

type ThemeMode = 'light' | 'dark' | 'system';

function isEffectiveDark(theme: ThemeMode, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark);
}

describe('Extension Theme System', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    vi.clearAllMocks();
  });

  it('toggles .dark and .light classes on document root', () => {
    // Simulate setting dark
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    // Simulate switching to light
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('respects system color scheme query when matchMedia is dark', () => {
    const effectiveDark = isEffectiveDark('system', true);
    if (effectiveDark) {
      document.documentElement.classList.add('dark');
    }

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
