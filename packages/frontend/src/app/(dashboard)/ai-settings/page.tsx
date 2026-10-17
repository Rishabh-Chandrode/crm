'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type {
  LlmConfigSettings,
  LlmProviderType,
  TestLlmConnectionResult,
} from '@/lib/types';

const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', badge: 'Recommended', description: 'Fastest & latest generation for categorization & scoring' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'Legacy', description: 'Previous generation fast flash model' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', badge: 'Standard', description: 'Lightweight high-throughput model' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', badge: 'Complex', description: 'Multi-step reasoning and deep document parsing' },
];

const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', badge: 'Recommended', description: 'High speed, cost-effective multimodal flagship mini' },
  { id: 'gpt-4o', label: 'GPT-4o', badge: 'Flagship', description: 'Most intelligent standard OpenAI model' },
  { id: 'o3-mini', label: 'o3-mini', badge: 'Reasoning', description: 'Specialized reasoning and extraction model' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', badge: 'Legacy', description: 'Previous generation high-capability model' },
];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function AiSettingsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<TestLlmConnectionResult | null>(null);

  // Push Notification State
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [enabled, setEnabled] = useState(true);
  const [provider, setProvider] = useState<LlmProviderType>('gemini');
  const [model, setModel] = useState('gemini-3.8-flash');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2048);

  // API Key Inputs
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  // Saved State Info
  const [currentConfig, setCurrentConfig] = useState<LlmConfigSettings | null>(null);

  // Detect push notification support and active device subscription
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          setPushSubscribed(Boolean(sub));
        })
        .catch(() => {
          setPushSupported(false);
        });
    }
  }, []);

  async function handleTogglePush() {
    if (!pushSupported) return;
    setPushLoading(true);
    setPushStatusMsg(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();

      if (existingSub) {
        // Unsubscribe
        const endpoint = existingSub.endpoint;
        await existingSub.unsubscribe();
        await api.notifications.unsubscribe(endpoint);
        setPushSubscribed(false);
        setPushStatusMsg({ type: 'success', text: 'Push notifications disabled on this device.' });
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Notification permission was not granted by browser or device.');
        }

        const { publicKey } = await api.notifications.getVapidKey();
        const convertedKey = urlBase64ToUint8Array(publicKey);

        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as unknown as BufferSource,
        });

        const subJson = newSub.toJSON();
        if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
          throw new Error('Failed to extract valid push subscription keys.');
        }

        await api.notifications.subscribe({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          },
          userAgent: navigator.userAgent,
        });

        setPushSubscribed(true);
        setPushStatusMsg({
          type: 'success',
          text: 'Push notifications successfully activated on this device! You will receive alerts when LLM calls fail.',
        });
      }
    } catch (err) {
      setPushStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update push notification subscription',
      });
    } finally {
      setPushLoading(false);
    }
  }

  async function handleSendTestPush() {
    setPushTesting(true);
    setPushStatusMsg(null);
    try {
      const res = await api.notifications.test();
      setPushStatusMsg({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } catch (err) {
      setPushStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send test push notification',
      });
    } finally {
      setPushTesting(false);
    }
  }

  // Check admin privileges
  useEffect(() => {
    api.auth.me()
      .then((res) => {
        setIsAdmin(res.user?.role === 'admin');
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  const loadSettings = useCallback(async () => {
    if (isAdmin === false) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await api.aiSettings.get();
      const cfg = res.data;
      setCurrentConfig(cfg);
      setEnabled(cfg.enabled);
      setProvider(cfg.provider);
      setModel(cfg.model);
      setTemperature(cfg.temperature);
      setMaxTokens(cfg.maxTokens);

      const isKnown =
        (cfg.provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS).some((m) => m.id === cfg.model);
      setIsCustomModel(!isKnown);
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load AI configuration',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void loadSettings();
    }
  }, [isAdmin, loadSettings]);

  // Handle provider switch
  function handleProviderChange(newProvider: LlmProviderType) {
    setProvider(newProvider);
    setIsCustomModel(false);
    setTestResult(null);
    if (newProvider === 'openai') {
      setModel('gpt-4o-mini');
    } else if (newProvider === 'gemini') {
      setModel('gemini-3.8-flash');
    }
  }

  // Handle Save
  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    setTestResult(null);

    try {
      const payload = {
        enabled,
        provider,
        model: model.trim(),
        temperature,
        maxTokens,
        geminiApiKey: geminiApiKey.trim() || undefined,
        openaiApiKey: openaiApiKey.trim() || undefined,
      };

      const res = await api.aiSettings.update(payload);
      setCurrentConfig(res.data);
      setGeminiApiKey('');
      setOpenaiApiKey('');
      setStatusMsg({ type: 'success', text: 'AI configuration saved and activated successfully.' });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save AI configuration',
      });
    } finally {
      setSaving(false);
    }
  }

  // Handle Test Connection
  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    setStatusMsg(null);

    try {
      const apiKey = provider === 'openai' ? openaiApiKey.trim() : geminiApiKey.trim();
      const res = await api.aiSettings.test({
        provider,
        apiKey: apiKey || undefined,
        model: model.trim() || undefined,
      });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Connection test request failed',
      });
    } finally {
      setTesting(false);
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="max-w-md mx-auto mt-16 p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center shadow-xs">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Access Restricted</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Managing LLM providers and AI credentials requires administrator privileges.
          </p>
        </div>
      </div>
    );
  }

  const modelOptions = provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
  const hasActiveKey = provider === 'openai' ? currentConfig?.hasOpenAiKey : currentConfig?.hasGeminiKey;
  const maskedActiveKey = provider === 'openai' ? currentConfig?.openaiApiKeyMasked : currentConfig?.geminiApiKeyMasked;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              AI & LLM Configuration
            </h1>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                enabled && provider !== 'disabled'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {enabled && provider !== 'disabled' ? `Active: ${provider.toUpperCase()}` : 'Disabled'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Configure dynamic LLM provider settings, model architectures, and credentials from the admin panel without server restarts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSettings}
            disabled={loading || saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-6 h-6 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-400">Loading AI configuration from database...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Card 1: Master Enable Toggle */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Enable AI & LLM Processing
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-xl">
                  When enabled, incoming job emails, resumes, and interview updates are classified and analyzed using your configured LLM. When disabled, the CRM falls back to deterministic rule-based heuristics.
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  enabled ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-900 shadow-sm ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Card 2: Provider & Model Dropdowns */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                LLM Provider & Model Selector
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Select which AI intelligence backend and model architecture power email parsing, qualification scoring, and intent extraction.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Provider Dropdown */}
              <div>
                <label htmlFor="llm-provider-select" className="form-label text-xs">
                  LLM Provider
                </label>
                <select
                  id="llm-provider-select"
                  aria-label="LLM Provider"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as LlmProviderType)}
                  className="form-select text-xs w-full"
                >
                  <option value="gemini">Google Gemini (Recommended)</option>
                  <option value="openai">OpenAI</option>
                  <option value="disabled">Disabled / Heuristics</option>
                </select>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {provider === 'gemini' && 'Official Gemini REST endpoint with high JSON adherence.'}
                  {provider === 'openai' && 'Standard OpenAI ChatCompletions API endpoint.'}
                  {provider === 'disabled' && 'Bypasses external LLMs; uses local regex rules.'}
                </p>
              </div>

              {/* Model Dropdown */}
              {provider !== 'disabled' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="llm-model-select" className="form-label text-xs !mb-0">
                      Model Architecture
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isCustomModel;
                        setIsCustomModel(next);
                        if (!next) {
                          setModel(provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.8-flash');
                        }
                      }}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {isCustomModel ? 'Select from presets' : 'Enter custom ID'}
                    </button>
                  </div>

                  {!isCustomModel ? (
                    <select
                      id="llm-model-select"
                      aria-label="Model Architecture"
                      value={model}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomModel(true);
                        } else {
                          setModel(e.target.value);
                        }
                      }}
                      className="form-select text-xs w-full"
                    >
                      {modelOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.badge})
                        </option>
                      ))}
                      <option value="__custom__">Custom model identifier...</option>
                    </select>
                  ) : (
                    <input
                      id="llm-custom-model-input"
                      aria-label="Custom Model ID"
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={provider === 'openai' ? 'e.g. gpt-4o-2024-11-20' : 'e.g. gemini-3.8-flash'}
                      className="form-input text-xs font-mono w-full"
                    />
                  )}

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    {!isCustomModel
                      ? modelOptions.find((m) => m.id === model)?.description ?? 'Selected model architecture.'
                      : 'Enter any valid model identifier accepted by the provider API.'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col justify-end">
                  <div className="h-9 px-3 flex items-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 italic">
                    External models disabled (heuristics active)
                  </div>
                </div>
              )}
            </div>
          </div>

          {provider !== 'disabled' && (
            <>
              {/* Card 3: API Key Field */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      API Credentials ({provider.toUpperCase()})
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Stored encrypted in the PostgreSQL database. Keys are redacted from all logging telemetry.
                    </p>
                  </div>

                  {hasActiveKey ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Key Configured ({maskedActiveKey})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      No Key Configured
                    </span>
                  )}
                </div>

                {provider === 'gemini' ? (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Google Gemini API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder={
                          hasActiveKey
                            ? 'Leave blank to keep existing configured key'
                            : 'AIzaSy... or AQ.Ab8...'
                        }
                        className="w-full pl-3 pr-20 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 py-0.5 rounded"
                      >
                        {showGeminiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      OpenAI API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showOpenAiKey ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder={
                          hasActiveKey
                            ? 'Leave blank to keep existing configured key'
                            : 'sk-proj-...'
                        }
                        className="w-full pl-3 pr-20 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 py-0.5 rounded"
                      >
                        {showOpenAiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 5: Other Configuration (Hyperparameters) */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Inference Parameters & Generation Controls
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Fine-tune LLM creativity and generation token constraints for consistent, cost-controlled parsing.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Temperature */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Temperature: <span className="font-mono text-zinc-900 dark:text-zinc-100">{temperature.toFixed(2)}</span>
                      </label>
                      <span className="text-[10px] text-zinc-400">
                        {temperature <= 0.2 ? 'Deterministic / Strict' : temperature <= 0.6 ? 'Balanced' : 'Creative'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-zinc-900 dark:accent-zinc-100 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                      <span>0.0 (Strict JSON)</span>
                      <span>0.5</span>
                      <span>1.0 (Creative)</span>
                    </div>
                  </div>

                  {/* Max Output Tokens */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Max Output Tokens
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="256"
                        max="32000"
                        step="256"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 2048)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-hidden focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                      />
                      <div className="flex gap-1">
                        {[1024, 2048, 4096].map((tok) => (
                          <button
                            key={tok}
                            type="button"
                            onClick={() => setMaxTokens(tok)}
                            className={`px-2 py-1 text-[10px] rounded-lg border font-mono transition-colors ${
                              maxTokens === tok
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold'
                                : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                          >
                            {tok}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 6: Live Diagnostics & Connection Test */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Live Connection & Model Diagnostics
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Execute an immediate test completion to verify that your API key and model identifier are operational.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing || saving}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 shrink-0"
                  >
                    {testing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Test Connection
                      </>
                    )}
                  </button>
                </div>

                {/* Test Result Display */}
                {testResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                      testResult.success
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200'
                        : 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-800/80 text-red-900 dark:text-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${testResult.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {testResult.success ? 'Connection Succeeded' : 'Connection Failed'}
                      </span>
                      {typeof testResult.latencyMs === 'number' && (
                        <span className="font-mono text-[11px] opacity-80">
                          Latency: {testResult.latencyMs}ms
                        </span>
                      )}
                    </div>
                    {testResult.message && (
                      <p className="text-[11px] font-mono bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg border border-emerald-200/50 dark:border-emerald-800/50">
                        {testResult.message}
                      </p>
                    )}
                    {testResult.error && (
                      <p className="text-[11px] font-mono bg-white/60 dark:bg-zinc-900/60 p-2 rounded-lg border border-red-200/50 dark:border-red-800/50 break-words">
                        {testResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Card 7: Mobile & Phone Push Notifications */}
              <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Mobile & Phone Push Notifications
                      </h3>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          pushSubscribed
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        {pushSubscribed ? 'Active on this Device' : 'Not Subscribed'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-xl">
                      Receive instant phone lock-screen push alerts whenever LLM calls fail, models are deprecated, or quota limits are hit on your installed app.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {pushSubscribed && (
                      <button
                        type="button"
                        onClick={handleSendTestPush}
                        disabled={pushTesting || pushLoading}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors shadow-2xs disabled:opacity-50"
                      >
                        {pushTesting ? 'Sending…' : 'Send Test Alert'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleTogglePush}
                      disabled={pushLoading}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all shadow-2xs disabled:opacity-50 ${
                        pushSubscribed
                          ? 'border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                          : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'
                      }`}
                    >
                      {pushLoading
                        ? 'Updating…'
                        : pushSubscribed
                        ? 'Disable on this Device'
                        : 'Enable Push Notifications'}
                    </button>
                  </div>
                </div>

                {pushStatusMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                      pushStatusMsg.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    }`}
                  >
                    <span>{pushStatusMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setPushStatusMsg(null)}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Save Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={loadSettings}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Cancel / Revert
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-zinc-900 border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
