import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useParams } from 'react-router-dom';
import { MessageChannelVisibility } from '~/generated/graphql';
import { SettingsAccountsPerFolderSettings } from './SettingsAccountsPerFolderSettings';
import { createVisibilityConfiguration } from './configurations/createVisibilityConfiguration';

export const SettingsAccountsPerFolderVisibilitySettings = () => {
  const { accountId } = useParams<{ accountId: string }>();
  
  const { updateOneRecord } = useUpdateOneRecord<MessageFolder>({
    objectNameSingular: CoreObjectNameSingular.MessageFolder,
  });

  const { record: messageChannel } = useFindOneRecord<MessageChannel>({
    objectNameSingular: CoreObjectNameSingular.MessageChannel,
    objectRecordId: accountId || '',
    recordGqlFields: {
      id: true,
      messageFolders: {
        id: true,
        name: true,
        syncCursor: true,
        isSentFolder: true,
        isSynced: true,
        messageChannelId: true,
      },
    },
  });

  const handleFolderVisibilityUpdate = (folder: MessageFolder, visibility: MessageChannelVisibility) => {
    updateOneRecord({
      idToUpdate: folder.id,
      updateOneRecordInput: {
        visibility: visibility,
      },
    });
  };

  const visibilityConfiguration = createVisibilityConfiguration(handleFolderVisibilityUpdate);

  if (!messageChannel?.messageFolders) {
    return null;
  }

  return (
    <SettingsAccountsPerFolderSettings
      folders={messageChannel.messageFolders}
      configuration={visibilityConfiguration}
    />
  );
};
