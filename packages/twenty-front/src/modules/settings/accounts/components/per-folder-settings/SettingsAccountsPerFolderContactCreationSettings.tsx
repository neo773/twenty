import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { selectedMessageChannelState } from '@/settings/accounts/states/selectedMessageChannelState';
import { useRecoilValue } from 'recoil';
import { SettingsAccountsPerFolderSettings } from './SettingsAccountsPerFolderSettings';
import { createContactCreationConfiguration } from './configurations/createContactCreationConfiguration';

export const SettingsAccountsPerFolderContactCreationSettings = () => {
  const { updateOneRecord } = useUpdateOneRecord<MessageFolder>({
    objectNameSingular: CoreObjectNameSingular.MessageFolder,
  });

  const selectedMessageChannel = useRecoilValue(selectedMessageChannelState);

  const { activeNonSystemObjectMetadataItems } =
    useFilteredObjectMetadataItems();

  const handleFolderContactCreationUpdate = (
    folder: MessageFolder,
    policy: string,
  ) => {
    updateOneRecord({
      idToUpdate: folder.id,
      updateOneRecordInput: {
        contactAutoCreationPolicy: policy,
      },
    });
  };

  const contactCreationConfiguration = createContactCreationConfiguration(
    activeNonSystemObjectMetadataItems,
    handleFolderContactCreationUpdate,
  );

  if (!selectedMessageChannel?.messageFolders) {
    return null;
  }

  return (
    <SettingsAccountsPerFolderSettings
      folders={selectedMessageChannel.messageFolders}
      configuration={contactCreationConfiguration}
      objectMetadataItems={activeNonSystemObjectMetadataItems}
    />
  );
};
