'use client';

/**
 * WorkflowBuilder — Visual Pipeline Editor
 * ========================================
 * Drag & drop node editor for building AI workflows.
 * Connects services: Avatar → Video → Music → Export
 */

import { useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Node types
const nodeTypes = {
  service: ServiceNode,
  action: ActionNode,
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'service',
    position: { x: 250, y: 25 },
    data: { label: 'Avatar Studio', service: 'avatar' },
  },
  {
    id: '2',
    type: 'service',
    position: { x: 250, y: 125 },
    data: { label: 'Video Generation', service: 'video' },
  },
  {
    id: '3',
    type: 'action',
    position: { x: 250, y: 225 },
    data: { label: 'Export MP4', action: 'export' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
];

function ServiceNode({ data }: { data: { label: string; service: string } }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-cyan-400">
      <div className="font-bold text-cyan-600">{data.label}</div>
    </div>
  );
}

function ActionNode({ data }: { data: { label: string; action: string } }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-cyan-400 border-2 border-cyan-600">
      <div className="font-bold text-white">{data.label}</div>
    </div>
  );
}

export default function WorkflowBuilder() {
  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </div>
  );
}