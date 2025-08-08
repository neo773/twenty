import { type ComputeFieldContext } from 'src/engine/twenty-orm/interfaces/compute-field-context.interface';

import { type PreComputedFieldDependencies } from 'src/engine/twenty-orm/types/pre-computed-field-dependencies.enum';

export type ComputeFunction<T = any> = (
  context: ComputeFieldContext,
) => Promise<T>;

export type PreComputedFieldFunction<T = any> = {
  computeFunction: ComputeFunction<T>;
  dependencies: PreComputedFieldDependencies[];
};

/**
 * Defines a compute function for a workspace field with type safety and dependency tracking.
 * Similar to React's useEffect pattern with dependencies.
 *
 * @param computeFunction - The function that computes the field value. Must return a value (not void).
 * @param dependencies - Array of entity types that trigger this computation when changed.
 * @returns A compute function definition with metadata for the workspace field system.
 *
 * @example
 * ```typescript
 * defineComputeFunction(async (ctx) => {
 *   const messageRepository = await ctx.twentyORMManager.getRepository('message');
 *   const lastMessage = await messageRepository.findOne({
 *     where: { messageParticipants: { person: { id: ctx.entityId } } },
 *     order: { createdAt: 'DESC' }
 *   });
 *   return lastMessage?.createdAt || null;
 * }, [PreComputedFieldDependencies.Message, PreComputedFieldDependencies.MessageParticipant])
 * ```
 */
export function definePreComputedFieldFunction<T>(
  computeFunction: ComputeFunction<T>,
  dependencies: PreComputedFieldDependencies[],
): PreComputedFieldFunction<T> {
  type ReturnType = T extends void ? never : T;

  return {
    computeFunction: computeFunction as ComputeFunction<ReturnType>,
    dependencies,
  };
}
