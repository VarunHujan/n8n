// Shared TypeScript definitions for frontend, backend, and worker
export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

export interface NodeDefinition {
  id: string;
  type: string;
  parameters: Record<string, any>;
}

export interface EdgeDefinition {
  id: string;
  source: string;
  target: string;
}
