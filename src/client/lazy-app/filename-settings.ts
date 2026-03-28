export interface FilenameSettings {
  lowercase: boolean;
  replaceSpaceWithUnderscore: boolean;
  prefix: string;
  suffix: string;
}

export const defaultFilenameSettings: FilenameSettings = {
  lowercase: true,
  replaceSpaceWithUnderscore: true,
  prefix: '',
  suffix: '',
};

export function normalizeFilenameSettings(
  settings?: Partial<FilenameSettings>,
): FilenameSettings {
  return {
    lowercase:
      typeof settings?.lowercase === 'boolean'
        ? settings.lowercase
        : defaultFilenameSettings.lowercase,
    replaceSpaceWithUnderscore:
      typeof settings?.replaceSpaceWithUnderscore === 'boolean'
        ? settings.replaceSpaceWithUnderscore
        : defaultFilenameSettings.replaceSpaceWithUnderscore,
    prefix:
      typeof settings?.prefix === 'string'
        ? settings.prefix
        : defaultFilenameSettings.prefix,
    suffix:
      typeof settings?.suffix === 'string'
        ? settings.suffix
        : defaultFilenameSettings.suffix,
  };
}

export function filenameSettingsEqual(
  a?: FilenameSettings,
  b?: FilenameSettings,
): boolean {
  if (!a || !b) return a === b;

  return (
    a.lowercase === b.lowercase &&
    a.replaceSpaceWithUnderscore === b.replaceSpaceWithUnderscore &&
    a.prefix === b.prefix &&
    a.suffix === b.suffix
  );
}

export function createOutputFilename(
  sourceFilename: string,
  extension: string,
  filenameSettings: FilenameSettings,
): string {
  let name = sourceFilename.replace(/\.[^.]*$/, '');

  if (filenameSettings.lowercase) {
    name = name.toLowerCase();
  }

  if (filenameSettings.replaceSpaceWithUnderscore) {
    name = name.replace(/\s+/g, '_');
  }

  if (filenameSettings.prefix) {
    name = `${filenameSettings.prefix}${name}`;
  }

  if (filenameSettings.suffix) {
    name = `${name}${filenameSettings.suffix}`;
  }

  return `${name}.${extension}`;
}
