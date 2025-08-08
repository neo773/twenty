import { type TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';

export interface ComputeFieldContext {
  /**
   * The ID of the entity being computed for
   */
  entityId: string;

  /**
   * The ID of the entity that triggered the computation (e.g., calendar event ID)
   */
  triggerEventEntityId: string;

  /**
   * The workspace ID for scoped operations
   */
  workspaceId: string;

  /**
   * ORM manager for database operations with permission handling
   */
  twentyORMManager: TwentyORMGlobalManager;
}
