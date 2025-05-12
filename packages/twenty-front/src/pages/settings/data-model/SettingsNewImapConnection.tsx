import { gql, useMutation } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { useRecoilValue } from 'recoil';
import { z } from 'zod';

import { SaveAndCancelButtons } from '@/settings/components/SaveAndCancelButtons/SaveAndCancelButtons';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsPath } from '@/types/SettingsPath';
import { SnackBarVariant } from '@/ui/feedback/snack-bar-manager/components/SnackBar';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';
import { TextInput } from '@/ui/input/components/TextInput';
import { SubMenuTopBarContainer } from '@/ui/layout/page/components/SubMenuTopBarContainer';
import styled from '@emotion/styled';
import { useLingui } from '@lingui/react/macro';
import { H2Title } from 'twenty-ui/display';
import { Section } from 'twenty-ui/layout';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';
import { currentWorkspaceMemberState } from '~/modules/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '~/modules/auth/states/currentWorkspaceState';
import { getSettingsPath } from '~/utils/navigation/getSettingsPath';

const UPSERT_IMAP_CONNECTION = gql`
  mutation UpsertImapConnection($input: ImapConnectionInput!) {
    upsertImapConnection(input: $input)
  }
`;

enum ImapEncryption {
  SSL = 'SSL',
  TLS = 'TLS',
  NONE = 'NONE',
}

enum MessageVisibility {
  SHARE_EVERYTHING = 'SHARE_EVERYTHING',
  SHARE_METADATA = 'SHARE_METADATA',
  PRIVATE = 'PRIVATE',
}

const StyledFormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing(4)};
`;

const imapConnectionFormSchema = z.object({
  handle: z.string().email('Invalid email address'),
  imapServer: z.string().min(1, 'IMAP server is required'),
  imapPort: z.number().int().positive('Port must be a positive number'),
  imapEncryption: z.nativeEnum(ImapEncryption),
  imapPassword: z.string().min(1, 'Password is required'),
  messageVisibility: z.nativeEnum(MessageVisibility).optional(),
});

type ImapConnectionFormValues = z.infer<typeof imapConnectionFormSchema>;

export const SettingsNewImapConnection = () => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const { enqueueSnackBar } = useSnackBar();
  const currentWorkspace = useRecoilValue(currentWorkspaceState);
  const currentWorkspaceMember = useRecoilValue(currentWorkspaceMemberState);

  const [upsertImapConnection, { loading }] = useMutation(
    UPSERT_IMAP_CONNECTION,
  );

  const formMethods = useForm<ImapConnectionFormValues>({
    mode: 'onSubmit',
    resolver: zodResolver(imapConnectionFormSchema),
    defaultValues: {
      handle: '',
      imapServer: '',
      imapPort: 993,
      imapEncryption: ImapEncryption.SSL,
      imapPassword: '',
      messageVisibility: MessageVisibility.SHARE_EVERYTHING,
    },
  });

  const { control, handleSubmit, formState } = formMethods;
  const { isValid, isSubmitting } = formState;
  const canSave = isValid && !isSubmitting;

  const handleSave = async (formValues: ImapConnectionFormValues) => {
    try {
      if (!currentWorkspace?.id) {
        throw new Error('Workspace ID is missing');
      }

      if (!currentWorkspaceMember?.id) {
        throw new Error('Workspace member ID is missing');
      }

      const input = {
        accountOwnerId: currentWorkspaceMember.id,
        handle: formValues.handle,
        imapServer: formValues.imapServer,
        imapPort: formValues.imapPort,
        imapEncryption: formValues.imapEncryption,
        imapPassword: formValues.imapPassword,
      };

      await upsertImapConnection({
        variables: { input },
      });

      enqueueSnackBar(t`IMAP connection successfully created`, {
        variant: SnackBarVariant.Success,
      });

      navigate(SettingsPath.Accounts);
    } catch (error) {
      enqueueSnackBar((error as Error).message, {
        variant: SnackBarVariant.Error,
      });
    }
  };

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <FormProvider {...formMethods}>
      <SubMenuTopBarContainer
        title={t`New IMAP Connection`}
        links={[
          {
            children: t`Settings`,
            href: getSettingsPath(SettingsPath.Workspace),
          },
          {
            children: t`Email Connections`,
            href: getSettingsPath(SettingsPath.Accounts),
          },
          { children: t`New IMAP Connection` },
        ]}
        actionButton={
          <SaveAndCancelButtons
            isSaveDisabled={!canSave}
            isCancelDisabled={isSubmitting}
            onCancel={() => navigate(SettingsPath.Accounts)}
            onSave={handleSubmit(handleSave)}
          />
        }
      >
        <SettingsPageContainer>
          <Section>
            <H2Title
              title={t`IMAP Connection Details`}
              description={t`Configure your IMAP email account`}
            />
            <StyledFormContainer>
              <Controller
                name="handle"
                control={control}
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t`Email Address`}
                    placeholder={t`john.doe@example.com`}
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="imapServer"
                control={control}
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t`IMAP Server`}
                    placeholder={t`imap.example.com`}
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="imapPort"
                control={control}
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t`IMAP Port`}
                    type="number"
                    placeholder={t`993`}
                    value={field.value.toString()}
                    onChange={(value) => field.onChange(Number(value))}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="imapEncryption"
                control={control}
                render={({ field }) => (
                  <Select
                    label={t`Encryption`}
                    options={[
                      { label: 'SSL', value: ImapEncryption.SSL },
                      { label: 'TLS', value: ImapEncryption.TLS },
                      { label: 'None', value: ImapEncryption.NONE },
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                    dropdownId="imapEncryption-dropdown"
                  />
                )}
              />
              <Controller
                name="imapPassword"
                control={control}
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t`Password`}
                    placeholder={t`••••••••`}
                    type="password"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="messageVisibility"
                control={control}
                render={({ field }) => (
                  <Select
                    label={t`Message Visibility`}
                    options={[
                      {
                        label: 'Share Everything',
                        value: MessageVisibility.SHARE_EVERYTHING,
                      },
                      {
                        label: 'Share Metadata Only',
                        value: MessageVisibility.SHARE_METADATA,
                      },
                      { label: 'Private', value: MessageVisibility.PRIVATE },
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                    dropdownId="messageVisibility-dropdown"
                  />
                )}
              />
            </StyledFormContainer>
          </Section>
        </SettingsPageContainer>
      </SubMenuTopBarContainer>
    </FormProvider>
  );
};
