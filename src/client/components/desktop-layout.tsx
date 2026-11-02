"use client";

/**
 * Desktop Layout — Main layout wrapper for Tauri desktop application.
 *
 * Provides a native desktop app feel with:
 * - Compact title bar with window controls area
 * - Left sidebar navigation (VS Code style)
 * - Main content area
 */

import React from "react";
import { DesktopSidebar } from "./desktop-sidebar";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { DesktopShellHeader } from "./desktop-shell-header";
import type { WorkspaceData } from "@/client/hooks/use-workspaces";

interface DesktopLayoutProps {
  children: React.ReactNode;
  workspaceId: string;
  workspaces: WorkspaceData[];
  activeWorkspaceTitle?: string;
  workspacesLoading?: boolean;
  onWorkspaceSelect: (wsId: string) => void;
  onWorkspaceCreate: (title: string) => Promise<void>;
  /** Optional right side content for the title bar */
  titleBarRight?: React.ReactNode;
}

export function DesktopLayout({
  children,
  workspaceId,
  workspaces,
  activeWorkspaceTitle,
  workspacesLoading,
  onWorkspaceSelect,
  onWorkspaceCreate,
  titleBarRight,
}: DesktopLayoutProps) {
  return (
    <div
      className="desktop-theme h-screen flex flex-col overflow-hidden bg-desktop-bg-primary"
      data-testid="desktop-shell-root"
    >
      <DesktopShellHeader
        workspaceId={workspaceId}
        titleBarRight={titleBarRight}
        workspaceSwitcher={(
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspaceId={workspaceId}
            activeWorkspaceTitle={activeWorkspaceTitle}
            onSelect={onWorkspaceSelect}
            onCreate={onWorkspaceCreate}
            loading={workspacesLoading}
            compact
          />
        )}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0" data-testid="desktop-shell-body">
        {/* Left Sidebar Navigation */}
        <DesktopSidebar
          workspaceId={workspaceId}
        />

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-hidden bg-desktop-bg-primary" data-testid="desktop-shell-main">
          {children}
        </main>
      </div>
    </div>
  );
}
