import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { IconFolder, IconSend } from 'twenty-ui/display';

export const getMessageFolderIcon = (folder: MessageFolder) => {
  return folder.isSentFolder ? <IconSend /> : <IconFolder />;
};
