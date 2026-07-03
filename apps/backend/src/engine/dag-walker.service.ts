import { Injectable, Logger } from '@nestjs/common';
import { WorkflowDefinition, NodeDefinition } from '../shared-types';
import { INode } from './node.interface';
import { HttpNode } from './nodes/http.node';
import { SetNode } from './nodes/set.node';
import { WebhookNode } from './nodes/webhook.node';
import { IfNode } from './nodes/if.node';
import { ManualTriggerNode } from './nodes/manual.node';
import { CsvNode } from './nodes/csv.node';
import { GmailSendNode } from './nodes/gmail.node';
import { GeminiNode } from './nodes/gemini.node';

@Injectable()
export class DagWalkerService {
  private readonly logger = new Logger(DagWalkerService.name);
  private nodeRegistry: Map<string, INode> = new Map();

  constructor() {
    this.registerNode(new HttpNode());
    this.registerNode(new SetNode());
    this.registerNode(new WebhookNode());
    this.registerNode(new IfNode());
    this.registerNode(new ManualTriggerNode());
    this.registerNode(new CsvNode());
    this.registerNode(new GmailSendNode());
    this.registerNode(new GeminiNode());
  }

  private registerNode(node: INode) {
    this.nodeRegistry.set(node.type, node);
  }

  async executeWorkflow(workflow: WorkflowDefinition, initialPayload: any) {
    this.logger.log(`Starting execution for workflow: ${workflow.name}`);
    const executionData = new Map<string, any>();
    const nodesMap = new Map(workflow.nodes.map((n) => [n.id, n]));

    // Find trigger nodes (in-degree 0)
    const targets = new Set(workflow.edges.map((e) => e.target));
    const startNodes = workflow.nodes.filter((n) => !targets.has(n.id));

    const queue = [...startNodes];
    const executed = new Set<string>();

    while (queue.length > 0) {
      const nodeDef = queue.shift()!;
      if (executed.has(nodeDef.id)) continue;

      this.logger.log(`Executing node: ${nodeDef.id} (${nodeDef.type})`);
      const nodeInstance = this.nodeRegistry.get(nodeDef.type);
      if (!nodeInstance) throw new Error(`Unknown node type: ${nodeDef.type}`);

      const incomingEdges = workflow.edges.filter(
        (e) => e.target === nodeDef.id,
      );
      const incomingData = incomingEdges.map((edge) =>
        executionData.get(edge.source),
      );

      if (nodeDef.type === 'webhook' || nodeDef.type === 'manual_trigger') {
        nodeDef.parameters.payload = initialPayload;
      }

      // Resolve expressions in parameters
      const resolvedParams = this.resolveParameters(
        nodeDef.parameters,
        executionData,
      );

      const result = await nodeInstance.execute({
        nodeId: nodeDef.id,
        parameters: resolvedParams,
        incomingData,
      });

      if (!result.success) {
        this.logger.error(`Node ${nodeDef.id} failed: ${result.error}`);
        throw new Error(`Workflow execution halted at node ${nodeDef.id}`);
      }

      this.logger.log(
        `Node ${nodeDef.id} output: ${JSON.stringify(result.data)}`,
      );
      executionData.set(nodeDef.id, result.data);
      executed.add(nodeDef.id);

      // Find outgoing edges that match the returned branch
      const outgoingEdges = workflow.edges.filter((e) => {
        if (e.source !== nodeDef.id) return false;
        if (result.branch) {
          return e.sourceHandle === result.branch;
        }
        return true;
      });

      for (const edge of outgoingEdges) {
        const targetNode = nodesMap.get(edge.target);
        if (targetNode && !executed.has(targetNode.id)) {
          // In a complex DAG, we might wait for all inputs. MVP: push to queue immediately.
          queue.push(targetNode);
        }
      }
    }

    this.logger.log(`Workflow ${workflow.name} completed successfully.`);
    return executionData;
  }

  private resolveParameters(
    params: Record<string, any>,
    executionData: Map<string, any>,
  ): Record<string, any> {
    const resolved: Record<string, any> = {};
    const context: any = { $node: {} };

    executionData.forEach((value, key) => {
      // Allows expressions like {{ $node["node_id"].data.field }}
      context.$node[key] = { data: value };
    });

    const evaluate = (val: any): any => {
      if (typeof val === 'string') {
        // Exact match -> Return the actual object (not stringified)
        const exactMatch = val.match(/^{{(.*?)}}$/);
        if (exactMatch) {
          try {
            const func = new Function('$node', `return ${exactMatch[1]}`);
            return func(context.$node);
          } catch (e) {
            this.logger.warn(
              `Failed to evaluate exact expression: ${exactMatch[1]}`,
            );
            return val;
          }
        }
        // Partial match -> String replacement
        return val.replace(/{{(.*?)}}/g, (match, expr) => {
          try {
            const func = new Function('$node', `return ${expr}`);
            return func(context.$node);
          } catch (e) {
            this.logger.warn(`Failed to evaluate expression: ${expr}`);
            return match;
          }
        });
      }
      if (Array.isArray(val)) return val.map(evaluate);
      if (typeof val === 'object' && val !== null) {
        const obj: any = {};
        for (const [k, v] of Object.entries(val)) {
          obj[k] = evaluate(v);
        }
        return obj;
      }
      return val;
    };

    for (const [key, value] of Object.entries(params)) {
      resolved[key] = evaluate(value);
    }

    return resolved;
  }
}
