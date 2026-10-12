export function CatalogSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const showClear = value.length > 0 && !disabled;

  return (
    <div className="catalog-search">
      <label htmlFor={id} className="catalog-search-field">
        <span className="sr-only">{label}</span>
        <input
          id={id}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className="catalog-search-input"
        />
        {showClear ? (
          <button
            type="button"
            className="catalog-search-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
          >
            ×
          </button>
        ) : null}
      </label>
    </div>
  );
}
