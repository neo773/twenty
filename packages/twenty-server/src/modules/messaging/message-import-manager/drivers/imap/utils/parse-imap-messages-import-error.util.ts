import {
  MessageImportDriverException,
  MessageImportDriverExceptionCode,
} from 'src/modules/messaging/message-import-manager/drivers/exceptions/message-import-driver.exception';

/**
 * Parse IMAP message import errors and map them to specific MessageImportDriverException types
 */
export const parseImapMessagesImportError = (
  error: any,
  messageExternalId: string,
): MessageImportDriverException => {
  // Handle message not found errors
  if (
    error.message?.includes('Message not found') ||
    error.message?.includes('No such message')
  ) {
    return new MessageImportDriverException(
      `IMAP message not found: ${messageExternalId}`,
      MessageImportDriverExceptionCode.NOT_FOUND,
    );
  }

  // Handle message fetch errors
  if (error.message?.includes('Failed to fetch message')) {
    return new MessageImportDriverException(
      `IMAP message fetch error for message ${messageExternalId}: ${error.message}`,
      MessageImportDriverExceptionCode.TEMPORARY_ERROR,
    );
  }

  // Default case
  return new MessageImportDriverException(
    `Unknown IMAP message import error for message ${messageExternalId}: ${
      error.message || 'No error message'
    }`,
    MessageImportDriverExceptionCode.UNKNOWN,
  );
};
