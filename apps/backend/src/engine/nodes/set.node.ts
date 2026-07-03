import {
  INode,
  NodeExecutionInput,
  NodeExecutionOutput,
} from '../node.interface';

export class SetNode implements INode {
  type = 'set_data';

  async execute(input: NodeExecutionInput): Promise<NodeExecutionOutput> {
    try {
      // The Set node simply merges the parameters with the incoming data
      const incoming = input.incomingData[0] || {}; // Take the first incoming branch for simplicity
      const newData = { ...incoming, ...input.parameters.fields };

      return {
        success: true,
        data: newData,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
