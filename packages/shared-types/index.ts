export interface Position {
  x: number;
  y: number;
}

export interface WorkflowNode<T = Record<string, any>> {
  id: string;
  type: string; // e.g., 'webhook', 'http_request', 'if_condition'
  position?: Position; // Frontend specific, but good to store in the universal definition
  data: T; // The configuration for the specific node type
}

export interface WorkflowEdge {
  id: string;
  source: string; // ID of the source node
  target: string; // ID of the target node
  sourceHandle?: string; // Necessary for nodes with multiple outputs (e.g. true/false branches)
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  active: boolean; // Whether the workflow is currently listening for triggers
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExecutionPayload {
  workflowId: string;
  triggerNodeId: string;
  initialData: Record<string, any>; // The payload that triggered the run (e.g. webhook body)
}

export interface NodeDefinition {
  id: string;
  type: string;
  parameters: Record<string, any>;
}

export interface EdgeDefinition {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}
