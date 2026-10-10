export function CatalogSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const showClear = value.length > 0 && !disabled;

  return (
    <div className="catalog-search">
      <label htmlFor={id} className="catalog-search-field">
        <span className="sr-only">{label}</span>
        <input
          id={id}
          type="search"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
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
