import {
  MessageImportDriverException,
  MessageImportDriverExceptionCode,
} from 'src/modules/messaging/message-import-manager/drivers/exceptions/message-import-driver.exception';

/**
 * Parse IMAP errors and map them to specific MessageImportDriverException types
 */
export const parseImapError = (
  error: any,
): MessageImportDriverException | null => {
  if (!error) {
    return null;
  }

  const errorMessage = error.message || '';

  // Connection errors
  if (
    errorMessage.includes('Connection timed out') ||
    errorMessage.includes('Network error') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND')
  ) {
    return new MessageImportDriverException(
      `IMAP connection error: ${errorMessage}`,
      MessageImportDriverExceptionCode.UNKNOWN_NETWORK_ERROR,
    );
  }

  // Authentication errors
  if (
    errorMessage.includes('Invalid credentials') ||
    errorMessage.includes('Authentication failed') ||
    errorMessage.includes('LOGIN failed')
  ) {
    return new MessageImportDriverException(
      `IMAP authentication error: ${errorMessage}`,
      MessageImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
    );
  }

  // Not found errors
  if (
    errorMessage.includes('Mailbox not found') ||
    errorMessage.includes('No such mailbox')
  ) {
    return new MessageImportDriverException(
      `IMAP mailbox not found: ${errorMessage}`,
      MessageImportDriverExceptionCode.NOT_FOUND,
    );
  }

  // Temporary errors
  if (
    errorMessage.includes('Too many simultaneous connections') ||
    errorMessage.includes('Resource temporarily unavailable') ||
    errorMessage.includes('Service unavailable')
  ) {
    return new MessageImportDriverException(
      `IMAP temporary error: ${errorMessage}`,
      MessageImportDriverExceptionCode.TEMPORARY_ERROR,
    );
  }

  return null;
};
