import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export interface MemberAutocompleteItem {
  id: string;
  nrp: string;
  nama: string;
  pangkat?: string | null;
  bank_account_number?: string | null;
  take_home_pay?: number | null;
  master_thp?: number | null;
}

export interface MemberSearchAutocompleteProps {
  members: MemberAutocompleteItem[];
  value: string;
  onChange: (value: string) => void;
  onSelectMember: (member: MemberAutocompleteItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  defaultOpen?: boolean;
}

/**
 * Pure helper function to filter members by name or NRP
 * Case-insensitive match, limited to top results for optimal UI performance
 */
export function filterMembers(
  members: MemberAutocompleteItem[],
  searchTerm: string,
  limit: number = 15
): MemberAutocompleteItem[] {
  if (!searchTerm || !searchTerm.trim()) {
    return members.slice(0, limit);
  }

  const term = searchTerm.toLowerCase().trim();
  const matched = members.filter((m) => {
    const namaMatch = m.nama ? m.nama.toLowerCase().includes(term) : false;
    const nrpMatch = m.nrp ? m.nrp.toLowerCase().includes(term) : false;
    return namaMatch || nrpMatch;
  });

  return matched.slice(0, limit);
}

/**
 * Pure helper function to calculate keyboard navigation index
 */
export function calculateNextMemberHighlightedIndex(
  currentIndex: number,
  totalItems: number,
  key: 'ArrowDown' | 'ArrowUp'
): number {
  if (totalItems <= 0) return -1;

  if (key === 'ArrowDown') {
    if (currentIndex < 0) return 0;
    return Math.min(currentIndex + 1, totalItems - 1);
  }

  if (key === 'ArrowUp') {
    if (currentIndex < 0) return totalItems - 1;
    return Math.max(currentIndex - 1, 0);
  }

  return currentIndex;
}

export const MemberSearchAutocomplete: React.FC<MemberSearchAutocompleteProps> = ({
  members,
  value,
  onChange,
  onSelectMember,
  placeholder = 'Cari anggota berdasarkan nama atau NRP...',
  disabled = false,
  className = '',
  inputClassName = '',
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Click / touch outside listener to automatically close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const filteredMembers = filterMembers(members, value, 15);

  // Scroll highlighted item into view smoothly
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (member: MemberAutocompleteItem) => {
    onSelectMember(member);
    onChange(member.nama);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    onChange('');
    onSelectMember(null);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          calculateNextMemberHighlightedIndex(prev, filteredMembers.length, 'ArrowDown')
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(Math.max(filteredMembers.length - 1, 0));
      } else {
        setHighlightedIndex((prev) =>
          calculateNextMemberHighlightedIndex(prev, filteredMembers.length, 'ArrowUp')
        );
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredMembers.length) {
        e.preventDefault();
        handleSelect(filteredMembers[highlightedIndex]);
      } else if (isOpen && filteredMembers.length === 1) {
        e.preventDefault();
        handleSelect(filteredMembers[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const visualInputClass =
    inputClassName ||
    'bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-sm';

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="member-autocomplete-list"
          aria-activedescendant={
            highlightedIndex >= 0 ? `member-option-${highlightedIndex}` : undefined
          }
          disabled={disabled}
          value={value}
          onChange={(e) => {
            if (disabled) return;
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-9 pr-8 py-2 transition-all ${visualInputClass} ${
            disabled ? 'opacity-60 bg-slate-100 cursor-not-allowed select-none' : ''
          }`}
        />
        {Boolean(value) && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            tabIndex={-1}
            aria-label="Bersihkan pencarian"
            className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          id="member-autocomplete-list"
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 animate-in fade-in-50 duration-100"
        >
          {filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Anggota tidak ditemukan untuk kata kunci &ldquo;
              <span className="font-semibold text-slate-700">{value}</span>&rdquo;
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500 flex justify-between items-center border-b border-slate-100">
                <span>Menampilkan {filteredMembers.length} anggota</span>
                <span className="font-mono text-[10px]">Gunakan ↑ ↓ dan Enter</span>
              </div>
              {filteredMembers.map((member, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const thpValue = member.take_home_pay ?? member.master_thp ?? null;
                return (
                  <div
                    key={member.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    role="option"
                    id={`member-option-${idx}`}
                    aria-selected={isHighlighted}
                    onClick={() => handleSelect(member)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2.5 px-3 cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                      isHighlighted
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{member.nama}</span>
                        {member.pangkat && (
                          <span className="text-xs text-slate-500 truncate">({member.pangkat})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                          NRP: {member.nrp}
                        </span>
                        {member.bank_account_number ? (
                          <span className="text-[11px] text-slate-500">
                            Rek: <span className="font-mono text-slate-700">{member.bank_account_number}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600 font-medium italic">
                            Belum ada rekening
                          </span>
                        )}
                      </div>
                    </div>
                    {thpValue !== null && (
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">THP</span>
                        <span className="font-mono text-xs font-semibold text-emerald-700">
                          Rp {thpValue.toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MemberSearchAutocomplete;
