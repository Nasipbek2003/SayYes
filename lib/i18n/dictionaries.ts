export type Locale = 'ru' | 'ky';

export const defaultLocale: Locale = 'ru';
export const locales: Locale[] = ['ru', 'ky'];

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  ru: () => import('./ru.json').then((m) => m.default),
  ky: () => import('./ky.json').then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const loader = dictionaries[locale] ?? dictionaries[defaultLocale];
  return loader();
}

export interface Dictionary {
  common: {
    brand: string;
    login: string;
    register: string;
    logout: string;
    myInvitations: string;
    templates: string;
    back: string;
    tryAgain: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  auth: {
    loginHeading: string;
    registerHeading: string;
    email: string;
    password: string;
    passwordPlaceholder: string;
    loginButton: string;
    registerButton: string;
    noAccount: string;
    hasAccount: string;
    errorInvalidEmail: string;
    errorInvalidCredentials: string;
    errorWeakPassword: string;
    errorEmailTaken: string;
  };
  errors: {
    notFound: string;
    notFoundDesc: string;
    globalError: string;
    globalErrorDesc: string;
    toHome: string;
  };
}
