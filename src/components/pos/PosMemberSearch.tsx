import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import type { MemberFinancials } from '../../services/posCreditService';

export interface PosMember {
  id: string;
  nomor_referensi?: string | null;
  no_referensi?: string | null;
  nrp?: string | null;
  nama: string;
  take_home_pay?: number | null;
  status?: string | null;
  membership_status?: string | null;
}

export const MAX_POS_MEMBER_SUGGESTIONS = 15;

export interface PosMemberSearchProps {
  members: PosMember[];
  selectedMember: PosMember | null;
  onSelectMember: (member: PosMember | null) => void;
  memberFinancials?: MemberFinancials | null;
  isLoadingFinancials?: boolean;
  autoFocusSearch?: boolean;
  defaultOpen?: boolean;
}

function getMemberRefValue(member: PosMember): string {
  return String(member.nomor_referensi ?? member.no_referensi ?? '').trim();
}

/**
 * Filter POS members by id, nomor_referensi (with or without REF- prefix), nrp, or nama.
 * Returns at most `limit` items alongside the total match count.
 */
export function filterPosMembers(
  members: PosMember[],
  query: string,
  limit: number = MAX_POS_MEMBER_SUGGESTIONS
): { items: PosMember[]; totalMatches: number } {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      items: members.slice(0, limit),
      totalMatches: members.length,
    };
  }

  const qNoPrefix = q.replace(/^ref[-\s]?/i, '');

  const matched = members.filter((m) => {
    if (String(m.id || '').toLowerCase().includes(q)) {
      return true;
    }

    const refRaw = getMemberRefValue(m).toLowerCase();
    if (refRaw) {
      if (refRaw.includes(q)) {
        return true;
      }
      const refNoPrefix = refRaw.replace(/^ref[-\s]?/i, '');
      if (qNoPrefix.length > 0 && refNoPrefix.includes(qNoPrefix)) {
        return true;
      }
    }

    if (String(m.nrp || '').toLowerCase().includes(q)) {
      return true;
    }

    if (String(m.nama || '').toLowerCase().includes(q)) {
      return true;
    }

    return false;
  });

  return {
    items: matched.slice(0, limit),
    totalMatches: matched.length,
  };
}

/**
 * Pure helper to calculate next highlighted index for ArrowUp / ArrowDown navigation.
 */
export function getNextHighlightedIndex(
  current: number,
  total: number,
  key: 'ArrowDown' | 'ArrowUp'
): number {
  if (total <= 0) return -1;

  if (key === 'ArrowDown') {
    if (current < 0) return 0;
    return Math.min(current + 1, total - 1);
  }

  if (current < 0) return total - 1;
  return Math.max(current - 1, 0);
}

