import { Controller, Post, Body, HttpCode, HttpStatus, Logger, Res, Get, Param, Delete } from '@nestjs/common';
import { Response } from 'express';
import { DagWalkerService } from '../engine/dag-walker.service';
import { WorkflowsService } from '../workflows.service';
import { WorkflowDefinition } from '../shared-types';

@Controller('workflows')
export class WorkflowsController {
  private readonly logger = new Logger(WorkflowsController.name);

  constructor(
    private readonly dagWalkerService: DagWalkerService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  @Get()
  async getWorkflows() {
    this.logger.log('Fetching all workflows');
    return this.workflowsService.findAll();
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string) {
    this.logger.log(`Fetching workflow: ${id}`);
    return this.workflowsService.findOne(id);
  }

  @Post()
  async saveWorkflow(@Body() data: { id?: string; name: string; nodes: any[]; edges: any[] }) {
    this.logger.log(`Saving workflow: ${data.name}`);
    return this.workflowsService.createOrUpdate(data.id || '', data.name, data.nodes, data.edges);
  }

  @Delete(':id')
  async deleteWorkflow(@Param('id') id: string) {
    this.logger.log(`Deleting workflow: ${id}`);
    return this.workflowsService.delete(id);
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async executeWorkflow(@Body() data: { workflow: WorkflowDefinition; initialPayload: any }) {
    this.logger.log(`Received execution request for workflow: ${data.workflow.name}`);
    
    try {
      const result = await this.dagWalkerService.executeWorkflow(
        data.workflow,
        data.initialPayload || {}
      );
      
      const serializedResult: Record<string, any> = {};
      result.forEach((value, key) => {
        serializedResult[key] = value;
      });

      return { success: true, executionData: serializedResult };
    } catch (error: any) {
      this.logger.error(`Execution failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @Post('execute-stream')
  async executeStream(@Body() data: { workflow: WorkflowDefinition; initialPayload: any; sysContext?: any }, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const emit = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      emit({ type: 'workflow-start' });
      
      const result = await this.dagWalkerService.executeWorkflow(
        data.workflow,
        data.initialPayload || {},
        data.sysContext,
        emit
      );
      
      const serializedResult: Record<string, any> = {};
      result.forEach((value, key) => {
        serializedResult[key] = value;
      });

      emit({ type: 'workflow-complete', data: serializedResult });
      res.end();
    } catch (error: any) {
      emit({ type: 'workflow-error', error: error.message });
      res.end();
    }
  }
}
