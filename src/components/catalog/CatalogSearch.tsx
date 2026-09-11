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
  return (
    <label htmlFor={id} className="catalog-search">
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
    </label>
  );
}
