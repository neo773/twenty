import styled from '@emotion/styled';

import { SettingsAccountsCardMedia } from '@/settings/accounts/components/SettingsAccountsCardMedia';
import { useTheme } from '@emotion/react';
import { IconFolder } from 'twenty-ui/display';

type SettingsAccountsMessageFolderIconProps = {
  className?: string;
};

const StyledCardMedia = styled(SettingsAccountsCardMedia)`
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing(0.5)};
`;

const StyledIconContainer = styled.div`
  align-items: center;
  background-color: ${({ theme }) => theme.background.quaternary};
  border-radius: ${({ theme }) => theme.border.radius.xs};
  display: flex;
  width: 100%;
  height: 100%;
  justify-content: center;
`;

export const SettingsAccountsMessageFolderIcon = ({
  className,
}: SettingsAccountsMessageFolderIconProps) => {
  const theme = useTheme();
  return (
    <StyledCardMedia className={className}>
      <StyledIconContainer>
        <IconFolder
          size={theme.icon.size.md}
          stroke={theme.icon.stroke.lg}
          color={theme.font.color.inverted}
        />
      </StyledIconContainer>
    </StyledCardMedia>
  );
};
