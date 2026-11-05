import type { PipeTransform } from '@nestjs/common';
import { AppError } from '@realtime-chat/contracts';
import type { z } from 'zod';

/**
 * Validates (and normalises: trim, lowercase, coerce…) a body, query or param
 * with a contracts schema. Usage: `@Body(new ZodValidationPipe(schema))`.
 * Failures become VALIDATION_FAILED with one detail per invalid field.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppError(
      'VALIDATION_FAILED',
      'Request validation failed',
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
}
