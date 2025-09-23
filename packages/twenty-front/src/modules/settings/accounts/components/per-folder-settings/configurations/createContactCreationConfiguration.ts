import { type MessageFolder } from '@/accounts/types/MessageFolder';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { IconBuildingSkyscraper, IconCircleOff, IconUser } from 'twenty-ui/display';
import { type MessageChannelContactAutoCreationPolicy } from '~/generated/graphql';
import { type ContactCreationPerFolderSettingOption, type PerFolderSettingConfiguration } from '../types';

const getBaseContactCreationOptions = (): ContactCreationPerFolderSettingOption[] => [
  {
    value: 'NONE' as MessageChannelContactAutoCreationPolicy,
    label: 'None',
    icon: IconCircleOff,
    color: 'red',
  },
];

const getStandardObjectOptions = (): ContactCreationPerFolderSettingOption[] => [
  {
    value: 'people',
    label: 'People',
    icon: IconUser,
    color: 'blue',
  },
  {
    value: 'companies',
    label: 'Companies',
    icon: IconBuildingSkyscraper,
    color: 'purple',
  },
];

const getCustomObjectOptions = (objectMetadataItems: ObjectMetadataItem[]): ContactCreationPerFolderSettingOption[] => {
  return objectMetadataItems
    .filter((item) => !item.isSystem && item.isActive)
    .map((item) => ({
      value: item.nameSingular,
      label: item.labelSingular,
      icon: item.icon ? () => null : IconUser,
      color: 'gray',
    }));
};

export const createContactCreationConfiguration = (
  objectMetadataItems: ObjectMetadataItem[] = [],
  onFolderUpdate: (folder: MessageFolder, policy: string) => void
): PerFolderSettingConfiguration<string> => {
  const baseOptions = getBaseContactCreationOptions();
  const standardOptions = getStandardObjectOptions();
  const customOptions = getCustomObjectOptions(objectMetadataItems);
  
  const allOptions = [...baseOptions, ...standardOptions, ...customOptions];

  return {
    type: 'contactCreation',
    columnHeader: 'Contact creation',
    options: allOptions,
    defaultValue: 'NONE',
    getValue: (folder: MessageFolder) => {
      return (folder as any).contactAutoCreationPolicy || 'NONE';
    },
    setValue: (folder: MessageFolder, value: string) => {
      onFolderUpdate(folder, value);
    },
  };
};