export default function PosMemberSearch({
  members,
  selectedMember,
  onSelectMember,
  memberFinancials = null,
  isLoadingFinancials = false,
  autoFocusSearch = false,
  defaultOpen = false,
}: PosMemberSearchProps) {
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState<boolean>(defaultOpen);
  const [highlightedMemberIndex, setHighlightedMemberIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsMemberDropdownOpen(false);
        setHighlightedMemberIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const { items, totalMatches } = filterPosMembers(
    members,
    memberSearchQuery,
    MAX_POS_MEMBER_SUGGESTIONS
  );

  useEffect(() => {
    if (
      isMemberDropdownOpen &&
      highlightedMemberIndex >= 0 &&
      itemRefs.current[highlightedMemberIndex]
    ) {
      itemRefs.current[highlightedMemberIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [highlightedMemberIndex, isMemberDropdownOpen]);

  const handleSelectMember = (member: PosMember) => {
    onSelectMember(member);
    setMemberSearchQuery('');
    setIsMemberDropdownOpen(false);
    setHighlightedMemberIndex(-1);
  };

  const handleClearSelected = () => {
    onSelectMember(null);
    setMemberSearchQuery('');
    setIsMemberDropdownOpen(true);
    setHighlightedMemberIndex(0);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isMemberDropdownOpen) {
        setIsMemberDropdownOpen(true);
        setHighlightedMemberIndex(items.length > 0 ? 0 : -1);
      } else {
        setHighlightedMemberIndex((prev) =>
          getNextHighlightedIndex(prev, items.length, 'ArrowDown')
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isMemberDropdownOpen) {
        setIsMemberDropdownOpen(true);
        setHighlightedMemberIndex(Math.max(items.length - 1, -1));
      } else {
        setHighlightedMemberIndex((prev) =>
          getNextHighlightedIndex(prev, items.length, 'ArrowUp')
        );
      }
    } else if (e.key === 'Enter') {
      if (
        isMemberDropdownOpen &&
        highlightedMemberIndex >= 0 &&
        highlightedMemberIndex < items.length
      ) {
        e.preventDefault();
        handleSelectMember(items[highlightedMemberIndex]);
      } else if (isMemberDropdownOpen && items.length === 1) {
        e.preventDefault();
        handleSelectMember(items[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsMemberDropdownOpen(false);
      setHighlightedMemberIndex(-1);
    }
  };

  if (selectedMember) {
    const selectedRef = getMemberRefValue(selectedMember);

    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-primary">
              {selectedRef && (
                <>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-secondary/15 text-secondary font-mono text-[11px] font-bold border border-secondary/30 shrink-0">
                    {selectedRef}
                  </span>
                  <span className="text-outline-variant">•</span>
                </>
              )}
              <span className="font-mono text-xs text-on-surface-variant shrink-0">
                {selectedMember.nrp || '-'}
              </span>
              <span className="text-outline-variant">—</span>
              <span className="truncate text-on-surface font-bold">{selectedMember.nama}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearSelected}
            aria-label="Ganti / Cari Lain"
            title="Ganti / Cari Lain"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-surface border border-outline-variant/60 text-on-surface-variant hover:text-error hover:border-error/50 hover:bg-error-container/20 transition-colors shrink-0 cursor-pointer"
          >
            <span>Ganti</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="pt-2 border-t border-outline-variant/40">
          {isLoadingFinancials ? (
            <div className="text-[11px] text-on-surface-variant animate-pulse">
              Memuat saldo Simpanan Belanja &amp; limit Bon Toko...
            </div>
          ) : memberFinancials ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface rounded-md px-2.5 py-1.5 border border-outline-variant/40">
                <div className="text-[10px] text-on-surface-variant font-medium">
                  Simpanan Belanja
                </div>
                <div className="font-mono text-xs font-bold text-primary">
                  Rp {memberFinancials.belanjaBalance.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="bg-surface rounded-md px-2.5 py-1.5 border border-outline-variant/40">
                <div className="text-[10px] text-on-surface-variant font-medium">
                  Limit Bon Toko
                </div>
                <div
                  className={`font-mono text-xs font-bold ${
                    memberFinancials.remainingCreditLimit > 0
                      ? 'text-emerald-600'
                      : 'text-error'
                  }`}
                >
                  Rp {memberFinancials.remainingCreditLimit.toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-outline">
              Anggota aktif terpilih — saldo &amp; limit siap digunakan.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative w-full" ref={containerRef}>
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-outline absolute left-2.5 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            autoFocus={autoFocusSearch}
            role="combobox"
            aria-expanded={isMemberDropdownOpen}
            aria-autocomplete="list"
            aria-controls="pos-member-listbox"
            aria-activedescendant={
              highlightedMemberIndex >= 0
                ? `pos-member-option-${highlightedMemberIndex}`
                : undefined
            }
            value={memberSearchQuery}
            onChange={(e) => {
              setMemberSearchQuery(e.target.value);
              setIsMemberDropdownOpen(true);
              setHighlightedMemberIndex(0);
            }}
            onFocus={() => {
              setIsMemberDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ketik No. ID / Ref, NRP, atau Nama Anggota..."
            className="w-full pl-8 pr-7 py-2 text-sm bg-surface border border-outline-variant rounded-lg text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition-colors"
          />
          {memberSearchQuery && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Hapus kata kunci pencarian"
              onClick={() => {
                setMemberSearchQuery('');
                setIsMemberDropdownOpen(true);
                setHighlightedMemberIndex(0);
                inputRef.current?.focus();
              }}
              className="absolute right-2 p-0.5 rounded text-outline hover:text-on-surface cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isMemberDropdownOpen && (
          <div
            id="pos-member-listbox"
            role="listbox"
            className="absolute z-50 left-0 right-0 mt-1 bg-surface border border-outline-variant/60 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-outline-variant/20"
          >
            {items.length === 0 ? (
              <div className="p-3 text-center text-xs text-on-surface-variant">
                Anggota tidak ditemukan
              </div>
            ) : (
              <>
                <div className="px-2.5 py-1.5 bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between border-b border-outline-variant/30 sticky top-0 z-10">
                  <span>
                    {totalMatches > items.length
                      ? `Menampilkan ${items.length} dari ${totalMatches} anggota cocok`
                      : `${totalMatches} anggota`}
                  </span>
                  <span className="font-mono text-[10px] text-outline">↑ ↓ Enter</span>
                </div>
                {items.map((member, idx) => {
                  const isHighlighted = idx === highlightedMemberIndex;
                  const refValue = getMemberRefValue(member);
                  const badgeLabel = refValue || `#${member.id.slice(0, 6)}`;

                  return (
                    <button
                      key={member.id}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      id={`pos-member-option-${idx}`}
                      aria-selected={isHighlighted}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectMember(member);
                      }}
                      onMouseEnter={() => setHighlightedMemberIndex(idx)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isHighlighted
                          ? 'bg-secondary/15 text-primary'
                          : 'hover:bg-surface-container-low text-on-surface'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/50 font-mono text-[10px] font-semibold text-secondary shrink-0">
                          {badgeLabel}
                        </span>
                        <span className="font-mono text-[11px] text-on-surface-variant shrink-0">
                          {member.nrp || '-'}
                        </span>
                        <span className="text-xs font-bold truncate">{member.nama}</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant/40 text-[11px] text-outline">
        Cari &amp; pilih anggota untuk memuat saldo Simpanan Belanja &amp; limit Bon Toko.
      </div>
    </div>
  );
}
