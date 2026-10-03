"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Extract route params from URL pathname.
 * In static export mode, useParams() returns "__placeholder__" because that's what
 * was used in generateStaticParams(). We need to parse the actual URL instead.
 */
export function useRealSessionParams() {
  const params = useParams();
  const isPlaceholder =
    params.workspaceId === "__placeholder__" ||
    params.sessionId === "__placeholder__";

  const [realParams, setRealParams] = useState<{
    workspaceId: string;
    sessionId: string;
    isResolved: boolean;
  }>({
    workspaceId: params.workspaceId as string,
    sessionId: params.sessionId as string,
    isResolved: !isPlaceholder,
  });

  useEffect(() => {
    if (isPlaceholder) {
      const pathname = window.location.pathname;
      const match = pathname.match(/^\/workspace\/([^/]+)\/sessions\/([^/]+)/);
      if (match) {
        const newWorkspaceId = match[1];
        const newSessionId = match[2];
        if (
          newWorkspaceId !== realParams.workspaceId ||
          newSessionId !== realParams.sessionId ||
          !realParams.isResolved
        ) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- URL placeholder params must be resolved after mount
          setRealParams({
            workspaceId: newWorkspaceId,
            sessionId: newSessionId,
            isResolved: true,
          });
        }
      }
    } else {
      const newWorkspaceId = params.workspaceId as string;
      const newSessionId = params.sessionId as string;
      if (
        newWorkspaceId !== realParams.workspaceId ||
        newSessionId !== realParams.sessionId ||
        !realParams.isResolved
      ) {
        setRealParams({
          workspaceId: newWorkspaceId,
          sessionId: newSessionId,
          isResolved: true,
        });
      }
    }
  }, [params.workspaceId, params.sessionId, isPlaceholder, realParams]);

  return realParams;
}
