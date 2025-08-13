import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { Repository } from 'typeorm';

import {
  ActiveOrSuspendedWorkspacesMigrationCommandRunner,
  RunOnWorkspaceArgs,
} from 'src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner';
import { Workspace } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';

@Command({
  name: 'field-permissions:populate-can-edit-in-ui',
  description:
    'Populate initial canEditInUI values for existing field permissions based on business logic',
})
export class PopulateFieldPermissionsCanEditInUICommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  protected readonly logger = new Logger(
    PopulateFieldPermissionsCanEditInUICommand.name,
  );

  constructor(
    @InjectRepository(Workspace, 'core')
    protected readonly workspaceRepository: Repository<Workspace>,
    protected readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {
    super(workspaceRepository, twentyORMGlobalManager);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    this.logger.log(
      `Populating canEditInUI values for workspace: ${workspaceId}`,
    );

    const coreDataSource =
      await this.twentyORMGlobalManager.getDataSourceForWorkspace({
        workspaceId,
      });

    await coreDataSource.transaction(async (manager) => {
      const fieldPermissionRepository = manager.getRepository(
        FieldPermissionEntity,
      );

      const fieldPermissions = await fieldPermissionRepository
        .createQueryBuilder('fieldPermission')
        .leftJoinAndSelect('fieldPermission.fieldMetadata', 'fieldMetadata')
        .leftJoinAndSelect('fieldPermission.objectMetadata', 'objectMetadata')
        .where('fieldPermission.workspaceId = :workspaceId', { workspaceId })
        .getMany();

      let processedCount = 0;
      let errorCount = 0;

      for (const fieldPermission of fieldPermissions) {
        try {
          const fieldMetadata = fieldPermission.fieldMetadata;
          const objectMetadata = fieldPermission.objectMetadata;

          // Skip if relations are not loaded
          if (!fieldMetadata || !objectMetadata) {
            this.logger.warn(
              `Skipping field permission ${fieldPermission.id} - missing relations`,
            );
            continue;
          }

          // Encode all existing business logic into canEditInUI values
          const canEditInUI = this.computeCanEditInUIValue(
            objectMetadata,
            fieldMetadata,
          );

          await fieldPermissionRepository.update(
            { id: fieldPermission.id },
            { canEditInUI },
          );

          processedCount++;

          if (processedCount % 100 === 0) {
            this.logger.log(
              `Processed ${processedCount}/${fieldPermissions.length} field permissions`,
            );
          }
        } catch (error) {
          errorCount++;
          this.logger.warn(
            `Error processing field permission ${fieldPermission.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Completed processing ${processedCount} field permissions for workspace: ${workspaceId} (${errorCount} errors)`,
      );
    });
  }

  private computeCanEditInUIValue(
    objectMetadata: ObjectMetadataEntity,
    fieldMetadata: FieldMetadataEntity,
  ): boolean | null {
    // Apply all the hardcoded business rules that were in isFieldReadOnlyBySystem

    // Special workflow JSON fields are editable
    if (
      this.isWorkflowRunJsonField(
        objectMetadata.nameSingular,
        fieldMetadata.name,
      )
    ) {
      return null; // Editable
    }

    // Workflow sub-objects (non-custom) are not editable
    if (
      this.isWorkflowSubObjectMetadata(objectMetadata.nameSingular) &&
      !fieldMetadata.isCustom
    ) {
      return false;
    }

    // Calendar events are not editable
    if (objectMetadata.nameSingular === 'calendarEvent') {
      return false;
    }

    // Workflow objects (except name field and custom fields) are not editable
    if (
      objectMetadata.nameSingular === 'workflow' &&
      fieldMetadata.name !== 'name' &&
      !fieldMetadata.isCustom
    ) {
      return false;
    }

    // Note targets on non-Note objects are not editable
    if (
      objectMetadata.nameSingular !== 'note' &&
      fieldMetadata.name === 'noteTargets'
    ) {
      return false;
    }

    // Task targets on non-Task objects are not editable
    if (
      objectMetadata.nameSingular !== 'task' &&
      fieldMetadata.name === 'taskTargets'
    ) {
      return false;
    }

    // createdAt/updatedAt date fields are not editable
    if (
      (fieldMetadata.type === 'DATE' || fieldMetadata.type === 'DATE_TIME') &&
      (fieldMetadata.name === 'createdAt' || fieldMetadata.name === 'updatedAt')
    ) {
      return false;
    }

    // Actor and RichText fields are not editable
    if (
      fieldMetadata.type === 'ACTOR' ||
      fieldMetadata.type === 'RICH_TEXT' ||
      fieldMetadata.type === 'RICH_TEXT_V2'
    ) {
      return false;
    }

    // System fields are generally not editable
    if (fieldMetadata.isSystem) {
      return false;
    }

    // Default to editable
    return null;
  }

  private isWorkflowRunJsonField(
    objectNameSingular: string,
    fieldName?: string,
  ): boolean {
    return objectNameSingular === 'workflowRun' && fieldName === 'result';
  }

  private isWorkflowSubObjectMetadata(objectNameSingular: string): boolean {
    return [
      'workflowRun',
      'workflowVersion',
      'workflowAutomatedTrigger',
    ].includes(objectNameSingular);
  }
}
