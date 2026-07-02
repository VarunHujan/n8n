export interface ExecutionPayload {
  workflowId: string;
  triggerNodeId: string;
  initialData: Record<string, any>;
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
