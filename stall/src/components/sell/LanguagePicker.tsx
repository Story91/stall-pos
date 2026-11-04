"use client";

import { LANGUAGES, type Language } from "@/lib/parse/schema";
import { useT } from "@/lib/i18n/useT";

const NAMES: Record<Language, string> = { en: "English", es: "Español", pl: "Polski" };

type Props = {
  value: Language;
  onChange(language: Language): void;
  disabled?: boolean;
};

/** The owner's language for the whole app: screens, voice, the close summary, and the spoken "Paid". */
export function LanguagePicker({ value, onChange, disabled }: Props) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t.language.pickerLabel} className="flex gap-1.5">
      {LANGUAGES.map((language) => {
        const checked = language === value;
        return (
          <button
            key={language}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={NAMES[language]}
            title={NAMES[language]}
            disabled={disabled}
            onClick={() => onChange(language)}
            className={`money min-h-14 min-w-14 rounded-full border-2 border-ink px-3 text-xl font-bold disabled:opacity-50 ${
              checked ? "bg-ink text-marigold" : "bg-paper text-ink"
            }`}
          >
            {language.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
