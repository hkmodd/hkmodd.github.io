import { useAppStore } from '@/store/useAppStore';
import en, { type Translations } from './en';
import it from './it';

const translations: Record<string, Translations> = { en, it };

export function useTranslation() {
  const language = useAppStore((s) => s.language);
  const t = translations[language] ?? en;
  return { t, language };
}

export type { Translations };
