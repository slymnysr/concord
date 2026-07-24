import { Bold, Italic, Underline, Strikethrough, Code, Quote, EyeOff } from 'lucide-react';
import { t } from '../i18n';

interface Props {
  textarea: HTMLTextAreaElement | null;
  onChange: (next: string) => void;
}

// Seçili metnin etrafına markdown wrap
function wrap(textarea: HTMLTextAreaElement, prefix: string, suffix = prefix) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);
  const next = before + prefix + sel + suffix + after;
  textarea.value = next;
  // Caret'i seçimin sonunda bırak
  const pos = before.length + prefix.length + sel.length + suffix.length;
  textarea.setSelectionRange(pos, pos);
  return next;
}

export function MarkdownToolbar({ textarea, onChange }: Props) {
  if (!textarea) return null;

  function apply(prefix: string, suffix?: string) {
    if (!textarea) return;
    const next = wrap(textarea, prefix, suffix ?? prefix);
    onChange(next);
    textarea.focus();
  }

  const buttons = [
    { icon: Bold, fn: () => apply('**'), title: t('md.bold') },
    { icon: Italic, fn: () => apply('*'), title: t('md.italic') },
    { icon: Underline, fn: () => apply('__'), title: t('md.underline') },
    { icon: Strikethrough, fn: () => apply('~~'), title: t('md.strike') },
    { icon: Code, fn: () => apply('`'), title: t('md.code') },
    { icon: Quote, fn: () => apply('> ', ''), title: t('md.quote') },
    { icon: EyeOff, fn: () => apply('||'), title: t('md.spoiler') },
  ];

  return (
    <div className="flex items-center gap-0.5 px-3 py-1 border-b border-line">
      {buttons.map((b, i) => {
        const Icon = b.icon;
        return (
          <button
            key={i}
            type="button"
            onClick={b.fn}
            title={b.title}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-secondary hover:bg-surface-3 hover:text-ink-primary transition-colors"
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
