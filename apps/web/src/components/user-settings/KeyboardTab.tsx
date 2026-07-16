import { closeModal } from '../../store';
import { t } from '../../i18n';

export function KeyboardTab() {
  const shortcuts = [
    { keys: ['Ctrl', 'K'], label: t('kbd.quickSwitch') },
    { keys: ['Ctrl', 'Shift', 'K'], label: t('kbd.newDM') },
    { keys: ['Ctrl', '/'], label: t('kbd.showHelp') },
    { keys: ['Ctrl', 'B'], label: t('member.toggleList') },
    { keys: ['Enter'], label: t('kbd.sendMessage') },
    { keys: ['Shift', 'Enter'], label: t('kbd.newLine') },
    { keys: ['Escape'], label: t('kbd.cancelEdit') },
    { keys: ['↑'], label: t('kbd.editLast') },
    { keys: ['Ctrl', 'Shift', 'M'], label: t('kbd.toggleMic') },
    { keys: ['Ctrl', 'Shift', 'D'], label: t('kbd.toggleDeafen') },
    { keys: ['@', 'isim'], label: t('kbd.mentionMember') },
    { keys: ['#', 'isim'], label: 'Bir kanal bağla' },
    { keys: [':emoji:'], label: 'Emoji ekle' },
    { keys: ['/komut'], label: 'Slash komut çalıştır' },
    { keys: ['Ctrl', 'Shift', 'R'], label: 'Sayfayı sert yenile' },
  ];
  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Klavye Kısayolları</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-2">
        {shortcuts.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 border-b border-line last:border-b-0"
          >
            <span className="text-sm text-ink-primary">{s.label}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((k, j) => (
                <kbd
                  key={j}
                  className="px-2 py-0.5 rounded bg-surface-3 text-ink-primary text-xs font-mono border border-line"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

void closeModal;

// Bağlantılar — platform hesaplarını profiline ekle (Discord "Connections" paritesi)
