import { Module } from '@nestjs/common';

import { ImapConnectionResolver } from './imap-connection.resolver';

import { ImapConnectionService } from './services/imap-connection.service';

@Module({
  providers: [ImapConnectionResolver, ImapConnectionService],
  exports: [ImapConnectionService],
})
export class ImapConnectionModule {}
