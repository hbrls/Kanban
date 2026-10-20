---
title: "[GitHub #105] feat: Implement conversation share feature (similar to opencode.ai)"
date: "2026-03-10"
status: resolved
severity: medium
area: "frontend"
tags: ["github", "github-sync", "gh-105", "enhancement", "area-frontend", "area-backend", "area-database", "complexity-medium"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/105"]
github_issue: 105
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/105"
---

# [GitHub #105] feat: Implement conversation share feature (similar to opencode.ai)

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #105
- URL: https://github.com/phodal/routa/issues/105
- State: closed
- Author: phodal
- Created At: 2026-03-10T05:40:46Z
- Updated At: 2026-03-10T05:44:09Z

## Labels

- `enhancement`
- `area:frontend`
- `area:backend`
- `area:database`
- `complexity:medium`

## Original GitHub Body

# Problem

Implement a conversation sharing feature similar to [opencode.ai's share functionality](https://opencode.ai/docs/zh-cn/share/). This will allow users to create public URLs for their Routa sessions to share with collaborators or for debugging purposes.

## Context

**Current Behavior:**
- Sessions are stored privately in the database (`acp_sessions` and `session_messages` tables)
- No mechanism to share sessions publicly
- Users must export session data manually to share conversations

**Desired Behavior:**
- Users can generate unique public URLs for their sessions (e.g., `example.com/s/<share-id>`)
- Supports three sharing modes:
  - **Manual (default)**: User explicitly chooses to share a session via UI or command
  - **Auto**: All new sessions are automatically shareable
  - **Disabled**: Sharing is completely disabled
- Users can unshare sessions to remove public access
- Optional expiration dates for shared links
- Optional access controls (password, SSO-only for enterprise)

**Use Cases:**
- Share debugging sessions with team members
- Get help from others on a complex task
- Document successful workflows
- Code review and collaboration

## Relevant Files

**Database Schema:**
- `src/core/db/schema.ts` - Add `shared_sessions` table

**Storage Layer:**
- `src/core/storage/types.ts` - Session storage interfaces
- `src/core/storage/remote-session-provider.ts` - Postgres session provider

**API Routes to Create:**
- `src/app/api/share/session/route.ts` - Create share link (POST)
- `src/app/api/share/[id]/route.ts` - Get/delete share (GET/DELETE)
- `src/app/s/[id]/page.tsx` - Public shared session view

**Frontend Components:**
- `src/client/components/share-panel.tsx` - Share management UI
- Update `src/client/components/chat-panel.tsx` - Add share button
- Update `src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx` - Integrate share UI

## Proposed Approaches

### Approach 1: Full Server-Side Implementation (Recommended)

**Libraries:** None required - uses existing Drizzle ORM and Next.js routing

**Implementation:**
1. **Database Schema** - Add `shared_sessions` table:
   ```sql
   CREATE TABLE shared_sessions (
     id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL REFERENCES acp_sessions(id) ON DELETE CASCADE,
     share_id TEXT NOT NULL UNIQUE,  -- Public URL identifier (nanoid/UUID)
     created_by TEXT,
     expires_at TIMESTAMPTZ,
     access_mode TEXT DEFAULT 'public',  -- public | password | sso
     password_hash TEXT,  -- bcrypt for password-protected shares
     view_count INTEGER DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **API Endpoints**:
   - `POST /api/share/session` - Create share, returns `{ shareId, url, expiresAt }`
   - `GET /api/share/[id]` - Get shared session (authentication optional)
   - `DELETE /api/share/[id]` - Unshare session
   - `GET /s/[id]` - Public view of shared session (read-only)

3. **Share Mode Configuration**:
   - Add to `workspaces` table: `shareMode TEXT DEFAULT 'manual'`
   - Add to user settings: `defaultShareMode TEXT`
   - For auto-mode: hook into session creation flow

4. **Frontend**:
   - Share button in chat panel
   - Share modal with: copy link, set expiration, unshare
   - Public view page (read-only, similar to opencode)

**Pros:**
- Full control over data and access
- Works with existing database architecture
- Can implement access controls, expiration, analytics
- Easy to extend for enterprise features (SSO, domain allowlist)

**Cons:**
- Requires server-side storage (won't work in pure desktop mode)
- More complex to implement (database migrations, multiple endpoints)

**Estimated effort**: Medium (2-3 days)

---

### Approach 2: Client-Side Export + External Hosting

**Libraries:** 
- `nanoid` - Generate short share IDs
- Optional: GitHub Gist API, Pastebin, or generic paste service

**Implementation:**
1. Export session data as JSON/Markdown
2. Upload to external service (GitHub Gist, private paste bin)
3. Generate shareable URL
4. Store share metadata in local storage or database

**Pros:**
- Simpler implementation
- No additional database storage
- Can work offline (export to file)
- Leverages existing external services

**Cons:**
- Data stored externally (privacy concerns)
- Dependent on third-party services
- Limited access controls
- No real-time updates once shared
- Share link breaks if external service goes down

**Estimated effort**: Small (1-2 days)

---

### Approach 3: Hybrid - Session Snapshots

**Libraries:** `nanoid`, existing Drizzle ORM

**Implementation:**
1. Create immutable snapshot of session at share time
2. Store snapshot in `shared_sessions` table (JSONB)
3. Original session can be deleted/modified without affecting share
4. Public view renders snapshot data

**Database Schema:**
```sql
CREATE TABLE shared_sessions (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL UNIQUE,
  session_snapshot JSONB NOT NULL,  -- Immutable snapshot
  metadata JSONB,  -- Title, description, tags
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Pros:**
- Shared content is immutable (safe for long-term sharing)
- Original session changes don't affect shares
- Can add metadata (title, description) to shares
- No foreign key dependency on original session

**Cons:**
- Data duplication (snapshot copies session data)
- Share doesn't reflect updates to original session
- More storage usage
- Can't "live sync" shared sessions

**Estimated effort**: Medium (2-3 days)

## Recommendation

**Start with Approach 1 (Full Server-Side Implementation)** for the following reasons:

1. **Matches opencode's functionality** - This is the closest implementation to what was requested
2. **Architectural alignment** - Works with existing Postgres database and Drizzle ORM
3. **Future flexibility** - Easy to add features like password protection, expiration, analytics
4. **Enterprise readiness** - Can extend for SSO-only shares, domain allowlists

**Phase 1 MVP** (Manual mode only):
- Create `shared_sessions` table
- Implement POST/GET/DELETE API endpoints
- Add share button and modal to UI
- Create public view page at `/s/[id]`

**Phase 2** (Auto mode + Settings):
- Add workspace/user share mode settings
- Implement auto-share on session creation
- Add share management panel in settings

**Phase 3** (Enterprise features):
- Password protection
- SSO-only access
- Domain allowlist
- Analytics (view count, access logs)

## Out of Scope

- Real-time collaboration on shared sessions (like Google Docs)
- Edit access to shared sessions (shares are read-only)
- Social features (comments, likes on shares)
- Share discovery/browsing (shares are accessed via direct link only)
- Desktop-only implementation (requires server component)

## Labels

`enhancement`, `area:backend`, `area:frontend`, `area:database`, `complexity:medium`
