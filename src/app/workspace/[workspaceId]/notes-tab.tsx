"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n";
import { formatRelativeTime } from "./ui-components";
import type { NoteData } from "@/client/hooks/use-notes";
import type { SessionInfo } from "./types";
import { ChevronRight, Plus, Trash2, NotebookText, SquarePen } from "lucide-react";


type NotesTabProps = {
  notes: NoteData[];
  loading: boolean;
  workspaceId: string;
  sessions: SessionInfo[];
  onCreateNote: (title: string, content: string, sessionId?: string) => Promise<void>;
  onUpdateNote: (noteId: string, update: { title?: string; content?: string }) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onDeleteAllNotes: () => Promise<void>;
};

export function NotesTab({
  notes,
  loading,
  workspaceId,
  sessions,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteAllNotes,
}: NotesTabProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newSessionId, setNewSessionId] = useState("");
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [clearingNotes, setClearingNotes] = useState(false);

  const sortedNotes = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleSubmit = async () => {
    if (!newTitle.trim()) return;
    setCreateLoading(true);
    try {
      await onCreateNote(newTitle.trim(), newContent.trim(), newSessionId || undefined);
      setNewTitle(""); setNewContent(""); setNewSessionId(""); setShowForm(false);
    } finally { setCreateLoading(false); }
  };

  const handleEdit = async (noteId: string) => {
    if (!editForm.title.trim()) return;
    setEditLoading(true);
    try {
      await onUpdateNote(noteId, { title: editForm.title.trim(), content: editForm.content });
      setEditingNoteId(null);
    } finally { setEditLoading(false); }
  };

  const handleDelete = async (noteId: string) => {
    setDeletingNoteId(noteId);
    try { await onDeleteNote(noteId); }
    finally { setDeletingNoteId(null); }
  };

  const handleClearAll = async () => {
    setClearingNotes(true);
    try { await onDeleteAllNotes(); }
    finally { setClearingNotes(false); }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t.notesTab.workspaceNotes}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t.notesTab.freeformContext}: <span className="font-mono">{workspaceId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {notes.length > 0 && (
            <button onClick={handleClearAll} disabled={clearingNotes}
              className="text-[11px] text-red-500 dark:text-red-400 hover:text-red-600 transition-colors disabled:opacity-50">
              {clearingNotes ? t.notesTab.clearing : t.notesTab.clearAll}
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
            <Plus className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            {t.notesTab.newNote}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-4 bg-white dark:bg-[#12141c] rounded-xl border border-slate-200/60 dark:border-[#1c1f2e]">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t.notesTab.noteTitle}
            className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-500/30 transition"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t.notesTab.writePlaceholder}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-500/30 transition resize-none font-mono text-[13px]"
          />
          {sessions.length > 0 && (
            <div className="mt-3">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {t.notesTab.bindToSession} <span className="font-normal text-slate-400">{t.notesTab.optional}</span>
              </label>
              <select value={newSessionId} onChange={(e) => setNewSessionId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-[13px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">{t.notesTab.workspaceWide}</option>
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>{s.name || s.provider || s.sessionId.slice(0, 12)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={handleSubmit} disabled={!newTitle.trim() || createLoading}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 transition-colors shadow-sm">
              {createLoading ? t.notesTab.creating : t.notesTab.createNote}
            </button>
            <button onClick={() => { setShowForm(false); setNewTitle(""); setNewContent(""); setNewSessionId(""); }}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">{t.notesTab.loadingNotes}</div>
      ) : sortedNotes.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <NotebookText className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}/>
          <p className="text-sm font-medium">{t.notesTab.noNotesYet}</p>
          <p className="text-[12px] mt-1">{t.notesTab.noNotesDescription}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedNotes.map((note) => {
            const isExpanded = expandedNote === note.id;
            const isEditing = editingNoteId === note.id;
            return (
              <div key={note.id} className="bg-white dark:bg-[#12141c] rounded-xl border border-slate-200/60 dark:border-[#1c1f2e] overflow-hidden hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setExpandedNote(isExpanded ? null : note.id)} className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
                  </button>
                  <span className="flex-1 text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate">{note.title}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">{t.notesTab.noteLabel}</span>
                  {note.sessionId && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0 truncate max-w-[80px]" title={note.sessionId}>
                      {note.sessionId.slice(0, 8)}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono shrink-0 w-12 text-right">{formatRelativeTime(note.updatedAt)}</span>
                  <button onClick={() => { setEditingNoteId(note.id); setEditForm({ title: note.title, content: note.content }); setExpandedNote(note.id); }}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#191c28] text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                    <SquarePen className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
                  </button>
                  <button onClick={() => handleDelete(note.id)} disabled={deletingNoteId === note.id}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-[#191c28]">
                    {isEditing ? (
                      <div className="mt-3 space-y-2">
                        <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30" />
                        <textarea rows={8} value={editForm.content} onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30 resize-none font-mono" />
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(note.id)} disabled={editLoading || !editForm.title.trim()}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 transition-colors">
                            {editLoading ? t.notesTab.saving : t.common.save}
                          </button>
                          <button onClick={() => setEditingNoteId(null)}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                            {t.common.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="mt-3 text-[12px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono leading-relaxed max-h-56 overflow-y-auto">
                        {note.content || "(empty)"}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
