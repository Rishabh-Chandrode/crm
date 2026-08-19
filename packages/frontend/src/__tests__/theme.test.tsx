import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useTheme } from '../components/ThemeProvider';

function TestConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <span data-testid="resolved-theme-val">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('system')}>Set System</button>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}

describe('ThemeProvider & useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, // Default to light system preference
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders with default system theme and resolves to light when matchMedia is false', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-val').textContent).toBe('system');
    expect(screen.getByTestId('resolved-theme-val').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('switches to dark theme, applies .dark class, and persists to localStorage', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Set Dark'));
    });

    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(screen.getByTestId('resolved-theme-val').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('crm_theme')).toBe('dark');
  });

  it('switches to light theme, removes .dark class, and persists to localStorage', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Set Dark'));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      fireEvent.click(screen.getByText('Set Light'));
    });
    expect(screen.getByTestId('theme-val').textContent).toBe('light');
    expect(screen.getByTestId('resolved-theme-val').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('crm_theme')).toBe('light');
  });

  it('toggleTheme switches between dark and light', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    // Initial is system (resolved light), toggle should make it dark
    act(() => {
      fireEvent.click(screen.getByText('Toggle Theme'));
    });
    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Toggle again should make it light
    act(() => {
      fireEvent.click(screen.getByText('Toggle Theme'));
    });
    expect(screen.getByTestId('theme-val').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('loads saved theme from localStorage on initial mount', () => {
    localStorage.setItem('crm_theme', 'dark');

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-val').textContent).toBe('dark');
    expect(screen.getByTestId('resolved-theme-val').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
