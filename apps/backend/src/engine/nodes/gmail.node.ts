import { INode, NodeExecutionInput, NodeExecutionOutput } from '../node.interface';
import { google } from 'googleapis';
import { Logger } from '@nestjs/common';

export class GmailNode implements INode {
  type = 'gmail';
  private readonly logger = new Logger(GmailNode.name);

  async execute(config: NodeExecutionInput): Promise<NodeExecutionOutput> {
    const accessToken = config.sysContext?.googleAccessToken || config.parameters.accessToken;
    
    if (!accessToken) {
      return { success: false, error: 'Gmail node requires a valid Google access token.' };
    }

    const auth = new google.auth.OAuth2();
    this.logger.log(`Using access token: ${accessToken.substring(0, 10)}...`);
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
        const subject = config.parameters.subject ? interpolate(config.parameters.subject, item) : (item.generatedSubject || '');
        const body = config.parameters.body ? interpolate(config.parameters.body, item) : (item.generatedBody || '');

        const cc = config.parameters.cc ? interpolate(config.parameters.cc, item) : '';
        const bcc = config.parameters.bcc ? interpolate(config.parameters.bcc, item) : '';

        if (!to && !cc && !bcc) {
          throw new Error('No recipient fields (To, Cc, or Bcc) provided.');
        }

        // Rigorous verification to avoid blindly sending
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        
        const validateAndCleanEmails = (emailString: string, fieldName: string) => {
          if (!emailString) return '';
          const emailList = emailString.split(',').map(e => e.trim()).filter(e => e);
          if (emailList.length === 0) return '';
          
          const invalidEmails = emailList.filter(email => !emailRegex.test(email));
          if (invalidEmails.length > 0) {
            throw new Error(`Email Verification Failed: Invalid email format detected in "${fieldName}" field for "${invalidEmails.join(', ')}". Sending aborted.`);
          }
          return emailList.join(', ');
        };

        const cleanedTo = validateAndCleanEmails(to, 'To');
        const cleanedCc = validateAndCleanEmails(cc, 'Cc');
        const cleanedBcc = validateAndCleanEmails(bcc, 'Bcc');

        if (!cleanedTo && !cleanedCc && !cleanedBcc) {
          throw new Error('No valid recipients found.');
        }

        if (!subject && !body) {
          throw new Error('Both Subject and Body are empty. If you are using Gemini, ensure it is connected sequentially (CSV -> Gemini -> Gmail), not in parallel.');
        }

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
          ...(cleanedTo ? [`To: ${cleanedTo}`] : []),
          ...(cleanedCc ? [`Cc: ${cleanedCc}`] : []),
          ...(cleanedBcc ? [`Bcc: ${cleanedBcc}`] : []),
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
        
        let errorMessage = err.message;
        if (err.message.includes('invalid authentication credentials') || err.message.includes('Invalid Credentials') || err.code === 401) {
          errorMessage = 'Google Access Token is expired or missing required Gmail scopes. PLEASE SIGN OUT (using the top right profile icon) AND SIGN BACK IN. When signing in, MAKE SURE to check the checkboxes to grant Gmail access!';
        } else if (err.code === 403) {
          errorMessage = 'Insufficient permissions. You did not grant Gmail send permissions during login. Please sign out, sign back in, and check all permission boxes.';
        }

        errors.push({
          item,
          error: errorMessage
        });
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { success: false, error: 'Operation failed: ' + JSON.stringify(errors) };
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
