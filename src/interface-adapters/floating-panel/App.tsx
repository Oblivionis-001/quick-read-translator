import { HoverToggle } from "./components/HoverToggle";
import { ProviderQuickSelect } from "./components/ProviderQuickSelect";
import { ThemeSelect } from "./components/ThemeSelect";
import { TargetLanguageInput } from "./components/TargetLanguageInput";
import { TranslatePageButton } from "./components/TranslatePageButton";

export default function FloatingPanelApp() {
  return (
    <div className="bg-white shadow-lg p-4 w-64">
      <h2 className="text-sm font-normal mb-3 text-sequoia-grey">
        Quick Read Translator
      </h2>
      <div className="mb-3">
        <HoverToggle />
      </div>
      <ProviderQuickSelect />
      <ThemeSelect />
      <TargetLanguageInput />
      <TranslatePageButton />
    </div>
  );
}
