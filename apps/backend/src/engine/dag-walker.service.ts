import { Injectable, Logger } from '@nestjs/common';
import { WorkflowDefinition, NodeDefinition, EdgeDefinition } from '../shared-types';
import { INode } from './node.interface';
import { HttpNode } from './nodes/http.node';
import { SetNode } from './nodes/set.node';
import { WebhookNode } from './nodes/webhook.node';
import { IfNode } from './nodes/if.node';
import { ManualTriggerNode } from './nodes/manual.node';
import { CsvNode } from './nodes/csv.node';
import { GmailNode } from './nodes/gmail.node';
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
    this.registerNode(new GmailNode());
    this.registerNode(new GeminiNode());
  }

  private registerNode(node: INode) {
    this.nodeRegistry.set(node.type, node);
  }

  async executeWorkflow(workflow: WorkflowDefinition, initialPayload: any, sysContext?: Record<string, any>, emit?: (event: any) => void) {
    this.logger.log(`Starting execution for workflow: ${workflow.name}`);
    const executionData = new Map<string, any>();
    const nodesMap = new Map<string, NodeDefinition>(workflow.nodes.map((n: NodeDefinition) => [n.id, n]));
    
    // Find trigger nodes (in-degree 0)
    const targets = new Set(workflow.edges.map((e: EdgeDefinition) => e.target));
    const startNodes = workflow.nodes.filter((n: NodeDefinition) => !targets.has(n.id));

    const queue: NodeDefinition[] = [...startNodes];
    const executed = new Set<string>();
    const failed = new Set<string>();

    while (queue.length > 0) {
      const nodeDef = queue.shift()!;
      if (executed.has(nodeDef.id) || failed.has(nodeDef.id)) continue;
      
      // Skip nodes whose upstream dependencies have failed
      const incomingEdges = workflow.edges.filter((e: EdgeDefinition) => e.target === nodeDef.id);
      const hasFailedDependency = incomingEdges.some((edge: EdgeDefinition) => failed.has(edge.source));
      if (hasFailedDependency) {
        this.logger.warn(`Skipping node ${nodeDef.id} — upstream dependency failed`);
        failed.add(nodeDef.id);
        if (emit) emit({ type: 'node-error', nodeId: nodeDef.id, error: 'Skipped: upstream node failed' });
        continue;
      }

      this.logger.log(`Executing node: ${nodeDef.id} (${nodeDef.type})`);
      if (emit) emit({ type: 'node-start', nodeId: nodeDef.id });

      const nodeInstance = this.nodeRegistry.get(nodeDef.type);
      if (!nodeInstance) {
        this.logger.error(`Unknown node type: ${nodeDef.type}`);
        failed.add(nodeDef.id);
        if (emit) emit({ type: 'node-error', nodeId: nodeDef.id, error: `Unknown node type: ${nodeDef.type}` });
        continue;
      }

      const incomingData = incomingEdges.map((edge: EdgeDefinition) => executionData.get(edge.source));

      if (nodeDef.type === 'webhook' || nodeDef.type === 'manual_trigger') {
        nodeDef.parameters.payload = initialPayload;
      }

      // Resolve expressions in parameters
      const resolvedParams = this.resolveParameters(nodeDef.parameters, executionData);

      const result = await nodeInstance.execute({
        nodeId: nodeDef.id,
        parameters: resolvedParams,
        incomingData,
        sysContext,
      });

      if (!result.success) {
        this.logger.error(`Node ${nodeDef.id} failed: ${result.error}`);
        failed.add(nodeDef.id);
        if (emit) emit({ type: 'node-error', nodeId: nodeDef.id, error: result.error });
        // Don't throw — let other independent branches continue
        continue;
      }

      this.logger.log(`Node ${nodeDef.id} output: ${JSON.stringify(result.data)}`);
      executionData.set(nodeDef.id, result.data);
      executed.add(nodeDef.id);

      // Include a summary of the output data in the SSE event
      const outputSummary = this.summarizeOutput(result.data);
      if (emit) emit({ type: 'node-end', nodeId: nodeDef.id, outputSummary });

      // Find outgoing edges that match the returned branch
      const outgoingEdges = workflow.edges.filter((e: EdgeDefinition) => {
        if (e.source !== nodeDef.id) return false;
        if (result.branch) {
          return e.sourceHandle === result.branch;
        }
        return true;
      });

      for (const edge of outgoingEdges) {
        const targetNode = nodesMap.get(edge.target);
        if (targetNode && !executed.has(targetNode.id) && !failed.has(targetNode.id)) {
          queue.push(targetNode);
        }
      }
    }

    this.logger.log(`Workflow ${workflow.name} completed successfully.`);
    return executionData;
  }

  private resolvePath(expr: string, context: Record<string, any>): any {
    const trimmed = expr.trim();
    const nodeMatch = trimmed.match(/^\$node\[(?:"([^"]+)"|'([^']+)')\]/);
    if (!nodeMatch) {
      return undefined;
    }
    const nodeId = nodeMatch[1] || nodeMatch[2];
    let current = context[nodeId];
    if (current === undefined) {
      return undefined;
    }

    const remaining = trimmed.slice(nodeMatch[0].length);
    const segmentRegex = /\.([a-zA-Z_$][\w$]*)|\[(\d+)\]|\["([^"]*)"\]|\['([^']*)'\]/g;
    let match;
    
    while ((match = segmentRegex.exec(remaining)) !== null) {
      if (current === null || current === undefined) {
        return undefined;
      }
      const prop = match[1] ?? match[2] ?? match[3] ?? match[4];
      current = current[prop];
    }
    return current;
  }

  private resolveParameters(params: Record<string, any>, executionData: Map<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {};
    const context: any = { $node: {} };
    
    executionData.forEach((value, key) => {
      context.$node[key] = { data: value };
    });

    const evaluate = (val: any): any => {
      if (typeof val === 'string') {
        // Exact match -> Return the actual object (not stringified)
        const exactMatch = val.match(/^{{(.*?)}}$/);
        if (exactMatch) {
          const res = this.resolvePath(exactMatch[1], context.$node);
          return res !== undefined ? res : val;
        }
        // Partial match -> String replacement
        return val.replace(/{{(.*?)}}/g, (match, expr) => {
          const res = this.resolvePath(expr, context.$node);
          return res !== undefined ? String(res) : '';
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

  private summarizeOutput(data: any): string {
    if (data === null || data === undefined) return 'No output';
    if (Array.isArray(data)) return `Array with ${data.length} item(s)`;
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) return 'Empty object';
      const preview = keys.slice(0, 4).map(k => {
        const val = data[k];
        if (typeof val === 'string') return `${k}: "${val.slice(0, 40)}${val.length > 40 ? '...' : ''}"`;
        if (typeof val === 'number' || typeof val === 'boolean') return `${k}: ${val}`;
        if (Array.isArray(val)) return `${k}: [${val.length} items]`;
        return `${k}: {...}`;
      }).join(', ');
      return `{ ${preview}${keys.length > 4 ? `, +${keys.length - 4} more` : ''} }`;
    }
    return String(data).slice(0, 100);
  }
}
