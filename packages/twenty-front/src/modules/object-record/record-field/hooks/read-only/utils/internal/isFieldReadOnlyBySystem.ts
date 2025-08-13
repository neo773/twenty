export type IsFieldReadOnlyBySystemParams = {
  canEditInUI?: boolean | null;
};

export const isFieldReadOnlyBySystem = ({
  canEditInUI,
}: IsFieldReadOnlyBySystemParams) => {
  // Clean permission-driven logic - single source of truth
  return canEditInUI === false;
};
