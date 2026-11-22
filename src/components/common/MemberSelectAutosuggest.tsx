import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { extractMemberTHP } from '../../services/memberService';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';

export interface MemberAutosuggestOption {
  id: string;
  nrp?: string;
  nama?: string;
  name?: string;
  tanggal_lahir?: string | null;
  take_home_pay?: number | string | null;
  master_thp?: number | string | null;
  salary?: number | string | null;
}

export interface MemberSelectAutosuggestProps {
  members: MemberAutosuggestOption[];
  selectedMemberId: string;
  onSelectMember: (member: MemberAutosuggestOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const MAX_SUGGESTIONS = 15;

const formatMemberName = (member: MemberAutosuggestOption): string =>
  member.nama || member.name || '';

const formatMemberLabel = (member: MemberAutosuggestOption): string => {
  const nrp = member.nrp?.trim() || '';
  const nama = formatMemberName(member).trim();
  if (nrp && nama) return `${nrp} - ${nama}`;
  return nrp || nama;
};

const formatThpCurrency = (value: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(value);

export const MemberSelectAutosuggest: React.FC<MemberSelectAutosuggestProps> = ({
  members,
  selectedMemberId,
  onSelectMember,
  placeholder = 'Ketik NRP atau Nama Anggota...',
  disabled = false
}) => {
  const selectedMember = useMemo(
    () => members.find(m => String(m.id) === String(selectedMemberId)) || null,
    [members, selectedMemberId]
  );

  const [query, setQuery] = useState<string>(() =>
    selectedMember ? formatMemberLabel(selectedMember) : ''
  );
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedMember) {
      setQuery(formatMemberLabel(selectedMember));
    } else if (!selectedMemberId) {
      setQuery('');
    }
  }, [selectedMemberId, selectedMember]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredMembers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const isShowingSelectedLabel =
      selectedMember !== null && query === formatMemberLabel(selectedMember);

    if (!trimmed || isShowingSelectedLabel) {
      return members.slice(0, MAX_SUGGESTIONS);
    }

    return members
      .filter(member => {
        const nama = formatMemberName(member).toLowerCase();
        const nrp = (member.nrp || '').toLowerCase();
        return nama.includes(trimmed) || nrp.includes(trimmed);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [members, query, selectedMember]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredMembers]);

  const handleSelect = (member: MemberAutosuggestOption) => {
    onSelectMember(member);
    setQuery(formatMemberLabel(member));
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setHighlightedIndex(0);
    onSelectMember(null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setQuery(nextValue);
    setIsOpen(true);

    if (!nextValue.trim() && selectedMemberId) {
      onSelectMember(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredMembers.length > 0) {
        setHighlightedIndex(prev => (prev + 1) % filteredMembers.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredMembers.length > 0) {
        setHighlightedIndex(
          prev => (prev - 1 + filteredMembers.length) % filteredMembers.length
        );
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = filteredMembers[highlightedIndex];
      if (chosen) {
        handleSelect(chosen);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search
          className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="member-autosuggest-list"
          value={query}
          disabled={disabled}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        />
        {!disabled && (query.length > 0 || Boolean(selectedMemberId)) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Hapus pilihan anggota"
            className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <ul
          id="member-autosuggest-list"
          role="listbox"
          className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100"
        >
          {filteredMembers.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500 text-center">
              {query.trim()
                ? `Anggota dengan kata kunci '${query.trim()}' tidak ditemukan.`
                : 'Belum ada data anggota aktif.'}
            </li>
          ) : (
            filteredMembers.map((member, index) => {
              const isHighlighted = index === highlightedIndex;
              const isSelected = String(member.id) === String(selectedMemberId);
              const thpValue = extractMemberTHP(member);
              const memberName = formatMemberName(member) || '-';

              return (
                <li
                  key={member.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={e => {
                    e.preventDefault();
                    handleSelect(member);
                  }}
                  className={`px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                    isHighlighted
                      ? 'bg-emerald-50'
                      : isSelected
                        ? 'bg-slate-50'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      {memberName}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {member.nrp && (
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          {member.nrp}
                        </span>
                      )}
                      {member.tanggal_lahir && (
                        <span className="text-xs text-slate-600 truncate">
                          Tgl Lahir: {formatTanggalLahirWithAge(member.tanggal_lahir)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                    THP: {formatThpCurrency(thpValue)}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
};

export default MemberSelectAutosuggest;
