import {
  INode,
  NodeExecutionInput,
  NodeExecutionOutput,
} from '../node.interface';

export class HttpNode implements INode {
  type = 'http_request';

  async execute(input: NodeExecutionInput): Promise<NodeExecutionOutput> {
    try {
      const { url, method = 'GET', body, headers } = input.parameters;

      if (!url) {
        throw new Error('URL is required for HTTP Request node');
      }

      const response = await fetch(url, {
        method,
        headers: headers || { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = await response.json().catch(() => null);

      return {
        success: response.ok,
        data: {
          status: response.status,
          body: responseData,
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
