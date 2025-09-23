import { type MessageChannel } from '@/accounts/types/MessageChannel';
import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useParams } from 'react-router-dom';
import { SettingsAccountsPerFolderSettings } from './SettingsAccountsPerFolderSettings';
import { createContactCreationConfiguration } from './configurations/createContactCreationConfiguration';

export const SettingsAccountsPerFolderContactCreationSettings = () => {
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

  const { activeNonSystemObjectMetadataItems } = useFilteredObjectMetadataItems();

  const handleFolderContactCreationUpdate = (folder: MessageFolder, policy: string) => {
    updateOneRecord({
      idToUpdate: folder.id,
      updateOneRecordInput: {
        contactAutoCreationPolicy: policy,
      },
    });
  };

  const contactCreationConfiguration = createContactCreationConfiguration(
    activeNonSystemObjectMetadataItems,
    handleFolderContactCreationUpdate
  );

  if (!messageChannel?.messageFolders) {
    return null;
  }

  return (
    <SettingsAccountsPerFolderSettings
      folders={messageChannel.messageFolders}
      configuration={contactCreationConfiguration}
      objectMetadataItems={activeNonSystemObjectMetadataItems}
    />
  );
};
