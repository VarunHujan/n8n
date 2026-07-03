import {
  INode,
  NodeExecutionInput,
  NodeExecutionOutput,
} from '../node.interface';

export class IfNode implements INode {
  type = 'if_condition';

  async execute(input: NodeExecutionInput): Promise<NodeExecutionOutput> {
    try {
      const incoming = input.incomingData[0] || {};
      const { condition, field, value } = input.parameters;

      let result = false;
      const actualValue = incoming[field];

      switch (condition) {
        case 'equals':
          result = actualValue === value;
          break;
        case 'not_equals':
          result = actualValue !== value;
          break;
        case 'greater_than':
          result = actualValue > value;
          break;
        case 'less_than':
          result = actualValue < value;
          break;
        default:
          throw new Error(`Unknown condition: ${condition}`);
      }

      return {
        success: true,
        branch: result ? 'true' : 'false',
        data: {
          matched: result,
          originalData: incoming,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
