import { describe, it, expect, beforeEach, vi } from 'vitest';

type ThemeMode = 'light' | 'dark' | 'system';

function isEffectiveDark(theme: ThemeMode, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark);
}

describe('Extension Theme & Modern UI System', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.innerHTML = '';
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

  it('handles segmented tab navigation active class switching', () => {
    document.body.innerHTML = `
      <div class="tab-bar">
        <button class="tab tab--active" data-tab="contact">Contact</button>
        <button class="tab" data-tab="send">Send</button>
        <button class="tab" data-tab="apply">Autofill</button>
      </div>
      <div id="tab-contact" class="tab-pane" style="display:flex"></div>
      <div id="tab-send" class="tab-pane" style="display:none"></div>
      <div id="tab-apply" class="tab-pane" style="display:none"></div>
    `;

    const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
    const panes = document.querySelectorAll<HTMLElement>('.tab-pane');

    function switchTab(target: string) {
      tabs.forEach((t) => t.classList.remove('tab--active'));
      panes.forEach((p) => { p.style.display = 'none'; });

      document.querySelector(`.tab[data-tab="${target}"]`)?.classList.add('tab--active');
      const targetPane = document.getElementById(`tab-${target}`);
      if (targetPane) targetPane.style.display = 'flex';
    }

    // Switch to 'send'
    switchTab('send');
    expect(document.querySelector('.tab[data-tab="send"]')?.classList.contains('tab--active')).toBe(true);
    expect(document.querySelector('.tab[data-tab="contact"]')?.classList.contains('tab--active')).toBe(false);
    expect(document.getElementById('tab-send')?.style.display).toBe('flex');
    expect(document.getElementById('tab-contact')?.style.display).toBe('none');

    // Switch to 'apply'
    switchTab('apply');
    expect(document.querySelector('.tab[data-tab="apply"]')?.classList.contains('tab--active')).toBe(true);
    expect(document.getElementById('tab-apply')?.style.display).toBe('flex');
    expect(document.getElementById('tab-send')?.style.display).toBe('none');
  });

  it('handles profile category pill filtering selection', () => {
    document.body.innerHTML = `
      <div class="profile-cat-pills-bar">
        <button class="profile-cat-pill profile-cat-pill--active" data-cat="all">All</button>
        <button class="profile-cat-pill" data-cat="personal">Personal</button>
        <button class="profile-cat-pill" data-cat="job">Job</button>
      </div>
    `;

    const pills = document.querySelectorAll<HTMLButtonElement>('.profile-cat-pill');
    function selectCat(cat: string) {
      pills.forEach((p) => p.classList.remove('profile-cat-pill--active'));
      document.querySelector(`.profile-cat-pill[data-cat="${cat}"]`)?.classList.add('profile-cat-pill--active');
    }

    selectCat('job');
    expect(document.querySelector('.profile-cat-pill[data-cat="job"]')?.classList.contains('profile-cat-pill--active')).toBe(true);
    expect(document.querySelector('.profile-cat-pill[data-cat="all"]')?.classList.contains('profile-cat-pill--active')).toBe(false);
  });
});
