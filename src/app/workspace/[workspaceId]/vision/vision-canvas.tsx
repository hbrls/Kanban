"use client";

/**
 * Vision canvas: a React Flow surface rendering a workspace's demo graph.
 * In-memory only — no API calls, no persistence. Node dragging, selection,
 * pan/zoom and fit-view are enabled; node/edge creation and deletion are
 * disabled. Nodes only move horizontally: X snaps to the background grid and
 * Y stays pinned to the node's grid row. The canvas is remounted by the page
 * (`key={workspaceId}`) when the workspace route changes, so React Flow state
 * never leaks across workspaces.
 */
import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";

import { useTranslation } from "@/i18n";
import { TaskNode } from "./task-node";
import { getVisionDatabase, VISION_BACKGROUND_GRID_SIZE } from "./vision-database";
import { VisionMask } from "./vision-mask";
import {
  createInitialEdges,
  createInitialNodes,
  getGridRowY,
  type VisionTaskNode,
} from "./vision-graph";
import styles from "./vision.module.css";

const nodeTypes = { task: TaskNode };

const FIT_VIEW_OPTIONS = { padding: 0.25, maxZoom: 1.2, duration: 200 } as const;

interface VisionCanvasInnerProps {
  workspaceId: string;
  workspaceTitle?: string | null;
  resetToken: number;
}

function VisionCanvasInner({ workspaceId, workspaceTitle, resetToken }: VisionCanvasInnerProps) {
  const { t } = useTranslation();
  const database = useMemo(
    () => getVisionDatabase(workspaceId, workspaceTitle),
    [workspaceId, workspaceTitle],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<VisionTaskNode>(
    createInitialNodes(database),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    createInitialEdges(database),
  );
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const onConstrainedNodesChange = useCallback(
    (changes: NodeChange<VisionTaskNode>[]) => {
      const constrained = changes.map((change) => {
        if (change.type !== "position" || !change.position) return change;
        const node = nodes.find((n) => n.id === change.id);
        if (!node) return change;
        return {
          ...change,
          position: {
            x: Math.round(change.position.x / VISION_BACKGROUND_GRID_SIZE) * VISION_BACKGROUND_GRID_SIZE,
            y: getGridRowY(node.data.row),
          },
        };
      });
      onNodesChange(constrained);
    },
    [nodes, onNodesChange],
  );

  // Rebuilds on reset and whenever the resolved database changes: the
  // workspace title loads asynchronously, so the demo data may arrive after
  // the initial mount and must replace the interim empty canvas.
  useEffect(() => {
    setNodes(createInitialNodes(database));
    setEdges(createInitialEdges(database));
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => void fitView({ ...FIT_VIEW_OPTIONS }));
    });
    return () => cancelAnimationFrame(frame);
  }, [database, resetToken, setNodes, setEdges, fitView]);

  return (
    <div className={styles.canvasRoot} data-testid="vision-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onConstrainedNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.3}
        maxZoom={2}
        nodesConnectable={false}
        deleteKeyCode={null}
        edgesFocusable={false}
        aria-label={t.vision.canvasLabel}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={VISION_BACKGROUND_GRID_SIZE}
          size={1.5}
        />
        <VisionMask boundary={database.maskBoundary} />
        <MiniMap
          position="bottom-right"
          className={styles.miniMap}
          nodeColor="var(--dt-text-muted)"
          maskColor="rgb(128 128 128 / 0.18)"
          pannable
          zoomable
          ariaLabel={t.vision.miniMap}
        />
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => void zoomIn({ duration: 150 })}
            title={t.vision.zoomIn}
            aria-label={t.vision.zoomIn}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => void zoomOut({ duration: 150 })}
            title={t.vision.zoomOut}
            aria-label={t.vision.zoomOut}
          >
            <Minus className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => void fitView({ ...FIT_VIEW_OPTIONS })}
            title={t.vision.fitView}
            aria-label={t.vision.fitView}
          >
            <Maximize className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </ReactFlow>
    </div>
  );
}

interface VisionCanvasProps {
  workspaceId: string;
  workspaceTitle?: string | null;
  resetToken: number;
}

export function VisionCanvas({ workspaceId, workspaceTitle, resetToken }: VisionCanvasProps) {
  return (
    <ReactFlowProvider>
      <VisionCanvasInner
        workspaceId={workspaceId}
        workspaceTitle={workspaceTitle}
        resetToken={resetToken}
      />
    </ReactFlowProvider>
  );
}

export default VisionCanvas;
