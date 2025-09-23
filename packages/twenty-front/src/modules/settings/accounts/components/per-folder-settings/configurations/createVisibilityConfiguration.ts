import { type MessageFolder } from '@/accounts/types/MessageFolder';
import {
  IconEye,
  IconEyeOff,
  IconEyeShare,
  IconShield,
} from 'twenty-ui/display';
import { type MessageChannelVisibility } from '~/generated/graphql';
import {
  type PerFolderSettingConfiguration,
  type VisibilityPerFolderSettingOption,
} from '../types';

const visibilityOptions: VisibilityPerFolderSettingOption[] = [
  {
    value: 'SHARE_EVERYTHING' as MessageChannelVisibility,
    label: 'Everything',
    icon: IconEye,
    color: 'green',
  },
  {
    value: 'SUBJECT' as MessageChannelVisibility,
    label: 'Subject',
    icon: IconEyeShare,
    color: 'blue',
  },
  {
    value: 'METADATA' as MessageChannelVisibility,
    label: 'Metadata',
    icon: IconShield,
    color: 'orange',
  },
  {
    value: 'NOTHING' as MessageChannelVisibility,
    label: 'Nothing',
    icon: IconEyeOff,
    color: 'red',
  },
];

export const createVisibilityConfiguration = (
  onFolderUpdate: (
    folder: MessageFolder,
    visibility: MessageChannelVisibility,
  ) => void,
): PerFolderSettingConfiguration<MessageChannelVisibility> => ({
  type: 'visibility',
  columnHeader: 'Email sharing',
  options: visibilityOptions,
  defaultValue: 'SHARE_EVERYTHING' as MessageChannelVisibility,
  getValue: (folder: MessageFolder) => {
    return (
      (folder as any).visibility ||
      ('SHARE_EVERYTHING' as MessageChannelVisibility)
    );
  },
  setValue: (folder: MessageFolder, value: MessageChannelVisibility) => {
    onFolderUpdate(folder, value);
  },
});
