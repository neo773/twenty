import { Injectable } from '@nestjs/common';

import { z } from 'zod';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

@Injectable()
export class ImapConnectionValidatorService {
  private readonly imapConnectionSchema = z.object({
    imapServer: z.string().min(1, 'IMAP server is required'),
    imapPort: z.number().int().positive('Port must be a positive number'),
    imapEncryption: z.string().min(1, 'IMAP encryption is required'),
    imapPassword: z.string().min(1, 'Password is required'),
  });

  /**
   * Validates the IMAP connection parameters
   * @param customParams - JSON string or object containing IMAP connection parameters
   * @returns Validated IMAP connection parameters
   * @throws UserInputError if validation fails
   */
  validateImapConnectionParams(
    customParams: string | Record<string, unknown> | null | undefined,
  ): z.infer<typeof this.imapConnectionSchema> {
    if (!customParams) {
      throw new UserInputError('IMAP connection parameters are required');
    }

    let paramsObject: Record<string, unknown>;

    // Parse JSON string if needed
    if (typeof customParams === 'string') {
      try {
        paramsObject = JSON.parse(customParams);
      } catch (error) {
        throw new UserInputError(
          'Invalid JSON format for IMAP connection parameters',
        );
      }
    } else {
      paramsObject = customParams;
    }

    try {
      // Validate against schema
      return this.imapConnectionSchema.parse(paramsObject);
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

  /**
   * Creates a valid customConnectionParams object from either provided JSON or individual fields
   * @param input - Either JSON string or individual IMAP fields
   * @returns Validated and structured customConnectionParams object
   */
  createValidConnectionParams(input: {
    customConnectionParams?: string;
    imapServer?: string;
    imapPort?: number;
    imapEncryption?: string;
    imapPassword?: string;
  }): Record<string, unknown> {
    // If customConnectionParams is provided, validate it
    if (input.customConnectionParams) {
      return this.validateImapConnectionParams(input.customConnectionParams);
    }

    // If individual fields are provided, validate them
    const connectionParams = {
      imapServer: input.imapServer,
      imapPort: input.imapPort,
      imapEncryption: input.imapEncryption,
      imapPassword: input.imapPassword,
    };

    return this.validateImapConnectionParams(connectionParams);
  }
}
