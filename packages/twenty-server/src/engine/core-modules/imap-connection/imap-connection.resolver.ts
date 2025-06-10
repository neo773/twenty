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
import { IMAPAPIsService } from 'src/modules/connected-account/services/imap-apis.service';
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
    private readonly imapApisService: IMAPAPIsService,
  ) {}

  @Mutation(() => Boolean)
  @UseGuards(WorkspaceAuthGuard)
  async validateImapConnection(
    @Args('input') input: ValidateImapConnectionInput,
    @AuthWorkspace() _workspace: Workspace,
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

    if (id) {
      // Update existing connected account
      const connectedAccountRepository =
        await this.twentyORMGlobalManager.getRepositoryForWorkspace<ConnectedAccountWorkspaceEntity>(
          workspace.id,
          'connectedAccount',
        );

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
      // Use the IMAP APIs service to properly create both connected account and message channel
      await this.imapApisService.setupIMAPAccount({
        handle,
        workspaceMemberId: accountOwnerId,
        workspaceId: workspace.id,
        imapServer: validatedParams.imapServer as string,
        imapPort: validatedParams.imapPort as number,
        imapEncryption: validatedParams.imapEncryption as string,
        imapPassword: validatedParams.imapPassword as string,
        messageVisibility: undefined, // Will use default SHARE_EVERYTHING
      });
    }

    return true;
  }
}
