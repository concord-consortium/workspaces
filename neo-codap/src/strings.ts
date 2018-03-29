const locales = {
  'en-us': require('./locales/en-us.json')
};

export type Locale = 'en-us';
export type AppType = '' | 'collabspace';

export interface StringMap {
  [key: string]: string|undefined;
}

export interface TranslateOptions {
  capitalize?: boolean;
  count?: number;
  plural?: string;
}

export class Strings {
  prefix: string;
  map: StringMap;

  constructor (locale: Locale, app: AppType = '') {
    this.prefix = app.length > 0 ? `${app}:` : '';
    this.map = locales[locale];
  }

  translate(key: string, options: TranslateOptions = {}) {
    const withoutPrefix = key.toUpperCase();
    const withPrefix = `${this.prefix}${withoutPrefix}`;

    let result: string|undefined;
    if (this.map.hasOwnProperty(withPrefix)) {
      result = this.map[withPrefix];
    }
    if ((result === undefined) && this.map.hasOwnProperty(withoutPrefix)) {
      result = this.map[withoutPrefix];
    }
    if (result === undefined) {
      result = key;
    }

    // TODO: when needed for other languages add suffixes for capitalization and counts like
    // "ATTRIBUTE:capitalized" or "ATTRIBUTE:plural" or "ATTRIBUTE:plural3" and check them instead

    if (options.capitalize) {
      result = `${result.substr(0, 1).toUpperCase()}${result.substr(1)}`;
    }
    if (options.hasOwnProperty('count')) {
      if (options.count !== 1) {
        result += (options.plural || 's');
      }
    }

    return result;
  }
}