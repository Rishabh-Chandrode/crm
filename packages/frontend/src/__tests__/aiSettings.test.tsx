import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import AiSettingsPage from '../app/(dashboard)/ai-settings/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      me: vi.fn(),
    },
    aiSettings: {
      get: vi.fn(),
      update: vi.fn(),
      test: vi.fn(),
    },
  },
}));

describe('AiSettingsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Access Restricted when user is not an administrator', async () => {
    vi.mocked(api.auth.me).mockResolvedValueOnce({
      user: { id: 'user-1', username: 'john', role: 'user' },
    } as any);

    render(<AiSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Managing LLM providers and AI credentials requires administrator privileges/i)
    ).toBeInTheDocument();
  });

  it('renders AI configuration form with loaded settings for admin', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);

    vi.mocked(api.aiSettings.get).mockResolvedValue({
      data: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        hasGeminiKey: true,
        hasOpenAiKey: false,
        geminiApiKeyMasked: '••••••••Ab8R',
      },
    });

    render(<AiSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('LLM Provider')).toBeInTheDocument();
    });
    expect(screen.getByText('AI & LLM Configuration')).toBeInTheDocument();
    expect(screen.getByText('Active: GEMINI')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Google Gemini/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument();
    expect(screen.getByText(/Key Configured \(••••••••Ab8R\)/i)).toBeInTheDocument();

    // Check master enable toggle
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Check model presets
    expect(screen.getByText(/Gemini 3.8 Flash/i)).toBeInTheDocument();
  });

  it('switches provider and updates form values', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);

    vi.mocked(api.aiSettings.get).mockResolvedValue({
      data: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        hasGeminiKey: false,
        hasOpenAiKey: false,
      },
    });

    render(<AiSettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('LLM Provider')).toBeInTheDocument();
    });

    // Select OpenAI from dropdown
    const providerSelect = screen.getByLabelText('LLM Provider');
    fireEvent.change(providerSelect, { target: { value: 'openai' } });

    // Should switch to OpenAI model presets in the model select
    await waitFor(() => {
      expect(screen.getByText(/GPT-4o Mini/i)).toBeInTheDocument();
    });
  });

  it('submits updated settings to api.aiSettings.update', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);

    vi.mocked(api.aiSettings.get).mockResolvedValue({
      data: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        hasGeminiKey: false,
        hasOpenAiKey: false,
      },
    });

    vi.mocked(api.aiSettings.update).mockResolvedValueOnce({
      data: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        hasGeminiKey: true,
        hasOpenAiKey: false,
        geminiApiKeyMasked: '••••••••1234',
      },
    });

    render(<AiSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    // Type API key
    const keyInput = screen.getByPlaceholderText(/AIzaSy\.\.\. or AQ\.Ab8\.\.\./i);
    fireEvent.change(keyInput, { target: { value: 'AIzaSyTestApiKey1234' } });

    // Click Save
    const saveBtn = screen.getByText('Save Changes');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.aiSettings.update).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          provider: 'gemini',
          model: 'gemini-3.8-flash',
          geminiApiKey: 'AIzaSyTestApiKey1234',
        })
      );
      expect(screen.getByText(/AI configuration saved and activated successfully/i)).toBeInTheDocument();
    });
  });

  it('runs connection diagnostics and displays test result', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);

    vi.mocked(api.aiSettings.get).mockResolvedValue({
      data: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        hasGeminiKey: true,
        hasOpenAiKey: false,
      },
    });

    vi.mocked(api.aiSettings.test).mockResolvedValueOnce({
      data: {
        success: true,
        latencyMs: 180,
        message: 'LLM connection successful.',
      },
    });

    render(<AiSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });

    const testBtn = screen.getByText('Test Connection');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.aiSettings.test).toHaveBeenCalled();
      expect(screen.getByText('Connection Succeeded')).toBeInTheDocument();
      expect(screen.getByText(/Latency: 180ms/i)).toBeInTheDocument();
      expect(screen.getByText('LLM connection successful.')).toBeInTheDocument();
    });
  });

  it('renders Mobile & Phone Push Notifications card with controls', async () => {
    vi.mocked(api.auth.me).mockResolvedValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' },
    } as any);

    vi.mocked(api.aiSettings.get).mockResolvedValue({
      data: {
        enabled: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        maxTokens: 2048,
        hasGeminiKey: true,
        hasOpenAiKey: false,
      },
    });

    render(<AiSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Mobile & Phone Push Notifications')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Receive instant phone lock-screen push alerts whenever LLM calls fail/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Enable Push Notifications')).toBeInTheDocument();
  });
});
