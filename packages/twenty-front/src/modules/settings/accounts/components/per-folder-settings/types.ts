import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { type IconComponent } from 'twenty-ui/display';
import { type ThemeColor } from 'twenty-ui/theme';
import {
  type MessageChannelContactAutoCreationPolicy,
  type MessageChannelVisibility,
} from '~/generated/graphql';

export type PerFolderSettingType = 'visibility' | 'contactCreation';

export type PerFolderSettingOption<T = string> = {
  value: T;
  label: string;
  icon: IconComponent;
  color?: ThemeColor;
};

export type VisibilityPerFolderSettingOption =
  PerFolderSettingOption<MessageChannelVisibility>;
export type ContactCreationPerFolderSettingOption = PerFolderSettingOption<
  MessageChannelContactAutoCreationPolicy | string
>;

export type PerFolderSettingConfiguration<T = string> = {
  type: PerFolderSettingType;
  columnHeader: string;
  options: PerFolderSettingOption<T>[];
  defaultValue?: T;
  getValue: (folder: MessageFolder) => T | undefined;
  setValue: (folder: MessageFolder, value: T) => void;
};

export type PerFolderSettingsProps<T = string> = {
  folders: MessageFolder[];
  configuration: PerFolderSettingConfiguration<T>;
  objectMetadataItems?: ObjectMetadataItem[];
};

export type FolderWithSetting<T = string> = MessageFolder & {
  currentValue?: T;
};
