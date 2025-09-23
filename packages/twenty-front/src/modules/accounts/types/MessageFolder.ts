export enum MessageFolderVisibility {
  NONE = 'NONE',
  METADATA = 'METADATA',
  SUBJECT = 'SUBJECT',
  EVERYTHING = 'EVERYTHING',
}

export enum MessageChannelFolderContactAutoCreationPolicy {
  NONE = 'NONE',
  PEOPLE_AND_COMPANIES = 'PEOPLE_AND_COMPANIES',
  COMPANIES = 'COMPANIES',
}

export type MessageFolder = {
  id: string;
  name: string;
  syncCursor: string;
  isSentFolder: boolean;
  isSynced: boolean;
  messageChannelId: string;
  visibility: MessageFolderVisibility;
  contactAutoCreationPolicy: MessageChannelFolderContactAutoCreationPolicy;
  __typename: 'MessageFolder';
};
