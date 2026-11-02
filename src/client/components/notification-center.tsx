"use client";

/**
 * NotificationCenter - In-app notification system
 * 
 * Features:
 * - Persistent notifications (require user click to dismiss)
 * - Bell icon with unread count badge
 * - Dropdown panel showing all notifications
 * - Links to message center for full history
 */

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useTranslation } from "@/i18n";
import { Bell } from "lucide-react";


// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: "pr_review" | "webhook" | "task" | "info" | "error";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("routa_notifications");
    if (!stored) return [];
    try {
      return JSON.parse(stored) as AppNotification[];
    } catch {
      return [];
    }
  });

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem("routa_notifications", JSON.stringify(notifications.slice(0, 100)));
  }, [notifications]);

  const addNotification = useCallback((n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
    const newNotif: AppNotification = {
      ...n,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Bell Icon with Dropdown ─────────────────────────────────────────────────

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const init = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearTimeout(init);
      clearInterval(id);
    };
  }, []);

  const formatTime = (ts: string) => {
    if (!now) return "now";
    const diff = now - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getTypeIcon = (type: AppNotification["type"]) => {
    switch (type) {
      case "pr_review": return "🔍";
      case "webhook": return "🔔";
      case "task": return "✓";
      case "error": return "⚠️";
      default: return "ℹ️";
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#151720] transition-colors"
        title={t.notifications.title}
      >
        <Bell className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden bg-white dark:bg-[#12141c] border border-slate-200 dark:border-[#1c1f2e] rounded-xl shadow-xl z-50">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-[#1c1f2e] flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.notifications.title}</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                    {t.notifications.markAllRead}
                  </button>
                )}
                <a href="/messages" className="text-[10px] text-amber-600 dark:text-amber-500 hover:underline">
                  {t.notifications.viewAll}
                </a>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">{t.notifications.empty}</div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { markAsRead(n.id); if (n.link) window.location.href = n.link; }}
                    className={`w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#171a24] transition-colors border-b border-slate-50 dark:border-[#171a24] last:border-0 ${!n.read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm">{getTypeIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{n.title}</span>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{n.message}</p>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatTime(n.timestamp)}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
