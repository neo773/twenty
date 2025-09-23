import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { Select } from '@/ui/input/components/Select';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { useCallback, useMemo } from 'react';
import { IconArrowsShuffle, IconFolder, IconSend } from 'twenty-ui/display';
import {
  type FolderWithSetting,
  type PerFolderSettingConfiguration,
} from './types';

const StyledFolderNameCell = styled.div`
  align-items: center;
  display: flex;
  gap: ${({ theme }) => theme.spacing(2)};
  max-width: 200px;
  overflow: hidden;
`;

const StyledFolderName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTableRow = styled(TableRow)`
  &:hover {
    background: ${({ theme }) => theme.background.transparent.light};
  }
`;

const StyledSelectCell = styled.div`
  align-items: center;
  display: flex;
  justify-content: flex-start;
`;

type SettingsAccountsPerFolderSettingsRowProps<T = string> = {
  folder: FolderWithSetting<T>;
  configuration: PerFolderSettingConfiguration<T>;
  objectMetadataItems?: ObjectMetadataItem[];
  onSettingChange: (folderId: string, value: T) => void;
  formatName: (name: string) => string;
};

export const SettingsAccountsPerFolderSettingsRow = <T extends string>({
  folder,
  configuration,
  objectMetadataItems,
  onSettingChange,
  formatName,
}: SettingsAccountsPerFolderSettingsRowProps<T>) => {
  const theme = useTheme();

  const selectOptions = useMemo(
    () =>
      configuration.options.map((option) => ({
        label: option.label,
        value: option.value,
        Icon: option.icon,
        color: option.color,
      })),
    [configuration.options],
  );

  const handleSelectChange = useCallback(
    (value: T) => {
      onSettingChange(folder.id, value);
    },
    [onSettingChange, folder.id],
  );

  const FolderIcon = useMemo(() => {
    if (folder.name === 'All folders') {
      return IconArrowsShuffle;
    }
    if (folder.isSentFolder) {
      return IconSend;
    }
    return IconFolder;
  }, [folder.name, folder.isSentFolder]);

  return (
    <StyledTableRow gridAutoColumns="1fr 200px">
      <TableCell>
        <StyledFolderNameCell>
          <FolderIcon size={theme.icon.size.md} stroke={theme.icon.stroke.sm} />
          <StyledFolderName>{formatName(folder.name)}</StyledFolderName>
        </StyledFolderNameCell>
      </TableCell>
      <TableCell>
        <StyledSelectCell>
          <Select
            dropdownId={`folder-setting-${folder.id}`}
            options={selectOptions}
            value={folder.currentValue || configuration.defaultValue}
            onChange={handleSelectChange}
            selectSizeVariant="small"
            needIconCheck={false}
          />
        </StyledSelectCell>
      </TableCell>
    </StyledTableRow>
  );
};
