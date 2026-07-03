import { INode, NodeExecutionInput, NodeExecutionOutput } from '../node.interface';

export class ManualTriggerNode implements INode {
  type = 'manual_trigger';

  async execute(config: NodeExecutionInput): Promise<NodeExecutionOutput> {
    return {
      success: true,
      data: { 
        message: 'Workflow triggered manually',
        payload: config.parameters.payload
      }
    };
  }
}
