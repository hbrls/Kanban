"use client";

import { useParams } from "next/navigation";

function readTeamRunParamsFromPathname() {
  if (typeof window === "undefined") {
    return null;
  }

  const match = window.location.pathname.match(/^\/workspace\/([^/]+)\/team\/([^/]+)/);
  if (!match) {
    return null;
  }

  return {
    workspaceId: match[1],
    sessionId: match[2],
  };
}

export function useRealTeamRunParams() {
  const params = useParams();
  const pathnameParams = readTeamRunParamsFromPathname();
  return {
    workspaceId: pathnameParams?.workspaceId ?? (params.workspaceId as string),
    sessionId: pathnameParams?.sessionId ?? (params.sessionId as string),
    isResolved: Boolean(pathnameParams) || (
      params.workspaceId !== "__placeholder__" && params.sessionId !== "__placeholder__"
    ),
  };
}
