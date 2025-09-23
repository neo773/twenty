import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { type IconComponent } from 'twenty-ui/display';
import { type MessageChannelVisibility } from '~/generated/graphql';

export type FolderVisibilityValue = MessageChannelVisibility | 'NOTHING';

export type FolderContactCreationValue =
  | 'PEOPLE_AND_COMPANIES'
  | 'COMPANIES'
  | 'PEOPLE'
  | 'NONE';

export type PerFolderSettingsOption<TValue> = {
  value: TValue;
  label: string;
  icon?: IconComponent;
};

export type PerFolderSettingsConfig<TValue> = {
  title: string;
  subtitle: string;
  columnHeader: string;
  options: PerFolderSettingsOption<TValue>[];
  allFoldersValue: TValue;
  mixedValue: 'Mixed';
  getFolderValue: (folder: MessageFolder, settings?: any) => TValue;
  onFolderValueChange: (folderId: string, value: TValue) => void;
};

export type PerFolderSettingsProps<TValue> = {
  folders: MessageFolder[];
  config: PerFolderSettingsConfig<TValue>;
};
