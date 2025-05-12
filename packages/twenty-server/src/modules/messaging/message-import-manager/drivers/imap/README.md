# IMAP Integration for Twenty

This module provides IMAP email integration for Twenty, allowing users to connect their email accounts via IMAP.

## Architecture

The IMAP integration follows the same pattern as Gmail and Microsoft integrations but uses the ImapFlow library to communicate with IMAP servers.

### Key Components

- `ImapClientProvider` - Manages connections to IMAP servers
- `ImapGetMessageListService` - Retrieves message lists from IMAP servers
- `ImapGetMessagesService` - Fetches individual messages from IMAP servers
- `ImapHandleErrorService` - Handles IMAP-specific errors
- `IMAPAPIsService` - Coordinates the account setup and synchronization

## Implementation Details

### Message Structure

The IMAP implementation converts IMAP messages to the standard Twenty Message format:

```typescript
const message: Message = {
  externalId: messageId,
  messageThreadExternalId: messageId, // Use message ID as thread ID
  headerMessageId: messageId, // Required field for Message type
  subject: fetchResult.envelope?.subject || '',
  text: this.extractSnippet(rawContent),
  receivedAt: new Date(fetchResult.envelope?.date || new Date()),
  direction: MessageDirection.INCOMING,
  attachments: [],
};
```

### Error Handling

IMAP errors are handled by updating the message channel status:

```typescript
const updatedMessageChannel = await messageChannelRepository.update(
  { id: messageChannelId },
  {
    syncStatus: MessageChannelSyncStatus.FAILED_UNKNOWN,
  },
);
```

## Configuration

To enable IMAP integration, set `MESSAGING_PROVIDER_IMAP_ENABLED=true` in your environment variables.

## Connecting an IMAP Account

Users can connect IMAP accounts by providing:

- Email address (handle)
- IMAP server hostname
- IMAP port (typically 993 for SSL)
- Encryption type (SSL or TLS)
- Password

## Limitations

- Unlike Gmail and Microsoft, IMAP doesn't provide threading information. Message IDs are used as thread IDs.
- IMAP doesn't have concepts like labels or history IDs, so some features may be limited compared to Gmail.
- Password storage should be properly secured in production environments.
- Message bodies may require additional parsing depending on the IMAP server implementation.
- Search functionality varies between IMAP server implementations.

## Future Improvements

- Add encryption for stored IMAP passwords
- Implement more robust error handling for various IMAP server types
- Add support for custom folder structures
- Optimize synchronization for large mailboxes
- Improve message parsing to handle complex MIME structures
- Add support for IMAP IDLE for real-time updates 