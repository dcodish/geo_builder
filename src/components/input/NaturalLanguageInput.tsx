import { useState, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useConstructionStore, useUIStore } from '@/store';
import { parseNaturalLanguage } from '@/services/llm';

export function NaturalLanguageInput() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const construction = useConstructionStore((s) => s.construction);
  const executeCommand = useConstructionStore((s) => s.executeCommand);
  const isLoading = useUIStore((s) => s.isLLMLoading);
  const setLLMLoading = useUIStore((s) => s.setLLMLoading);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setLLMLoading(true);
    try {
      const commands = await parseNaturalLanguage(trimmed, construction);
      executeCommand(commands, trimmed);
      setInput('');
    } catch (err) {
      console.error('Parse error:', err);
    } finally {
      setLLMLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t('input.placeholder')}
        disabled={isLoading}
        dir="auto"
        style={{
          flex: 1,
          padding: '14px 18px',
          fontSize: '16px',
          borderRadius: '10px',
          border: '2px solid var(--color-border)',
          outline: 'none',
          background: isLoading ? '#f8f8f8' : 'white',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
      />
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        style={{
          padding: '14px 28px',
          fontSize: '16px',
          fontWeight: 600,
          borderRadius: '10px',
          border: 'none',
          background: (isLoading || !input.trim()) ? '#94a3b8' : 'var(--color-primary)',
          color: 'white',
          cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading ? t('input.loading') : t('input.send')}
      </button>
    </form>
  );
}
