"use client";

/**
 * Task node for the Vision canvas: a card built from the adapted
 * React Flow UI Base Node. Frontend-only node type; unrelated to the backend
 * Task model.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";

import {
  BaseNode,
  BaseNodeContent,
  BaseNodeFooter,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "./base-node";
import {
  VISION_TASK_NODE_WIDTH,
  type VisionTaskNode,
} from "./vision-graph";
import styles from "./vision.module.css";

export function TaskNode({ data, selected }: NodeProps<VisionTaskNode>) {
  const { title, description, acceptanceCriteria, footer } = data;

  return (
    <BaseNode
      className={styles.taskNode}
      style={{ width: VISION_TASK_NODE_WIDTH }}
      aria-selected={selected}
      aria-label={title}
    >
      <BaseNodeHeader>
        <BaseNodeHeaderTitle className="truncate text-sm" title={title}>
          {title}
        </BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent className={styles.taskContent}>
        <p>{description}</p>
        <ul>
          {acceptanceCriteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </BaseNodeContent>
      <BaseNodeFooter className={styles.taskFooter}>
        <span>{footer}</span>
      </BaseNodeFooter>
      <Handle
        type="target"
        position={Position.Left}
        className={styles.nodeHandle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={styles.nodeHandle}
        isConnectable={false}
      />
    </BaseNode>
  );
}
