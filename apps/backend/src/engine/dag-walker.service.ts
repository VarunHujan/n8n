import { Injectable, Logger } from '@nestjs/common';
import { WorkflowDefinition, NodeDefinition } from '../../../../packages/shared-types';
import { INode } from './node.interface';
import { HttpNode } from './nodes/http.node';
import { SetNode } from './nodes/set.node';
import { WebhookNode } from './nodes/webhook.node';
import { IfNode } from './nodes/if.node';

@Injectable()
export class DagWalkerService {
  private readonly logger = new Logger(DagWalkerService.name);
  private nodeRegistry: Map<string, INode> = new Map();

  constructor() {
    this.registerNode(new HttpNode());
    this.registerNode(new SetNode());
    this.registerNode(new WebhookNode());
    this.registerNode(new IfNode());
  }

  private registerNode(node: INode) {
    this.nodeRegistry.set(node.type, node);
  }

  async executeWorkflow(workflow: WorkflowDefinition, initialPayload: any) {
    this.logger.log(`Starting execution for workflow: ${workflow.name}`);

    // Map of nodeId -> execution output data
    const executionData = new Map<string, any>();
    
    // In a real topological sort, we would calculate indegrees and walk the graph.
    // For this simple MVP, we will assume the nodes array is already topologically sorted,
    // or we can write a basic topological sort here.
    
    const sortedNodes = this.topologicalSort(workflow);

    for (const nodeDef of sortedNodes) {
      this.logger.log(`Executing node: ${nodeDef.id} (${nodeDef.type})`);
      
      const nodeInstance = this.nodeRegistry.get(nodeDef.type);
      if (!nodeInstance) {
        throw new Error(`Unknown node type: ${nodeDef.type}`);
      }

      // Find incoming edges to get data from parents
      const incomingEdges = workflow.edges.filter(e => e.target === nodeDef.id);
      const incomingData = incomingEdges.map(edge => executionData.get(edge.source));

      // If it's a webhook trigger, inject the initial payload
      if (nodeDef.type === 'webhook') {
        nodeDef.parameters.payload = initialPayload;
      }

      const result = await nodeInstance.execute({
        nodeId: nodeDef.id,
        parameters: nodeDef.parameters,
        incomingData,
      });

      if (!result.success) {
        this.logger.error(`Node ${nodeDef.id} failed: ${result.error}`);
        throw new Error(`Workflow execution halted at node ${nodeDef.id}`);
      }

      this.logger.log(`Node ${nodeDef.id} output: ${JSON.stringify(result.data)}`);
      executionData.set(nodeDef.id, result.data);
    }

    this.logger.log(`Workflow ${workflow.name} completed successfully.`);
    return executionData;
  }

  private topologicalSort(workflow: WorkflowDefinition): NodeDefinition[] {
    const sorted: NodeDefinition[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const nodesMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const adjList = new Map<string, string[]>();

    workflow.nodes.forEach(n => adjList.set(n.id, []));
    workflow.edges.forEach(e => {
      adjList.get(e.source)?.push(e.target);
    });

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) throw new Error("Cycle detected in DAG!");
      if (!visited.has(nodeId)) {
        temp.add(nodeId);
        const children = adjList.get(nodeId) || [];
        for (const child of children) {
          visit(child);
        }
        temp.delete(nodeId);
        visited.add(nodeId);
        sorted.unshift(nodesMap.get(nodeId)!);
      }
    };

    // Find trigger nodes (in-degree 0) to start
    const targets = new Set(workflow.edges.map(e => e.target));
    const startNodes = workflow.nodes.filter(n => !targets.has(n.id));

    for (const startNode of startNodes) {
      if (!visited.has(startNode.id)) {
        visit(startNode.id);
      }
    }

    return sorted;
  }
}
