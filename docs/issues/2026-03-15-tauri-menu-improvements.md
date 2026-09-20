---
date: 2026-03-15
title: Tauri Desktop Menu Improvements
status: resolved
area: desktop
labels: [enhancement, tauri, ux]
---

# Tauri Desktop Menu Improvements

## Summary

Enhanced the Tauri desktop application menu structure with better navigation and tool mode control.

## Changes Implemented

### 1. Developer Mode → System Menu ✅

**Before**: Tool Mode toggle was in the session page header (UI element)
**After**: Moved to View menu with keyboard shortcut

- **Menu Location**: View → Toggle Tool Mode (Essential/Full)
- **Keyboard Shortcut**: `Cmd+Shift+T` (macOS) / `Ctrl+Shift+T` (Windows/Linux)
- **Behavior**: 
  - Fetches current mode from `/api/mcp/tools`
  - Toggles between `essential` (7 tools) and `full` (34 tools)
  - Automatically reloads page to reflect changes
  - Console logs the new mode for debugging

**Benefits**:
- Accessible from any page, not just session pages
- Follows desktop app conventions (system menu > UI toggle)
- Keyboard shortcut for power users
- No need to navigate to session page to change mode

### 2. Navigation Menu ✅

Added a new "Navigate" menu with keyboard shortcuts for common pages:

| Menu Item | Shortcut | Target |
|-----------|----------|--------|
| Dashboard | `Cmd+1` | `/workspace/{workspaceId}` |
| Kanban Board | `Cmd+2` | `/workspace/{workspaceId}/kanban` |
| Agent Traces | `Cmd+3` | `/traces` |
| Settings | `Cmd+,` | `/settings` |

**Smart Workspace Detection**:
- Dashboard and Kanban items detect current workspace ID from URL
- Falls back to default workspace if not in a workspace context
- Uses JavaScript to extract workspace ID: `/workspace/([^/]+)/`

**Benefits**:
- Quick navigation without mouse clicks
- Standard keyboard shortcuts (Cmd+1, Cmd+2, etc.)
- Cmd+, for Settings follows macOS convention

### 3. Menu Structure Optimization ✅

**New Menu Structure**:

```
File
├── Reload (Cmd+R)
└── Quit (Cmd+Q)

View
├── Toggle Developer Tools (Cmd+Option+I)
└── Toggle Tool Mode (Essential/Full) (Cmd+Shift+T)  ← NEW

Navigate  ← NEW MENU
├── Dashboard (Cmd+1)
├── Kanban Board (Cmd+2)
├── Agent Traces (Cmd+3)
└── Settings (Cmd+,)

Tools
├── Install Agents... (Cmd+Shift+I)
└── MCP Tools (Cmd+Shift+M)
```

**Benefits**:
- Logical grouping of menu items
- Separate navigation from tools
- Consistent keyboard shortcuts
- Follows desktop app best practices

## Technical Implementation

### File Modified
- `apps/desktop/src-tauri/src/lib.rs`

### Key Code Sections

1. **Menu Item Creation** (lines 661-699):
   - `toggle_tool_mode`: Toggle between essential/full mode
   - `nav_dashboard`, `nav_kanban`, `nav_traces`, `nav_settings`: Navigation items

2. **Menu Event Handlers** (lines 782-867):
   - `toggle_tool_mode`: Async fetch + PATCH + reload
   - `nav_*`: JavaScript-based navigation with workspace ID detection

### Testing

Manual testing confirmed:
- ✅ All menu items appear correctly
- ✅ Keyboard shortcuts work
- ✅ Tool mode toggle works (essential ↔ full)
- ✅ Navigation items work from any page
- ✅ Workspace ID detection works correctly
- ✅ Settings shortcut (Cmd+,) follows macOS convention

## Future Enhancements

Potential improvements for future iterations:

1. **Dynamic Menu State**:
   - Show checkmark next to current tool mode (Essential/Full)
   - Disable navigation items when already on that page
   - Show current workspace name in menu

2. **Additional Navigation**:
   - Recent sessions submenu
   - Workspace switcher in menu
   - Quick access to recent files

3. **Tool Mode Indicator**:
   - Menu bar icon showing current mode
   - Notification when mode changes

## Related Issues

- Original request: User feedback on desktop UX
- Related: Developer mode should be in system menu
- Related: Need keyboard shortcuts for navigation

## Commit

```
commit eac6323
feat(tauri): add system menu for tool mode and navigation
```
