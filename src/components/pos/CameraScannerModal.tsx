import React, { useEffect } from 'react';
// Requires html5-qrcode installed. 
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function CameraScannerModal({ isOpen, onClose, onScanSuccess }) {
  useEffect(() => {
    if (isOpen) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
      scanner.render((text) => {
        scanner.clear();
        onScanSuccess(text);
      }, (err) => {
        // ignore errors during scanning
      });

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [isOpen, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-primary/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[22px]">photo_camera</span>
            <span className="font-title-md text-title-md">Pemindai Barcode Kamera HD</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col items-center">
          <div id="reader" className="w-full"></div>
          <div className="text-[12px] text-outline text-center mt-3">
            Arahkan barcode produk ke dalam kotak bidik. Mendukung EAN-13, QR Code.
          </div>
        </div>
      </div>
    </div>
  );
}