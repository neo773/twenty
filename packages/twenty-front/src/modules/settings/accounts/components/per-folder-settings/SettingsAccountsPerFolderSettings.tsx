import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { SettingsAccountsPerFolderSettingsHeader } from '@/settings/accounts/components/per-folder-settings/SettingsAccountsPerFolderSettingsHeader';
import { SettingsAccountsPerFolderSettingsRow } from '@/settings/accounts/components/per-folder-settings/SettingsAccountsPerFolderSettingsRow';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { Table } from '@/ui/layout/table/components/Table';
import styled from '@emotion/styled';
import { Trans } from '@lingui/react/macro';
import { useCallback, useMemo, useState } from 'react';
import { normalizeSearchText } from '~/utils/normalizeSearchText';
import { type FolderWithSetting, type PerFolderSettingsProps } from './types';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing(3)};
`;

const StyledSearchInput = styled(DropdownMenuSearchInput)`
  border: 1px solid ${({ theme }) => theme.border.color.medium};
  border-radius: ${({ theme }) => theme.border.radius.md};
  padding: ${({ theme }) => theme.spacing(2)};
`;

const StyledTableRows = styled.div`
  padding-bottom: ${({ theme }) => theme.spacing(2)};
  padding-top: ${({ theme }) => theme.spacing(2)};
`;

const StyledEmptyState = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.font.color.light};
  display: flex;
  font-size: ${({ theme }) => theme.font.size.md};
  height: ${({ theme }) => theme.spacing(16)};
  justify-content: center;
`;

const BUILT_IN_FOLDERS: Partial<MessageFolder>[] = [
  { id: 'all', name: 'All folders', isSentFolder: false },
  { id: 'inbox', name: 'Inbox', isSentFolder: false },
  { id: 'sent', name: 'Sent', isSentFolder: true },
  { id: 'drafts', name: 'Drafts', isSentFolder: false },
];

export const SettingsAccountsPerFolderSettings = <T extends string>({
  folders,
  configuration,
  objectMetadataItems,
}: PerFolderSettingsProps<T>) => {
  const [searchTerm, setSearchTerm] = useState('');

  const allFoldersWithSettings = useMemo(() => {
    const dynamicFolders = folders.map((folder): FolderWithSetting<T> => ({
      ...folder,
      currentValue: configuration.getValue(folder),
    }));

    const builtInFoldersWithSettings = BUILT_IN_FOLDERS.map((folder): FolderWithSetting<T> => ({
      id: folder.id!,
      name: folder.name!,
      syncCursor: '',
      isSentFolder: folder.isSentFolder!,
      isSynced: true,
      messageChannelId: '',
      __typename: 'MessageFolder' as const,
      currentValue: configuration.defaultValue,
    }));

    return [...builtInFoldersWithSettings, ...dynamicFolders];
  }, [folders, configuration.getValue, configuration.defaultValue]);

  const filteredFolders = useMemo(() => {
    if (!searchTerm.trim()) {
      return allFoldersWithSettings;
    }

    const searchNormalized = normalizeSearchText(searchTerm);
    return allFoldersWithSettings.filter((folder) =>
      normalizeSearchText(folder.name).includes(searchNormalized)
    );
  }, [allFoldersWithSettings, searchTerm]);

  const formatName = useCallback((name: string) => {
    return name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }, []);

  const handleFolderSettingChange = useCallback((folderId: string, value: T) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      configuration.setValue(folder, value);
    }
  }, [folders, configuration.setValue]);

  return (
    <StyledContainer>
      <StyledSearchInput
        placeholder="Search folders..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        autoFocus={false}
      />
      
      <Table>
        <SettingsAccountsPerFolderSettingsHeader 
          columnHeader={configuration.columnHeader}
        />
        <StyledTableRows>
          {filteredFolders.length > 0 ? (
            filteredFolders.map((folder) => (
              <SettingsAccountsPerFolderSettingsRow
                key={folder.id}
                folder={folder}
                configuration={configuration}
                objectMetadataItems={objectMetadataItems}
                onSettingChange={handleFolderSettingChange}
                formatName={formatName}
              />
            ))
          ) : (
            <StyledEmptyState>
              <Trans>No folders found</Trans>
            </StyledEmptyState>
          )}
        </StyledTableRows>
      </Table>
    </StyledContainer>
  );
};
