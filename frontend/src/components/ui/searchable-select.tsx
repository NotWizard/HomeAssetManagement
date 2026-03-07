import { Check, ChevronDown, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/cn';

export interface SearchableSelectOption {
  label: string;
  value: string | number;
  searchText?: string;
}

type SearchableSelectProps = {
  value: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};

export const SearchableSelect = React.forwardRef<HTMLInputElement, SearchableSelectProps>(
  (
    {
      value,
      options,
      onValueChange,
      placeholder = '请输入关键词搜索',
      emptyMessage = '没有匹配项',
      disabled = false,
      className,
      inputClassName,
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const selectedOption = React.useMemo(
      () => options.find((option) => String(option.value) === value),
      [options, value]
    );

    const selectedLabel = selectedOption?.label ?? '';

    React.useEffect(() => {
      if (!open) {
        setQuery(selectedLabel);
      }
    }, [open, selectedLabel]);

    React.useEffect(() => {
      const handlePointerDown = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setOpen(false);
        }
      };

      document.addEventListener('mousedown', handlePointerDown);
      return () => document.removeEventListener('mousedown', handlePointerDown);
    }, []);

    const filteredOptions = React.useMemo(() => {
      const keyword = query.trim().toLowerCase();
      if (!keyword) {
        return options;
      }

      return options.filter((option) => {
        const haystack = `${option.label} ${option.searchText ?? ''} ${String(option.value)}`.toLowerCase();
        return haystack.includes(keyword);
      });
    }, [options, query]);

    const handleSelect = (option: SearchableSelectOption) => {
      onValueChange(String(option.value));
      setQuery(option.label);
      setOpen(false);
    };

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={(event) => {
            setOpen(true);
            setQuery(selectedLabel);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (event.key === 'Enter' && open && filteredOptions.length > 0) {
              event.preventDefault();
              handleSelect(filteredOptions[0]);
            }
          }}
          className={cn(
            'flex h-10 w-full rounded-lg border bg-card pl-9 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            inputClassName
          )}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label="切换下拉菜单"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-slate-100 disabled:cursor-not-allowed"
          onClick={() => {
            setOpen((prev) => {
              const next = !prev;
              if (next) {
                requestAnimationFrame(() => inputRef.current?.focus());
              }
              return next;
            });
          }}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>

        {open ? (
          <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const selected = String(option.value) === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selected ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100'
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                  >
                    <span>{option.label}</span>
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
            )}
          </div>
        ) : null}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';
