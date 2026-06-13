interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}

export function LabeledInput({ label, value, onChange, type }: LabeledInputProps) {
  return (
    <div className="mb-4">
      <label className="block mb-2 text-sm text-sequoia-grey">{label}</label>
      <input
        type={type ?? "text"}
        className="w-full bg-white border border-sequoia-grey p-2 focus:border-sequoia-green outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface LabeledTextareaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export function LabeledTextarea({ label, value, onChange }: LabeledTextareaProps) {
  return (
    <div className="mb-4">
      <label className="block mb-2 text-sm text-sequoia-grey">{label}</label>
      <textarea
        rows={4}
        className="w-full bg-white border border-sequoia-grey p-2 focus:border-sequoia-green outline-none font-mono text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

interface LabeledSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}

export function LabeledSelect({ label, value, onChange, options }: LabeledSelectProps) {
  return (
    <div className="mb-4">
      <label className="block mb-2 text-sm text-sequoia-grey">{label}</label>
      <select
        className="w-full bg-white border border-sequoia-grey p-2 focus:border-sequoia-green outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
