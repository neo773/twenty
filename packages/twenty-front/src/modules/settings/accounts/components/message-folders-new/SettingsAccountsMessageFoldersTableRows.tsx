import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { Select } from '@/ui/input/components/Select';

import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';

import { type SelectValue } from '@/ui/input/components/internal/select/types';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { IconFolder } from 'twenty-ui/display';
import { type SelectOption } from 'twenty-ui/input';

const StyledFolderNameCell = styled.div`
  align-items: center;
  display: flex;
  gap: ${({ theme }) => theme.spacing(1)};
  max-width: 200px;
  overflow: hidden;
`;

const StyledFolderName = styled.span`
  color: ${({ theme }) => theme.font.color.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const StyledTableRow = styled(TableRow)``;

const StyledSelectCell = styled.div`
  align-items: center;
  display: flex;
  justify-content: flex-start;
`;
type SettingsAccountsMessageFoldersTableRowsProps = {
  folder: MessageFolder;
  options: SelectOption[];
  onChange: (value: SelectValue) => void;
};

export const SettingsAccountsMessageFoldersTableRows = ({
  folder,
  options,
  onChange,
}: SettingsAccountsMessageFoldersTableRowsProps) => {
  const theme = useTheme();

  return (
    <StyledTableRow gridAutoColumns="1fr 210px">
      <TableCell>
        <StyledFolderNameCell>
          <IconFolder size={theme.icon.size.md} stroke={theme.icon.stroke.sm} />
          <StyledFolderName>{folder.name}</StyledFolderName>
        </StyledFolderNameCell>
      </TableCell>
      <TableCell>
        <StyledSelectCell>
          <Select
            dropdownId={`folder-setting-${folder.id}`}
            options={options}
            onChange={onChange}
            selectSizeVariant="small"
            needIconCheck={false}
          />
        </StyledSelectCell>
      </TableCell>
    </StyledTableRow>
  );
};
