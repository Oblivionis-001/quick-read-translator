import { useState } from "react";
import type { SiteRule } from "@/shared/types";
import { LabeledTextarea } from "./components";

interface SiteRulesSectionProps {
  rules: SiteRule[];
  onChange: (next: SiteRule[]) => void;
}

export function SiteRulesSection({ rules, onChange }: SiteRulesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<SiteRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const add = () => {
    const newRule: SiteRule = {
      id: `rule-${Date.now()}`,
      matches: [],
      enabled: true,
    };
    onChange([...rules, newRule]);
    setExpandedId(newRule.id);
  };

  const remove = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Site rules</h2>
      <p className="text-sm text-sequoia-grey mb-4">
        Override selectors for specific sites. Patterns use glob (`*` matches
        any chars including `/`). Example: `*://news.ycombinator.com/*`.
      </p>

      {rules.map((rule) => (
        <div key={rule.id} className="border border-sequoia-grey p-3 mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => update(rule.id, { enabled: e.target.checked })}
            />
            <input
              type="text"
              className="flex-1 border border-sequoia-grey p-1 text-sm"
              placeholder="*://example.com/*"
              value={rule.matches.join(', ')}
              onChange={(e) =>
                update(rule.id, {
                  matches: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
            <button
              type="button"
              className="text-xs underline"
              onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
            >
              {expandedId === rule.id ? 'Hide' : 'Edit'}
            </button>
            <button
              type="button"
              className="text-xs underline text-sequoia-red"
              onClick={() => remove(rule.id)}
            >
              Delete
            </button>
          </div>

          {expandedId === rule.id && (
            <div className="mt-3 pt-3 border-t border-sequoia-grey">
              <LabeledTextarea
                label="Add to selectors (one per line)"
                value={rule.selectors?.add?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    selectors: {
                      add: v.split('\n').map((s) => s.trim()).filter(Boolean),
                      remove: rule.selectors?.remove,
                    },
                  })
                }
              />
              <LabeledTextarea
                label="Remove from selectors (one per line)"
                value={rule.selectors?.remove?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    selectors: {
                      add: rule.selectors?.add,
                      remove: v.split('\n').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
              <LabeledTextarea
                label="Add to excludeSelectors"
                value={rule.excludeSelectors?.add?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    excludeSelectors: {
                      add: v.split('\n').map((s) => s.trim()).filter(Boolean),
                      remove: rule.excludeSelectors?.remove,
                    },
                  })
                }
              />
              <LabeledTextarea
                label="Add to extraBlockSelectors"
                value={rule.extraBlockSelectors?.add?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    extraBlockSelectors: {
                      add: v.split('\n').map((s) => s.trim()).filter(Boolean),
                      remove: rule.extraBlockSelectors?.remove,
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        className="text-sm underline text-sequoia-green"
        onClick={add}
      >
        + Add rule
      </button>
    </section>
  );
}
