import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function LoginForm() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: identifier,
        password: password,
      });

      if (error) {
        setErrorMsg(error.message || 'Kredensial tidak valid');
      } else {
        // success - wait for auth guard to redirect or redirect here
        window.location.href = '/';
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Otentikasi Gagal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] px-margin-mobile sm:px-0 flex flex-col items-center">
      <div className="w-full bg-surface-container-lowest rounded-xl shadow-xl p-space-md sm:p-space-lg flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-container via-secondary to-primary-fixed-dim"></div>
        <div className="flex flex-col items-center text-center mt-space-xs">
          <div className="relative mb-space-sm">
            <div className="w-[56px] h-[56px] rounded-xl bg-surface-container flex items-center justify-center p-1.5 shadow-sm">
              <img alt="Logo Resmi SIMKOP" className="w-full h-full object-contain rounded-lg" src="/simkop_brand_logo/logo.png" />
            </div>
            <div className="absolute -bottom-1 -right-2 bg-surface-container-lowest px-1.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse"></span>
              <span className="font-label-sm text-[10px] leading-none text-secondary font-bold tracking-tight uppercase">Aktif</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-low text-secondary font-label-sm text-label-sm mb-space-xs">
            <span className="material-symbols-outlined text-[14px]">shield</span>
            <span>Portal Akses Manajemen Terpadu</span>
          </div>
          <h1 className="font-headline-md text-headline-md text-primary font-bold tracking-tight">SIM Koperasi</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[320px] mt-0.5">
            Sistem Manajemen Simpan Pinjam, Akuntansi & Penjualan Terpadu
          </p>
        </div>

        {errorMsg && (
          <div className="mt-space-md p-space-sm bg-error-container rounded-lg flex items-start justify-between gap-space-sm transition-all duration-300">
            <div className="flex items-start gap-space-xs text-on-error-container">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5 text-error">warning</span>
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm font-semibold text-error">Otentikasi Gagal</span>
                <span className="font-body-sm text-[12px] leading-[17px] text-on-error-container opacity-90">
                  {errorMsg}
                </span>
              </div>
            </div>
            <button className="text-on-error-container hover:text-error transition-colors p-1 rounded" onClick={() => setErrorMsg('')} type="button">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        <form className="mt-space-md flex flex-col gap-space-md" onSubmit={handleLogin}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="font-label-sm text-label-sm font-semibold text-on-surface" htmlFor="userIdentifier">
                Email / Nomor Identitas Pegawai (NIP/ID)
              </label>
              <span className="font-label-sm text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-surface-container-high text-on-primary-fixed-variant rounded">
                Wajib
              </span>
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center pointer-events-none text-outline">
                <span className="material-symbols-outlined text-[20px]">badge</span>
              </div>
              <input 
                className="w-full pl-10 pr-3 py-2.5 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#006a61] transition-all" 
                id="userIdentifier" 
                name="identifier" 
                placeholder="contoh: OP-10492 atau nama@koperasi.id" 
                required 
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="font-label-sm text-label-sm font-semibold text-on-surface" htmlFor="userPassword">
                Kata Sandi Pengguna
              </label>
              <span className="font-label-sm text-label-sm text-outline font-normal">Karakter Rahasia</span>
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center pointer-events-none text-outline">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </div>
              <input 
                className="w-full pl-10 pr-10 py-2.5 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px_#006a61] transition-all" 
                id="userPassword" 
                name="password" 
                placeholder="••••••••••••" 
                required 
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button aria-label="Tampilkan atau sembunyikan kata sandi" className="absolute right-2.5 p-1 text-outline hover:text-on-surface transition-colors flex items-center justify-center rounded" onClick={() => setShowPassword(!showPassword)} type="button">
                <span className="material-symbols-outlined text-[19px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input className="w-4 h-4 rounded text-secondary bg-surface-container-high focus:ring-0 cursor-pointer accent-secondary" name="rememberDevice" type="checkbox"/>
              <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Ingat perangkat ini</span>
            </label>
            <a className="font-title-sm text-title-sm text-secondary hover:underline transition-all" href="#">
              Lupa kata sandi?
            </a>
          </div>
          
          <button 
            className={`w-full mt-space-xs py-3 px-space-md rounded-lg bg-gradient-to-r from-primary via-primary-container to-primary-container text-on-primary font-title-md text-title-md flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:brightness-110 active:scale-[0.99] transition-all ${isLoading ? 'opacity-90 cursor-not-allowed' : ''}`} 
            type="submit"
            disabled={isLoading}
          >
            <span className="tracking-wide">{isLoading ? 'Memverifikasi Kredensial...' : 'Masuk ke Sistem'}</span>
            {!isLoading && <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1">arrow_forward</span>}
            {isLoading && (
              <svg className="animate-spin h-5 w-5 text-on-primary" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor"></path>
              </svg>
            )}
          </button>
        </form>
        
        <div className="mt-space-md pt-space-sm flex items-center justify-center gap-1.5 bg-surface-container-low py-2 px-3 rounded-lg text-secondary">
          <span className="material-symbols-outlined text-[16px] text-on-tertiary-container">lock</span>
          <span className="font-label-sm text-label-sm font-semibold tracking-wide">Koneksi Terenkripsi 256-bit SSL & Aman</span>
        </div>
      </div>
      
      <div className="w-full flex flex-col items-center text-center mt-space-md gap-space-xs">
        <p className="font-body-sm text-body-sm text-outline max-w-[380px]">
          Akses terbatas khusus Pengurus, Pengawas & Operator Koperasi yang telah terdaftar secara sah.
        </p>
        <span className="font-label-sm text-[11px] text-outline mt-1 tracking-wider">
          SIMKOP Enterprise Core v1.0.0 • Hak Cipta © 2025 Koperasi Indonesia
        </span>
      </div>
    </div>
  );
}
