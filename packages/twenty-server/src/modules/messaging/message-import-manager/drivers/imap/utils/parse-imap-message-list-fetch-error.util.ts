import {
  MessageImportDriverException,
  MessageImportDriverExceptionCode,
} from 'src/modules/messaging/message-import-manager/drivers/exceptions/message-import-driver.exception';

/**
 * Parse IMAP message list fetch errors and map them to specific MessageImportDriverException types
 */
export const parseImapMessageListFetchError = (
  error: any,
): MessageImportDriverException => {
  // Handle sync cursor errors
  if (
    error.message?.includes('Invalid search query') ||
    error.message?.includes('Invalid sequence set')
  ) {
    return new MessageImportDriverException(
      `IMAP sync cursor error: ${error.message}`,
      MessageImportDriverExceptionCode.SYNC_CURSOR_ERROR,
    );
  }

  // Handle no next sync cursor errors
  if (error.message?.includes('No messages found')) {
    return new MessageImportDriverException(
      'No messages found for next sync cursor',
      MessageImportDriverExceptionCode.NO_NEXT_SYNC_CURSOR,
    );
  }

  // Default case
  return new MessageImportDriverException(
    `Unknown IMAP message list fetch error: ${error.message || 'No error message'}`,
    MessageImportDriverExceptionCode.UNKNOWN,
  );
};
