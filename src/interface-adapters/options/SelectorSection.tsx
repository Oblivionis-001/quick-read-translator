import type { SelectorConfig } from "@/shared/types";
import { LabeledInput, LabeledTextarea } from "./components";

interface SelectorSectionProps {
  config: SelectorConfig;
  onChange: (next: SelectorConfig) => void;
}

export function SelectorSection({ config, onChange }: SelectorSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Selectors</h2>

      <LabeledTextarea
        label="Default selectors (one per line)"
        value={config.selectors.join('\n')}
        onChange={(v) => onChange({ ...config, selectors: splitLines(v) })}
      />
      <LabeledTextarea
        label="Exclude selectors (CSS, one per line)"
        value={config.excludeSelectors.join('\n')}
        onChange={(v) => onChange({ ...config, excludeSelectors: splitLines(v) })}
      />
      <LabeledInput
        label="Exclude tags (comma-separated)"
        value={config.excludeTags.join(',')}
        onChange={(v) => onChange({ ...config, excludeTags: splitCsv(v) })}
      />
      <LabeledTextarea
        label="Stay-original selectors (match but don't translate)"
        value={config.stayOriginalSelectors.join('\n')}
        onChange={(v) => onChange({ ...config, stayOriginalSelectors: splitLines(v) })}
      />
      <LabeledInput
        label="Stay-original tags (comma-separated)"
        value={config.stayOriginalTags.join(',')}
        onChange={(v) => onChange({ ...config, stayOriginalTags: splitCsv(v) })}
      />
      <LabeledTextarea
        label="Extra block selectors"
        value={config.extraBlockSelectors.join('\n')}
        onChange={(v) => onChange({ ...config, extraBlockSelectors: splitLines(v) })}
      />
      <LabeledInput
        label="Min text count"
        type="number"
        value={String(config.blockMinTextCount)}
        onChange={(v) => onChange({ ...config, blockMinTextCount: Number(v) || 1 })}
      />
      <LabeledInput
        label="Min word count"
        type="number"
        value={String(config.paragraphMinWordCount)}
        onChange={(v) => onChange({ ...config, paragraphMinWordCount: Number(v) || 1 })}
      />
    </section>
  );
}

function splitLines(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean);
}

function splitCsv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}
