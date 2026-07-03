import { INode, NodeExecutionInput, NodeExecutionOutput } from '../node.interface';
import { Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiNode implements INode {
  type = 'gemini';
  private readonly logger = new Logger(GeminiNode.name);

  async execute(config: NodeExecutionInput): Promise<NodeExecutionOutput> {
    const apiKey = config.parameters.apiKey;
    const promptTemplate = config.parameters.prompt || '';
    const modelName = config.parameters.model || 'gemini-1.5-flash';
    
    if (!apiKey) {
      return { success: false, error: 'Gemini node requires a valid API key.' };
    }

    if (!promptTemplate) {
      return { success: false, error: 'Gemini node requires a prompt.' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });

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

    // Instruction to ensure JSON output
    const jsonInstruction = `\n\nIMPORTANT: You must return a valid JSON object with exactly two keys: "subject" (a string for the email subject) and "body" (a string containing the email body in HTML). Do not return any other text.`;

    for (const item of itemsToProcess) {
      try {
        const interpolatedPrompt = interpolate(promptTemplate, item);
        const finalPrompt = interpolatedPrompt + jsonInstruction;
        
        this.logger.log(`Generating content with Gemini for item...`);
        const result = await model.generateContent(finalPrompt);
        const text = result.response.text();
        
        // Parse the generated text as JSON
        let generatedData: any = {};
        try {
            // First attempt to parse directly
            generatedData = JSON.parse(text);
        } catch(e) {
            // fallback if it didn't return perfect JSON
            const match = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
            if (match) {
                try {
                    generatedData = JSON.parse(match[1]);
                } catch(e2) {
                    generatedData = JSON.parse(text.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
                }
            } else {
                try {
                    generatedData = JSON.parse(text.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
                } catch(e3) {
                    // Manual extraction as a last resort if JSON completely failed
                    const subjectMatch = text.match(/"subject"\s*:\s*"([^"]+)"/i);
                    const bodyMatch = text.match(/"body"\s*:\s*"([^"]+)"/i);
                    if (subjectMatch) generatedData.subject = subjectMatch[1];
                    if (bodyMatch) generatedData.body = bodyMatch[1];
                }
            }
        }
        
        // Case-insensitive key lookup
        const getVal = (obj: any, key: string) => {
           const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
           return foundKey ? obj[foundKey] : '';
        };

        // Combine the generated data with the original item data so downstream nodes have both
        results.push({
          ...item,
          generatedSubject: getVal(generatedData, 'subject'),
          generatedBody: getVal(generatedData, 'body')
        });

      } catch (err: any) {
        this.logger.error(`Error generating content: ${err.message}`);
        errors.push({
          item,
          error: err.message
        });
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { success: false, error: 'All Gemini generations failed: ' + JSON.stringify(errors) };
    }

    return {
      success: true,
      data: results
    };
  }
}
