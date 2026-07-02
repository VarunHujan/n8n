import { INode, NodeExecutionInput, NodeExecutionOutput } from '../node.interface';

export class WebhookNode implements INode {
  type = 'webhook';

  async execute(input: NodeExecutionInput): Promise<NodeExecutionOutput> {
    // The webhook node just passes the incoming HTTP payload forward
    return {
      success: true,
      data: input.parameters.payload || {},
    };
  }
}
