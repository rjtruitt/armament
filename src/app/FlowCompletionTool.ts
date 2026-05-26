/**
 * FlowCompletionTool — builds the report_complete tool for flow agent steps.
 *
 * Extracted from FlowRuntime to separate tool construction from flow execution.
 * The completion tool is what agents call when they finish their assigned task,
 * delivering structured output to the next workflow step.
 */

import type { CompletionSchema } from '../scripting/index.js';

/**
 * Build the report_complete tool for a flow step agent.
 *
 * If a schema is provided, creates a structured output tool with typed fields.
 * Otherwise creates a simple freeform text output tool.
 */
export function buildCompletionTool(
  z: typeof import('zod').z,
  schema: CompletionSchema | undefined,
  onComplete: (output: string) => void,
): { tool: any; stickyText: string } {
  if (!schema || schema.fields.length === 0) {
    return {
      tool: {
        name: 'report_complete',
        description: 'Call this when you have finished your assigned task. Pass your complete output — this is what gets delivered to the next step in the workflow.',
        schema: z.object({
          output: z.string().describe('Your complete findings, analysis, or output for this task'),
        }),
        execute: async (args: Record<string, unknown>) => {
          const output = (args as { output?: string }).output ?? '';
          onComplete(output);
          return { success: true, data: { _terminal: true } };
        },
      },
      stickyText: 'When DONE, call report_complete with your full output. This delivers your work to the next workflow step.',
    };
  }

  const shape: Record<string, any> = {};
  for (const field of schema.fields) {
    let fieldSchema: any;
    switch (field.type) {
      case 'string': fieldSchema = z.string(); break;
      case 'string[]': fieldSchema = z.array(z.string()); break;
      case 'number': fieldSchema = z.number(); break;
      case 'boolean': fieldSchema = z.boolean(); break;
      case 'enum': fieldSchema = z.enum(field.enumValues as [string, ...string[]]); break;
      default: fieldSchema = z.string();
    }
    if (field.description) fieldSchema = fieldSchema.describe(field.description);
    if (!field.required) fieldSchema = fieldSchema.optional();
    shape[field.name] = fieldSchema;
  }

  const toolDescription = schema.purpose
    ? `Call this when done. ${schema.purpose}`
    : 'Call this when you have finished your assigned task with the required structured output.';

  const fieldLines = schema.fields.map(f => {
    const req = f.required ? ', required' : '';
    const typeLabel = f.type === 'enum' ? f.enumValues!.join('/') : f.type;
    return `  - **${f.name}** (${typeLabel}${req}): ${f.description}`;
  });

  let stickyText = 'When your work is complete, call `report_complete` with:\n' + fieldLines.join('\n');
  if (schema.stickyDescription) {
    stickyText = schema.stickyDescription + '\n\n' + stickyText;
  }
  if (schema.purpose) {
    stickyText += `\n\n${schema.purpose}`;
  }

  return {
    tool: {
      name: 'report_complete',
      description: toolDescription,
      schema: z.object(shape),
      execute: async (args: Record<string, unknown>) => {
        const output = JSON.stringify(args, null, 2);
        onComplete(output);
        return { success: true, data: { _terminal: true } };
      },
    },
    stickyText,
  };
}
