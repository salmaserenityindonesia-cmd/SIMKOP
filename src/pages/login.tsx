import React from 'react';
import LoginForm from '../components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen relative flex flex-col justify-between selection:bg-secondary-container selection:text-on-secondary-container">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(#cbdbf5_1px,transparent_1px)] [background-size:24px_24px] opacity-60"></div>
      
      <header className="relative z-10 w-full px-margin-mobile lg:px-margin pt-space-lg pb-space-sm flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-headline-md text-headline-md tracking-tight font-bold shadow-[0_1px_3px_rgba(15,41,66,0.06)]">
            <span className="material-symbols-outlined text-[20px] text-secondary-fixed">account_balance</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-primary leading-none tracking-tight">SIMKOP</span>
            <span className="font-label-sm text-label-sm text-outline tracking-wider uppercase mt-0.5">Tata Kelola Mandiri</span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-full shadow-[0_1px_2px_rgba(15,41,66,0.04)] hidden sm:flex">
          <span className="material-symbols-outlined text-secondary text-[16px]">verified_user</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Fiduciary Audit Verified • ISO/IEC 27001</span>
        </div>
      </header>

      <main className="relative z-10 w-full flex-1 flex flex-col justify-center items-center px-margin-mobile lg:px-margin py-space-lg">
        <LoginForm />
      </main>

      <footer className="relative z-10 w-full px-margin-mobile lg:px-margin py-space-md flex flex-col sm:flex-row items-center justify-between gap-space-xs text-on-surface-variant">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[14px] text-outline">lock</span>
          <span className="font-label-sm text-label-sm">Terenkripsi Standar Institusi Finansial Nasional</span>
        </div>
        <div className="flex items-center gap-space-md font-label-sm text-label-sm">
          <a className="hover:text-primary transition-colors" href="#">Protokol Kepatuhan</a>
          <span className="text-outline-variant">•</span>
          <a className="hover:text-primary transition-colors" href="#">Bantuan Akses</a>
          <span className="text-outline-variant">•</span>
          <span>© 2025 SIMKOP Core</span>
        </div>
      </footer>
    </div>
  );
}
