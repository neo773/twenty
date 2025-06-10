import { useCallback } from 'react';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { useTriggerApisOAuth } from '@/settings/accounts/hooks/useTriggerApiOAuth';
import { SettingsPath } from '@/types/SettingsPath';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export const useTriggerProviderReconnect = () => {
  const { triggerApisOAuth } = useTriggerApisOAuth();
  const navigate = useNavigateSettings();

  const triggerProviderReconnect = useCallback(
    async (
      provider: ConnectedAccountProvider,
      accountId?: string,
      options?: Parameters<typeof triggerApisOAuth>[1],
    ) => {
      if (provider === ConnectedAccountProvider.IMAP) {
        if (!accountId) {
          throw new Error('Account ID is required for IMAP reconnection');
        }

        navigate(SettingsPath.NewImapConnection);
      } else {
        // For OAuth2 accounts (Google and Microsoft), use the existing triggerApisOAuth function
        await triggerApisOAuth(provider, options);
      }
    },
    [triggerApisOAuth, navigate],
  );

  return { triggerProviderReconnect };
};
