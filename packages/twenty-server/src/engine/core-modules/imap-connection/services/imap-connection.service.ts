import { Injectable } from '@nestjs/common';

import { z } from 'zod';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

@Injectable()
export class ImapConnectionService {
  private readonly imapParamsSchema = z.object({
    imapServer: z.string().min(1, 'IMAP server is required'),
    imapPort: z.number().int().positive('Port must be a positive number'),
    imapEncryption: z.string().min(1, 'IMAP encryption is required'),
    imapPassword: z.string().min(1, 'Password is required'),
  });

  /**
   * Validates the IMAP connection parameters
   * @param params - Object containing IMAP connection parameters
   * @returns Validated IMAP connection parameters
   * @throws UserInputError if validation fails
   */
  validateImapParams(params: {
    imapServer?: string;
    imapPort?: number;
    imapEncryption?: string;
    imapPassword?: string;
  }): z.infer<typeof this.imapParamsSchema> {
    try {
      // Validate against schema
      return this.imapParamsSchema.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');

        throw new UserInputError(
          `IMAP connection validation failed: ${errorMessages}`,
        );
      }

      throw new UserInputError('IMAP connection validation failed');
    }
  }
}
