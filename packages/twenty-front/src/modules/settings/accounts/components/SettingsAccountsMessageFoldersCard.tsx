import styled from '@emotion/styled';

import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { CoreObjectNameSingular } from '@/object-metadata/types/CoreObjectNameSingular';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { SettingsOptionCardContentToggle } from '@/settings/components/SettingsOptions/SettingsOptionCardContentToggle';
import { t } from '@lingui/core/macro';
import { IconFolder, IconMail, IconSend } from 'twenty-ui/display';
import { Card } from 'twenty-ui/layout';

type SettingsAccountsMessageFoldersCardProps = {
  messageChannelId: string;
  messageFolders: MessageFolder[];
};

const StyledFoldersContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledEmptyState = styled.div`
  color: ${({ theme }) => theme.font.color.tertiary};
  padding: ${({ theme }) => theme.spacing(4)};
  text-align: center;
`;

const StyledFolderRow = styled.div<{ isLast: boolean }>`
  align-items: center;
  border-bottom: ${({ theme, isLast }) =>
    isLast ? 'none' : `1px solid ${theme.border.color.light}`};
  display: flex;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing(3)};
`;

const StyledFolderInfo = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: ${({ theme }) => theme.spacing(2)};
`;

const StyledFolderName = styled.span`
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

const StyledToggleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(4)};
`;

const StyledToggleItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(1)};
`;

export const SettingsAccountsMessageFoldersCard = ({
  messageChannelId,
  messageFolders,
}: SettingsAccountsMessageFoldersCardProps) => {
  const { updateOneRecord } = useUpdateOneRecord<MessageFolder>({
    objectNameSingular: CoreObjectNameSingular.MessageFolder,
  });

  const handleSyncToggle = (folder: MessageFolder, value: boolean) => {
    // Don't allow disabling INBOX sync
    if (folder.name.toUpperCase() === 'INBOX' && !value) {
      return;
    }

    updateOneRecord({
      idToUpdate: folder.id,
      updateOneRecordInput: {
        isSynced: value,
      },
    });
  };

  const handleSentFolderToggle = (folder: MessageFolder, value: boolean) => {
    updateOneRecord({
      idToUpdate: folder.id,
      updateOneRecordInput: {
        isSentFolder: value,
      },
    });
  };

  if (!messageFolders || messageFolders.length === 0) {
    return (
      <Card rounded>
        <StyledEmptyState>
          <IconFolder size="medium" />
          <div>{t`No folders found for this account`}</div>
        </StyledEmptyState>
      </Card>
    );
  }

  return (
    <Card rounded>
      <StyledFoldersContainer>
        {messageFolders.map((folder, index) => {
          const isInbox = folder.name.toUpperCase() === 'INBOX';
          const isLast = index === messageFolders.length - 1;

          return (
            <StyledFolderRow key={folder.id} isLast={isLast}>
              <StyledFolderInfo>
                <IconFolder size="small" />
                <StyledFolderName>{folder.name}</StyledFolderName>
              </StyledFolderInfo>
              <StyledToggleContainer>
                <StyledToggleItem>
                  <IconSend size="small" />
                  <SettingsOptionCardContentToggle
                    title=""
                    description=""
                    checked={folder.isSentFolder}
                    onChange={() =>
                      handleSentFolderToggle(folder, !folder.isSentFolder)
                    }
                  />
                </StyledToggleItem>
                <StyledToggleItem>
                  <IconMail size="small" />
                  <SettingsOptionCardContentToggle
                    title=""
                    description=""
                    checked={folder.isSynced}
                    disabled={isInbox}
                    onChange={() => handleSyncToggle(folder, !folder.isSynced)}
                  />
                </StyledToggleItem>
              </StyledToggleContainer>
            </StyledFolderRow>
          );
        })}
      </StyledFoldersContainer>
    </Card>
  );
};
