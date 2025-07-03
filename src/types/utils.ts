export interface LanguageItem {
  [key: string]: {
    name: string;
    nativeName: string;
    dir: string;
  };
}

export interface LanguageApiResponse {
  translation: LanguageItem[];
}
