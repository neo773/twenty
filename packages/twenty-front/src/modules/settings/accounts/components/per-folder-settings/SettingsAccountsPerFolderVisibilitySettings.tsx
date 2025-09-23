import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { selectedMessageChannelState } from '@/settings/accounts/states/selectedMessageChannelState';
import { useTheme } from '@emotion/react';
import { useLingui } from '@lingui/react/macro';
import isEmpty from 'lodash.isempty';
import { useRecoilValue } from 'recoil';
import { isDefined } from 'twenty-shared/utils';
import { type MessageChannelVisibility } from '~/generated/graphql';
import { SettingsAccountsPerFolderSettings } from './SettingsAccountsPerFolderSettings';
import { createVisibilityConfiguration } from './configurations/createVisibilityConfiguration';

export const SettingsAccountsPerFolderVisibilitySettings = () => {
  const { t } = useLingui();
  const theme = useTheme();

  const { updateOneRecord } = useUpdateOneRecord<MessageFolder>({
    objectNameSingular: CoreObjectNameSingular.MessageFolder,
  });

  const selectedMessageChannel = useRecoilValue(selectedMessageChannelState);

  const handleFolderVisibilityUpdate = (
    folder: MessageFolder,
    visibility: MessageChannelVisibility,
  ) => {
    updateOneRecord({
      idToUpdate: folder.id,
      updateOneRecordInput: {
        visibility: visibility,
      },
    });
  };

  const visibilityConfiguration = createVisibilityConfiguration(
    handleFolderVisibilityUpdate,
  );

  if (
    !isDefined(selectedMessageChannel?.messageFolders) ||
    isEmpty(selectedMessageChannel?.messageFolders)
  ) {
    return (
      <div style={{ color: theme.font.color.light }}>
        {JSON.stringify(selectedMessageChannel)}
        {t`No folders found`}
      </div>
    );
  }

  return (
    <SettingsAccountsPerFolderSettings
      folders={selectedMessageChannel?.messageFolders}
      configuration={visibilityConfiguration}
    />
  );
};
