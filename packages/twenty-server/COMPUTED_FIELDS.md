# Computed Fields Specification

## Context from Codebase Analysis

### Current Event Processing Pipeline
- **Location**: `packages/twenty-server/src/engine/api/graphql/workspace-query-runner/listeners/entity-events-to-db.listener.ts`
- **Function**: Captures all entity changes and distributes to multiple background jobs
- **Pattern**: Uses `Promise.all()` to queue multiple jobs simultaneously (audit logs, timeline activities, webhooks, subscriptions)

### Existing Background Job Pattern
- **Example**: `UpsertTimelineActivityFromInternalEvent` in `packages/twenty-server/src/modules/timeline/jobs/`
- **Event Filtering**: Filters events by `event.objectMetadata.nameSingular` and `isSystem` flag
- **Processing**: Handles batched events, filters relevant ones, processes in background

### Current Generated Fields Pattern
- **Example**: `searchVector` field in workspace entities
- **Implementation**: Uses `asExpression` with SQL string returned by `getTsVectorColumnExpressionFromFields`
- **Storage**: Database-computed, stored columns that don't require runtime computation

## Architecture Overview

### Design Goal
Create inline compute functions that execute in background on communication events, cache results in database columns for fast query access.

### Core Components

1. **Field Definition Enhancement**
   - Extend `WorkspaceField` decorator to support inline compute functions
   - Add `isPreComputedField` and `computeFunction` properties
   - Functions define dependencies and execution logic

2. **Background Processing Integration**
   - Add new job processor to existing `EntityEventsToDbListener` pipeline
   - Filter events to only enum `PreComputedFieldDependencies`
   - Execute compute functions and update cached values

3. **Function Definition System**
   - `defineComputeFunction()` factory for type-safe function creation
   - Permission-aware execution context

## Pipeline Flow

### Event-Driven Computation
```
Communication Event → EntityEventsToDbListener → ProcessPreComputedFieldsJob → 
Execute Functions → Update Cached Values
```

### Critical Separation
- Compute functions NEVER execute during queries
- Queries only read pre-computed cached database values
- Computation happens asynchronously in background

## Integration Points

### 1. EntityEventsToDbListener Extension
- **Location**: Add new job queue alongside existing timeline/audit jobs
- **Event Filtering**: Only process message, calendar, messageParticipant, calendarEventParticipant events
- **Pattern**: Follow existing `auditLogsEvents.length > 0` conditional pattern

### 2. Job Processor
- **Queue**: Use existing `MessageQueue.entityEventsToDbQueue`
- **Pattern**: Follow `UpsertTimelineActivityFromInternalEvent` structure
- **Processing**: Filter relevant events, batch process affected entities

### 3. Field Metadata Storage
- **Integration**: Extend existing `WorkspaceFieldMetadataArgs` interface
- **Storage**: Store function references (not serialized) in field metadata
- **Migration**: Create database columns for caching computed values

## High-Level Syntax

### Field Definition
```typescript
enum PreComputedFieldDependencies {
  CalendarEvent = 'CalendarEvent',
  MessageEmailEvent = 'MessageEmailEvent',
}

@WorkspaceField({
  type: FieldMetadataType.DATE_TIME,
  isPreComputedField: true,
  // react hook like syntax
  computeFunction: defineComputeFunction(async (ctx) => {
    const messageRepository = await ctx.twentyORMManager.getRepository<MessageWorkspaceEntity>(
      'message',
    );
   const lastMessage = await messageRepository.findOne({
      where: { messageParticipants: { person: { id: ctx.entityId } } },
      order: { createdAt: 'DESC' }
    });
    return lastMessage?.createdAt || null;
  }, [PreComputedFieldDependencies.MessageEmailEvent])
})
fieldName: Date | null;
```

## Event Filtering Strategy

### Trigger Events 
based on enum `PreComputedFieldDependencies`

### Efficiency Requirements
- Do NOT trigger on every entity change
- Do NOT execute functions during query time
- DO use existing batch processing patterns
- DO leverage existing permission-aware entity managers

## Implementation Requirements

### Must Follow Existing Patterns
1. Use existing `WorkspaceField` decorator extension pattern
2. Follow `EntityEventsToDbListener` job queue pattern
3. Use existing event filtering approach from timeline jobs
4. Leverage existing permission validation from `WorkspaceEntityManager`

### Must NOT
1. Execute compute functions during GraphQL queries
2. Create new message queues (use existing `entityEventsToDbQueue`)
3. Bypass existing permission layers
4. Trigger computation on all entity changes

### Critical Files to Modify
1. `workspace-field.decorator.ts` - Add field options
2. `workspace-field-metadata-args.interface.ts` - Extend interface
3. `entity-events-to-db.listener.ts` - Add job queue
4. Create new job processor following existing patterns

## Performance Considerations

### Database Impact
- Computed values stored as regular database columns
- No query-time computation overhead
- Background processing only on communication events

### Scalability
- Batch processing of affected entities
- Efficient event filtering reduces unnecessary computation
- Leverages existing message queue infrastructure 