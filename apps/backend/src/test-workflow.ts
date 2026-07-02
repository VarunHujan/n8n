import { DagWalkerService } from './engine/dag-walker.service';
import { WorkflowDefinition } from './shared-types';

async function bootstrap() {
  const engine = new DagWalkerService();

  const testWorkflow: WorkflowDefinition = {
    id: 'wf_123',
    name: 'Test Webhook -> Set -> HTTP',
    nodes: [
      {
        id: 'node_trigger',
        type: 'webhook',
        parameters: {} // Payload will be injected
      },
      {
        id: 'node_set',
        type: 'set_data',
        parameters: {
          fields: {
            appendedData: 'This was added by the Set Node'
          }
        }
      },
      {
        id: 'node_http',
        type: 'http_request',
        parameters: {
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          method: 'GET'
        }
      }
    ],
    edges: [
      { id: 'edge_1', source: 'node_trigger', target: 'node_set' },
      { id: 'edge_2', source: 'node_set', target: 'node_http' }
    ]
  };

  const initialPayload = {
    user: 'Test User',
    action: 'Testing execution engine'
  };

  console.log('--- STARTING WORKFLOW EXECUTION ---');
  await engine.executeWorkflow(testWorkflow, initialPayload);
  console.log('--- WORKFLOW EXECUTION FINISHED ---');
}

bootstrap();
