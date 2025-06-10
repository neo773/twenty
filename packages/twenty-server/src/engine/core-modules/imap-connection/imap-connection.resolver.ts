import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { ConnectedAccountProvider } from 'twenty-shared/types';

import {
  ImapConnectionInput,
  ValidateImapConnectionInput,
} from 'src/engine/core-modules/imap-connection/dtos/imap-connection.dto';
import { ImapConnectionService } from 'src/engine/core-modules/imap-connection/services/imap-connection.service';
import { Workspace } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { GraphqlValidationExceptionFilter } from 'src/filters/graphql-validation-exception.filter';
import { ConnectedAccountWorkspaceEntity } from 'src/modules/connected-account/standard-objects/connected-account.workspace-entity';

@Resolver()
@UseFilters(
  GraphqlValidationExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
)
export class ImapConnectionResolver {
  constructor(
    private readonly imapConnectionService: ImapConnectionService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  @Mutation(() => Boolean)
  @UseGuards(WorkspaceAuthGuard)
  async validateImapConnection(
    @Args('input') input: ValidateImapConnectionInput,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<boolean> {
    // Only validate if the provider is IMAP
    if (input.provider !== ConnectedAccountProvider.IMAP) {
      return true;
    }

    // Validate the IMAP connection parameters
    this.imapConnectionService.validateImapParams({
      imapServer: input.imapServer,
      imapPort: input.imapPort,
      imapEncryption: input.imapEncryption,
      imapPassword: input.imapPassword,
    });

    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(WorkspaceAuthGuard)
  async upsertImapConnection(
    @Args('input') input: ImapConnectionInput,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<boolean> {
    const {
      id,
      accountOwnerId,
      handle,
      imapServer,
      imapPort,
      imapEncryption,
      imapPassword,
    } = input;

    // Validate and structure IMAP connection parameters
    const validatedParams = this.imapConnectionService.validateImapParams({
      imapServer,
      imapPort,
      imapEncryption,
      imapPassword,
    });

    const connectedAccountRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace<ConnectedAccountWorkspaceEntity>(
        workspace.id,
        'connectedAccount',
      );

    if (id) {
      // Update existing connected account
      await connectedAccountRepository.update(
        { id },
        {
          handle,
          provider: ConnectedAccountProvider.IMAP,
          connectionType: 'IMAP',
          customConnectionParams: validatedParams,
        },
      );
    } else {
      // Create a new connected account
      await connectedAccountRepository.save({
        accountOwnerId,
        handle,
        provider: ConnectedAccountProvider.IMAP,
        connectionType: 'IMAP',
        customConnectionParams: validatedParams,
      });
    }

    return true;
  }
}
