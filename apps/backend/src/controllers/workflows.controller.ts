import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { DagWalkerService } from '../engine/dag-walker.service';
import { WorkflowDefinition } from '../../../../packages/shared-types';

@Controller('workflows')
export class WorkflowsController {
  private readonly logger = new Logger(WorkflowsController.name);

  constructor(private readonly dagWalkerService: DagWalkerService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async executeWorkflow(@Body() data: { workflow: WorkflowDefinition; initialPayload: any }) {
    this.logger.log(`Received execution request for workflow: ${data.workflow.name}`);
    
    try {
      const result = await this.dagWalkerService.executeWorkflow(
        data.workflow,
        data.initialPayload || {}
      );
      
      // Convert map to object for JSON serialization
      const serializedResult: Record<string, any> = {};
      result.forEach((value, key) => {
        serializedResult[key] = value;
      });

      return {
        success: true,
        executionData: serializedResult
      };
    } catch (error: any) {
      this.logger.error(`Execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
