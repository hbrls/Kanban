"use client";

import { useState, useEffect, useCallback } from "react";
import { desktopAwareFetch } from "../utils/diagnostics";
import { Select } from "./select";
import { useTranslation } from "@/i18n";
import { SquarePen, Trash2, X, Briefcase } from "lucide-react";


// ─── Types ─────────────────────────────────────────────────────────────────

export interface SpecialistConfig {
  id: string;
  name: string;
  description?: string;
  role: AgentRole;
  defaultModelTier: ModelTier;
  systemPrompt: string;
  roleReminder: string;
  source: "user" | "bundled" | "hardcoded";
  enabled?: boolean;
  defaultProvider?: string;
  defaultAdapter?: string;
  model?: string;
}

export type AgentRole = "ROUTA" | "CRAFTER" | "GATE" | "DEVELOPER";
export type ModelTier = "FAST" | "BALANCED" | "SMART";

// Helper functions to get labels from translation
function getRoleLabels(t: ReturnType<typeof useTranslation>["t"]): Record<AgentRole, string> {
  return {
    ROUTA: t.specialists.coordinator,
    CRAFTER: t.specialists.implementor,
    GATE: t.specialists.verifier,
    DEVELOPER: t.specialists.developer,
  };
}

function getRoleDescriptions(t: ReturnType<typeof useTranslation>["t"]): Record<AgentRole, string> {
  return {
    ROUTA: t.specialists.coordinatorDesc,
    CRAFTER: t.specialists.implementorDesc,
    GATE: t.specialists.verifierDesc,
    DEVELOPER: t.specialists.developerDesc,
  };
}

function getTierLabels(t: ReturnType<typeof useTranslation>["t"]): Record<ModelTier, string> {
  return {
    FAST: t.specialists.fast,
    BALANCED: t.specialists.balanced,
    SMART: t.specialists.smart,
  };
}

// ─── Component Props ───────────────────────────────────────────────────────

interface SpecialistManagerProps {
  open: boolean;
  onClose: () => void;
}

interface SpecialistForm {
  id: string;
  name: string;
  description: string;
  role: AgentRole;
  defaultModelTier: ModelTier;
  systemPrompt: string;
  roleReminder: string;
  defaultProvider: string;
  defaultAdapter: string;
  model?: string;
}

// ─── Specialist Manager Component ───────────────────────────────────────────

