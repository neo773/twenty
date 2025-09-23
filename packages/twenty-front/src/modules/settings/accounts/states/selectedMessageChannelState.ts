import { atom } from 'recoil';

import { type MessageChannel } from '@/accounts/types/MessageChannel';

export const selectedMessageChannelState = atom<MessageChannel | null>({
  key: 'selectedMessageChannelState',
  default: null,
});
