export function TranslatePageButton() {
  const onClick = () => {
    window.dispatchEvent(new CustomEvent('qrt:translate-page'));
  };

  return (
    <button
      type="button"
      className="w-full bg-sequoia-green text-white py-2 text-sm hover:bg-sequoia-dark-green"
      onClick={onClick}
    >
      Translate This Page
    </button>
  );
}
