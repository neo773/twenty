# Computed Fields Implementation Guide

## Overview

This document outlines the implementation of computed fields in the Twenty CRM system. Computed fields are database columns that are calculated asynchronously in the background when communication events occur, then cached for fast query access.

## Architecture Summary

### Core Design Principles
1. **Background Computation**: Compute functions NEVER execute during GraphQL queries
2. **Cached Results**: Queries only read pre-computed cached database values  
3. **Event-Driven**: Computation happens asynchronously when communication events occur
4. **Type Safety**: Full TypeScript support with React Hook-style dependency arrays
5. **Permission Aware**: Uses existing permission system for database operations

### Event Flow
```
Communication Event → EntityEventsToDbListener → ProcessComputedFieldsJob → 
Filter Events → Execute Compute Functions → Update Cached Values → Fast Query Access
```

## Implementation Status

### ✅ Phase 1: Workspace Field Decorator (COMPLETED)
Extended the `@WorkspaceField` decorator to support compute functions with React Hook-style syntax.

**Files Created/Modified:**
- `src/engine/twenty-orm/types/pre-computed-field-dependencies.enum.ts`
- `src/engine/twenty-orm/interfaces/compute-field-context.interface.ts`
- `src/engine/twenty-orm/utils/define-compute-function.util.ts`
- `src/engine/twenty-orm/decorators/workspace-field.decorator.ts` (extended)
- `src/engine/twenty-orm/interfaces/workspace-field-metadata-args.interface.ts` (extended)

**Key Features:**
- Type-safe `defineComputeFunction()` factory
- Enforces return values (no void functions)
- React Hook-style dependencies array
- Full TypeScript integration

**Example Usage:**
```typescript
@WorkspaceField({
  type: FieldMetadataType.DATE_TIME,
  label: { id: 'lastMessageDate', message: 'Last Message Date' },
  computeFunction: defineComputeFunction(async (ctx) => {
    const messageRepository = await ctx.twentyORMManager.getRepositoryForWorkspace(
      ctx.workspaceId,
      'message',
      { shouldBypassPermissionChecks: true }
    );
    
    const lastMessage = await messageRepository.findOne({
      where: { messageParticipants: { person: { id: ctx.entityId } } },
      order: { createdAt: 'DESC' }
    });
    
    return lastMessage?.createdAt || null;
  }, [PreComputedFieldDependencies.Message, PreComputedFieldDependencies.MessageParticipant])
})
lastMessageDate: Date | null;
```

### ✅ Phase 2: Background Job Processing (COMPLETED)
Implemented the background processing system that executes compute functions when communication events occur.

**Files Created/Modified:**
- `src/modules/computed-fields/jobs/process-computed-fields.job.ts`
- `src/modules/computed-fields/services/computed-fields.service.ts`
- `src/modules/computed-fields/computed-fields.module.ts`
- `src/modules/modules.module.ts` (registered module)
- `src/engine/api/graphql/workspace-query-runner/listeners/entity-events-to-db.listener.ts` (extended)

**Key Features:**
- Two-level event filtering (job level + function level)
- Type-safe metadata discovery using `standardObjectMetadataDefinitions`
- Permission-aware database updates
- Proper logging and error handling
- Follows existing job processor patterns exactly

**Event Filtering Strategy:**
1. **Job Level**: Only `PreComputedFieldDependencies` events trigger the processor
2. **Function Level**: Each compute function only executes if its dependencies match event types

## Key Components

### PreComputedFieldDependencies Enum
```typescript
export enum PreComputedFieldDependencies {
  CalendarEvent = 'calendarEvent',
  Message = 'message',
  MessageParticipant = 'messageParticipant',
  CalendarEventParticipant = 'calendarEventParticipant',
}
```

### ComputeFieldContext Interface
```typescript
export interface ComputeFieldContext {
  entityId: string;        // ID of entity being computed for
  workspaceId: string;     // Workspace ID for scoped operations
  twentyORMManager: TwentyORMGlobalManager; // ORM with permission handling
}
```

### Current Integration Points
- **EntityEventsToDbListener**: Queues computed fields job alongside audit logs, timeline, webhooks
- **MessageQueue**: Uses existing `entityEventsToDbQueue` infrastructure
- **Permission System**: Leverages `shouldBypassPermissionChecks` for system operations
- **Metadata Discovery**: Uses `standardObjectMetadataDefinitions` for type-safe field discovery

## Remaining Work

### 📋 Phase 3: Enhanced Event Processing & Relationship Handling
**Status**: TODO

