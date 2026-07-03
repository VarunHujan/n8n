export interface NodeExecutionInput {
  nodeId: string;
  parameters: Record<string, any>;
  incomingData: any[]; // Data from previous nodes
  sysContext?: Record<string, any>; // System context injected by the engine
}

export interface NodeExecutionOutput {
  success: boolean;
  data?: any;
  error?: string;
  branch?: string;
}

export interface INode {
  type: string;
  execute(input: NodeExecutionInput): Promise<NodeExecutionOutput>;
}
