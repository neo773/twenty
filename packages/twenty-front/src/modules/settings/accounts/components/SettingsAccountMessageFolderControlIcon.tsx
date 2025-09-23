import styled from '@emotion/styled';

type MessageFolderVisibility = 'nothing' | 'meta' | 'subject' | 'full';

const StyledIconContainer = styled.div`
  align-items: flex-start;
  border-radius: 1px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  height: 16px;
  justify-content: center;
  padding: 1px;
  width: 16px;
`;

const StyledMetaLine = styled.div<{ isVisible?: boolean }>`
  background-color: ${({ isVisible, theme }) =>
    isVisible ? theme.accent.accent4060 : theme.background.quaternary};
  border-radius: 0.5px;
  flex: none;
  height: 1.5px;
  width: 8px;
`;

const StyledSubjectLine = styled.div<{ isVisible?: boolean }>`
  align-self: stretch;
  background-color: ${({ isVisible, theme }) =>
    isVisible ? theme.accent.accent4060 : theme.background.quaternary};
  border-radius: 0.5px;
  flex: none;
  height: 1.5px;
  width: 14px;
`;

const StyledBodyArea = styled.div<{ isVisible?: boolean }>`
  align-self: stretch;
  background-color: ${({ isVisible, theme }) =>
    isVisible ? theme.accent.accent4060 : theme.background.quaternary};
  border-radius: 1px;
  flex: none;
  flex-grow: 1;
  height: 9px;
  width: 14px;
`;

type SettingsAccountMessageFolderControlIconProps = {
  className?: string;
  visibility: MessageFolderVisibility;
};

export const SettingsAccountMessageFolderControlIcon = ({
  className,
  visibility,
}: SettingsAccountMessageFolderControlIconProps) => {
  const isMetaVisible =
    visibility === 'meta' || visibility === 'subject' || visibility === 'full';
  const isSubjectVisible = visibility === 'subject' || visibility === 'full';
  const isBodyVisible = visibility === 'full';

  return (
    <StyledIconContainer className={className}>
      <StyledMetaLine isVisible={isMetaVisible} />
      <StyledSubjectLine isVisible={isSubjectVisible} />
      <StyledBodyArea isVisible={isBodyVisible} />
    </StyledIconContainer>
  );
};
