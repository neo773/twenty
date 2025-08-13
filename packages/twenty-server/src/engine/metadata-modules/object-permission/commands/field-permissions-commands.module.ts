import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Workspace } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PopulateFieldPermissionsCanEditInUICommand } from 'src/engine/metadata-modules/object-permission/commands/populate-field-permissions-can-edit-in-ui.command';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        Workspace,
        FieldPermissionEntity,
        FieldMetadataEntity,
        ObjectMetadataEntity,
      ],
      'core',
    ),
  ],
  providers: [PopulateFieldPermissionsCanEditInUICommand],
  exports: [PopulateFieldPermissionsCanEditInUICommand],
})
export class FieldPermissionsCommandsModule {}
