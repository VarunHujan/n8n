import { INode, NodeExecutionInput, NodeExecutionOutput } from '../node.interface';
import { google } from 'googleapis';
import { Logger } from '@nestjs/common';

export class GmailSendNode implements INode {
  type = 'gmail_send';
  private readonly logger = new Logger(GmailSendNode.name);

  async execute(config: NodeExecutionInput): Promise<NodeExecutionOutput> {
    const accessToken = config.parameters.accessToken;
    
    if (!accessToken) {
      return { success: false, error: 'Gmail node requires a valid Google access token.' };
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    // Assuming first input has our array of data (e.g. from CSV)
    const inputItems = config.incomingData[0] || [{}];
    const itemsToProcess = Array.isArray(inputItems) ? inputItems : [inputItems];
    
    const results = [];
    const errors = [];

    // Helper to replace {{variable}} templates
    const interpolate = (str: string, context: any) => {
      if (typeof str !== 'string') return str;
      return str.replace(/{{(.*?)}}/g, (_, expr) => {
        return context[expr.trim()] || '';
      });
    };

    for (const item of itemsToProcess) {
      try {
        const to = interpolate(config.parameters.to || '', item);
        const subject = interpolate(config.parameters.subject || '', item);
        const body = interpolate(config.parameters.body || '', item);

        if (!to) {
          throw new Error('Recipient "to" field is empty after interpolation.');
        }

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
          `To: ${to}`,
          'Content-Type: text/html; charset=utf-8',
          'MIME-Version: 1.0',
          `Subject: ${utf8Subject}`,
          '',
          body
        ];
        const message = messageParts.join('\n');
        
        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        this.logger.log(`Sending email to ${to}...`);
        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        });

        results.push({
          to,
          messageId: res.data.id,
          status: 'sent'
        });
      } catch (err: any) {
        this.logger.error(`Error sending email to item: ${err.message}`);
        errors.push({
          item,
          error: err.message
        });
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { success: false, error: 'All emails failed to send: ' + JSON.stringify(errors) };
    }

    return {
      success: true,
      data: {
        sentCount: results.length,
        failedCount: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      }
    };
  }
}
