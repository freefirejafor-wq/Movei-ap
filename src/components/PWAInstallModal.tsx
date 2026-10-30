import React from 'react';
import { CheckCircle2, Download, Share, Smartphone, PlusSquare, X } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onTriggerInstall: () => Promise<boolean>;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isInstallable,
  isInstalled,
  onTriggerInstall,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#111621] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#f47521]/15 border border-[#f47521]/40 text-[#f47521] flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                Install iPhone Cinema App
              </h3>
              <p className="text-xs text-slate-400">
                আইফোনের হোম স্ক্রিনে ফুল-স্ক্রিন অ্যাপ হিসেবে ব্যবহার করুন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close install guide"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isInstalled ? (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/30 p-4 flex items-center gap-3 text-emerald-200 text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>অ্যাপটি ইতিমধ্যে আপনার ডিভাইসের হোম স্ক্রিনে ইনস্টল করা আছে!</span>
          </div>
        ) : (
          <div className="space-y-4">
            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await onTriggerInstall();
                  if (ok) onClose();
                }}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#f47521] hover:bg-[#ff8533] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>1-Tap Install App Now</span>
              </button>
            )}

            <div className="rounded-2xl bg-[#0c1018] border border-white/10 p-4 space-y-3.5">
              <div className="text-xs font-bold text-white">
                iPhone / iPad (Safari Browser) ইনস্টল করার নিয়ম:
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-[#141b29] border border-white/10 flex items-center justify-center text-[#1296b0] shrink-0 font-bold">
                  1
                </div>
                <div className="leading-relaxed">
                  সাফারি ব্রাউজারের নিচে থাকা <strong className="text-white">Share</strong> বাটনে ট্যাপ করুন।
                  <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded bg-white/10 text-cyan-300">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-[#141b29] border border-white/10 flex items-center justify-center text-[#f47521] shrink-0 font-bold">
                  2
                </div>
                <div className="leading-relaxed">
                  নিচে স্ক্রল করে <strong className="text-white">Add to Home Screen</strong> অপশনে ট্যাপ করুন।
                  <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded bg-white/10 text-amber-300">
                    <PlusSquare className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-[#141b29] border border-white/10 flex items-center justify-center text-emerald-400 shrink-0 font-bold">
                  3
                </div>
                <div className="leading-relaxed">
                  উপরে ডান কোণায় <strong className="text-white">Add</strong> বাটনে ট্যাপ করলেই আপনার আইফোনে নেটিভ অ্যাপের মতো চালু হয়ে যাবে!
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
        >
          ঠিক আছে (Close)
        </button>
      </div>
    </div>
  );
};