export function SpecialistManager({ open, onClose }: SpecialistManagerProps) {
  const { t } = useTranslation();
  const requiresPostgresMessage = t.specialists.requiresPostgres;
  const failedToLoadMessage = t.specialists.failedToLoad;
  const [specialists, setSpecialists] = useState<SpecialistConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [form, setForm] = useState<SpecialistForm>({
    id: "",
    name: "",
    description: "",
    role: "CRAFTER",
    defaultModelTier: "BALANCED",
    systemPrompt: "",
    roleReminder: "",
    defaultProvider: "",
    defaultAdapter: "",
    model: "",
  });

  const loadSpecialists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await desktopAwareFetch("/api/specialists");
      if (!response.ok) {
        if (response.status === 501) {
          setError(requiresPostgresMessage);
        } else {
          throw new Error(failedToLoadMessage);
        }
        return;
      }
      const data = await response.json();
      setSpecialists(data.specialists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : failedToLoadMessage);
    } finally {
      setLoading(false);
    }
  }, [failedToLoadMessage, requiresPostgresMessage]);

  // Load specialists on open
  useEffect(() => {
    if (open) {
      void loadSpecialists();
    }
  }, [open, loadSpecialists]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await desktopAwareFetch("/api/specialists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      if (!response.ok) throw new Error(t.specialists.failedToSync);
      await loadSpecialists();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.specialists.failedToSync);
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await desktopAwareFetch("/api/specialists", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t.specialists.failedToSave);
      }
      await loadSpecialists();
      setEditingId(null);
      setShowCreateForm(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.specialists.failedToSave);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.specialists.deleteConfirm)) return;
    setLoading(true);
    setError(null);
    try {
      const response = await desktopAwareFetch(`/api/specialists?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(t.specialists.failedToDelete);
      await loadSpecialists();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.specialists.failedToDelete);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (specialist: SpecialistConfig) => {
    setEditingId(specialist.id);
    setForm({
      id: specialist.id,
      name: specialist.name,
      description: specialist.description || "",
      role: specialist.role,
      defaultModelTier: specialist.defaultModelTier,
      systemPrompt: specialist.systemPrompt,
      roleReminder: specialist.roleReminder,
      defaultProvider: specialist.defaultProvider || "",
      defaultAdapter: specialist.defaultAdapter || "",
      model: specialist.model || "",
    });
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setForm({
      id: "",
      name: "",
      description: "",
      role: "CRAFTER",
      defaultModelTier: "BALANCED",
      systemPrompt: "",
      roleReminder: "",
      defaultProvider: "",
      defaultAdapter: "",
      model: "",
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowCreateForm(false);
    resetForm();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-[#1a1d2e] rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.specialists.manageSpecialists}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              {syncing ? `${t.common.loading}...` : t.specialists.sync}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!showCreateForm ? (
            <>
              {/* Specialists List */}
              <div className="mb-4 flex justify-between items-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {specialists.length} {t.specialists.configured}
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  {t.specialists.newSpecialist}
                </button>
              </div>

              <div className="space-y-3">
                {specialists.map((specialist) => (
                  <div
                    key={specialist.id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-slate-900 dark:text-slate-100">{specialist.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            specialist.source === "user"
                              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                              : specialist.source === "bundled"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                          }`}>
                            {t.specialists.source[specialist.source] || specialist.source}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {getRoleLabels(t)[specialist.role]}
                          </span>
                        </div>
                        {specialist.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{specialist.description}</p>
                        )}
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 dark:text-slate-500">
                            {t.specialists.tier}: {getTierLabels(t)[specialist.defaultModelTier]}
                          </p>
                          {specialist.defaultProvider ? (
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                              {t.specialists.provider}: <span className="font-mono">{specialist.defaultProvider}</span>
                            </p>
                          ) : null}
                          {specialist.defaultAdapter ? (
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                              {t.specialists.adapter}: <span className="font-mono">{specialist.defaultAdapter}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {specialist.source === "user" && (
                          <>
                            <button
                              onClick={() => handleEdit(specialist)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                            >
                              <SquarePen className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
                            </button>
                            <button
                              onClick={() => handleDelete(specialist.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {specialists.length === 0 && !loading && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <p>{t.specialists.noSpecialistsFound} {t.specialists.noSpecialistsHint}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Create/Edit Form */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                  {editingId ? t.specialists.editSpecialist : t.specialists.newSpecialistForm}
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {/* ID */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.specialists.id} *
                    </label>
                    <input
                      type="text"
                      value={form.id}
                      onChange={(e) => setForm({ ...form, id: e.target.value })}
                      disabled={!!editingId}
                      placeholder={t.specialists.idPlaceholder}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-800"
                    />
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.specialists.name} *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={t.specialists.namePlaceholder}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t.specialists.description}
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder={t.specialists.descriptionPlaceholder}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Role */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.specialists.role} *
                    </label>
                    <Select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as AgentRole })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100"
                    >
                      {Object.entries(getRoleLabels(t)).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label} - {getRoleDescriptions(t)[key as AgentRole]}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Model Tier */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.specialists.defaultModelTier} *
                    </label>
                    <Select
                      value={form.defaultModelTier}
                      onChange={(e) => setForm({ ...form, defaultModelTier: e.target.value as ModelTier })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100"
                    >
                      {Object.entries(getTierLabels(t)).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Default Provider */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.specialists.defaultAcpProvider}
                    </label>
                    <input
                      type="text"
                      value={form.defaultProvider}
                      onChange={(e) => setForm({ ...form, defaultProvider: e.target.value })}
                      placeholder={t.specialists.defaultProviderPlaceholder}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t.specialists.defaultProviderHint}
                    </p>
                  </div>

                  {/* Default Adapter */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t.specialists.defaultAdapterLabel}
                    </label>
                    <input
                      type="text"
                      value={form.defaultAdapter}
                      onChange={(e) => setForm({ ...form, defaultAdapter: e.target.value })}
                      placeholder={t.specialists.defaultAdapterPlaceholder}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t.specialists.defaultAdapterHint}
                    </p>
                  </div>
                </div>

                {/* Model Override */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t.specialists.modelOverride}
                  </label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder={t.specialists.modelOverridePlaceholder}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t.specialists.modelOverrideHint}
                  </p>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t.specialists.systemPromptLabel} *
                  </label>
                  <textarea
                    value={form.systemPrompt}
                    onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                    placeholder={t.specialists.systemPromptPlaceholder}
                    rows={8}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 font-mono"
                  />
                </div>

                {/* Role Reminder */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t.specialists.roleReminderLabel}
                  </label>
                  <input
                    type="text"
                    value={form.roleReminder}
                    onChange={(e) => setForm({ ...form, roleReminder: e.target.value })}
                    placeholder={t.specialists.roleReminderPlaceholder}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleCancelEdit}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {t.specialists.cancel}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading || !form.id || !form.name || !form.systemPrompt}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? t.specialists.saving : editingId ? t.common.update : t.common.create}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