**Goals:**
- Improve `extractAffectedEntityIds()` to handle relationship changes
- When `messageParticipant` changes, find affected `person` entities
- When `calendarEventParticipant` changes, find affected `person` entities
- Implement smart batching to avoid duplicate computations

**Key Tasks:**
1. Enhance event analysis to trace relationships
2. Extract related entity IDs from event properties
3. Optimize batching for multiple events affecting same entities
4. Add proper error handling for edge cases

**Example Scenario:**
```
New message arrives → messageParticipant created → 
Find all persons in message participants → 
Execute person computed fields for each affected person
```

### 📋 Phase 4: Database Migration & Schema Generation
**Status**: TODO

**Goals:**
- Automatically create database columns for computed fields
- Handle schema migrations when computed fields are added/removed
- Integrate with existing workspace sync metadata system

**Key Tasks:**
1. Extend workspace metadata sync to detect computed fields
2. Generate database migrations for new computed field columns
3. Handle field type changes and migrations
4. Ensure computed fields are properly indexed for query performance

### 📋 Phase 5: Advanced Features & Optimizations
**Status**: TODO (Future Enhancement)

**Goals:**
- Dependency graph optimization
- Incremental computation strategies
- User-configurable computed fields (long-term vision)

**Key Tasks:**
1. Build dependency graph to optimize computation order
2. Implement incremental updates (only recompute when dependencies change)
3. Add computed field validation and testing utilities
4. Performance monitoring and optimization

## Testing Strategy

### Unit Testing
- Test `defineComputeFunction()` type safety
- Test event filtering logic
- Test metadata discovery
- Test permission handling

### Integration Testing
- Test end-to-end event flow
- Test database updates
- Test error handling
- Test performance under load

### Example Test Cases
```typescript
describe('ComputedFieldsService', () => {
  it('should discover computed fields from metadata', () => {
    // Test metadata discovery
  });

  it('should filter events by dependencies', () => {
    // Test event filtering
  });

  it('should execute compute functions with proper context', () => {
    // Test function execution
  });

  it('should update cached values in database', () => {
    // Test database updates
  });
});
```

## Performance Considerations

### Current Optimizations
- Background processing prevents query-time computation overhead
- Event filtering reduces unnecessary computation
- Permission-aware repositories maintain security
- Batch processing handles multiple events efficiently

### Future Optimizations
- Dependency graph analysis
- Smart caching strategies
- Incremental computation
- Performance monitoring

## Developer Guidelines

### Adding New Computed Fields
1. Use `@WorkspaceField` decorator with `computeFunction`
2. Define dependencies array matching trigger events
3. Ensure function returns a value (not void)
4. Use `ctx.twentyORMManager` for database access
5. Handle null/undefined cases appropriately

### Best Practices
1. Keep compute functions focused and efficient
2. Use proper error handling in compute logic
3. Follow existing naming conventions
4. Add appropriate logging for debugging
5. Consider edge cases and data validation

### Common Patterns
```typescript
// Simple field computation
@WorkspaceField({
  type: FieldMetadataType.NUMBER,
  computeFunction: defineComputeFunction(async (ctx) => {
    const repository = await ctx.twentyORMManager.getRepositoryForWorkspace(
      ctx.workspaceId,
      'entityName',
      { shouldBypassPermissionChecks: true }
    );
    
    const count = await repository.count({
      where: { relatedEntity: { id: ctx.entityId } }
    });
    
    return count;
  }, [PreComputedFieldDependencies.EntityType])
})
entityCount: number;
```

## Long-Term Vision

The computed fields system is designed to eventually support:
1. **Visual Query Builder**: UI for non-technical users to create computed fields
2. **Field Dependencies**: Computed fields that depend on other computed fields
3. **Advanced Aggregations**: Complex statistical computations
4. **Real-time Updates**: Near real-time computed field updates
5. **Custom Triggers**: User-defined events that trigger computations

The current implementation provides the foundation for these future enhancements while maintaining type safety and performance.

## Troubleshooting

### Common Issues
1. **Compute function not executing**: Check dependencies array matches triggering events
2. **Type errors**: Ensure compute function returns proper type
3. **Permission errors**: Verify `shouldBypassPermissionChecks` usage
4. **Performance issues**: Review compute function complexity and add logging

### Debugging Tips
1. Check logs for `ProcessComputedFieldsJob` and `ComputedFieldsService`
2. Verify event filtering is working correctly
3. Test compute functions in isolation
4. Monitor database performance for cached value updates

## Next Steps

To continue development:
1. Implement Phase 3 (Enhanced Event Processing)
2. Add comprehensive test coverage
3. Optimize performance based on real-world usage
4. Plan Phase 4 (Database Migration) integration
5. Gather feedback from initial computed field implementations 