import {
    MessageChannelFolderContactAutoCreationPolicy,
    MessageFolderVisibility,
} from '@/accounts/types/MessageFolder';
import { SettingsAccountsMessageFoldersTableRows } from '@/settings/accounts/components/message-folders-new/SettingsAccountsMessageFoldersTableRows';
import { selectedMessageChannelState } from '@/settings/accounts/states/selectedMessageChannelState';
import { type SelectValue } from '@/ui/input/components/internal/select/types';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { Table } from '@/ui/layout/table/components/Table';
import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { t } from '@lingui/core/macro';
import isEmpty from 'lodash.isempty';
import { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { isDefined } from 'twenty-shared/utils';
import {
    IconBan,
    IconBuildingSkyscraper,
    IconEye,
    IconUserPlus,
} from 'twenty-ui/display';
import { type SelectOption } from 'twenty-ui/input';

type SettingsAccountsMessageFoldersProps = {
  // TODO: better naming
  type: 'contactAutoCreationPolicy' | 'visibility';
};

const StyledSearchInput = styled(SettingsTextInput)`
  padding-bottom: ${({ theme }) => theme.spacing(2)};
  width: 100%;
`;

const StyledTableRows = styled.div`
  display: flex;
  flex-direction: column;
`;

export const SettingsAccountsMessageFolders = ({
  type,
}: SettingsAccountsMessageFoldersProps) => {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState('');

  const selectedMessageChannel = useRecoilValue(selectedMessageChannelState);

  const filteredFolders = useMemo(() => {
    return (
      selectedMessageChannel?.messageFolders.filter((folder) =>
        folder.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ) || []
    );
  }, [selectedMessageChannel?.messageFolders, searchTerm]);

  if (
    !isDefined(selectedMessageChannel?.messageFolders) ||
    isEmpty(selectedMessageChannel?.messageFolders)
  ) {
    return (
      <div style={{ color: theme.font.color.light }}>{t`No folders found`}</div>
    );
  }

  const contactCreationOptions: SelectOption[] = [
    {
      label: t`People and companies`,
      value: MessageChannelFolderContactAutoCreationPolicy.PEOPLE_AND_COMPANIES,
      Icon: IconUserPlus,
    },
    {
      label: t`Companies`,
      value: MessageChannelFolderContactAutoCreationPolicy.COMPANIES,
      Icon: IconBuildingSkyscraper,
    },
    {
      label: t`None`,
      value: MessageChannelFolderContactAutoCreationPolicy.NONE,
      Icon: IconBan,
    },
  ];

  const visibilityOptions: SelectOption[] = [
    {
      label: t`Metadata`,
      value: MessageFolderVisibility.METADATA,
      Icon: IconEye,
    },
    {
      label: t`Subject`,
      value: MessageFolderVisibility.SUBJECT,
      Icon: IconEye,
    },
    {
      label: t`Share Everything`,
      value: MessageFolderVisibility.EVERYTHING,
      Icon: IconEye,
    },
  ];
  const onChange = (value: SelectValue) => {
    console.log(value);
  };

  return (
    <>
      <StyledSearchInput
        placeholder="Search folders..."
        value={searchTerm}
        onChange={(searchTerm) => setSearchTerm(searchTerm)}
        autoFocus={false}
        instanceId={'settings-accounts-message-folders-search'}
      />

      <Table>
        <StyledTableRows>
          {selectedMessageChannel.messageFolders.length > 0 ? (
            selectedMessageChannel.messageFolders.map((folder) => (
              <SettingsAccountsMessageFoldersTableRows
                key={folder.id}
                onChange={onChange}
                options={
                  type === 'visibility'
                    ? visibilityOptions
                    : contactCreationOptions
                }
                folder={folder}
              />
            ))
          ) : (
            <div style={{ color: theme.font.color.light }}>
              No folders found
            </div>
          )}
        </StyledTableRows>
      </Table>
    </>
  );
};
