import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { Trans } from '@lingui/react/macro';

type SettingsAccountsPerFolderSettingsHeaderProps = {
  columnHeader: string;
};

export const SettingsAccountsPerFolderSettingsHeader = ({
  columnHeader,
}: SettingsAccountsPerFolderSettingsHeaderProps) => {
  return (
    <TableRow gridAutoColumns="1fr 200px">
      <TableHeader>
        <Trans>Folder</Trans>
      </TableHeader>
      <TableHeader>
        {columnHeader}
      </TableHeader>
    </TableRow>
  );
};
