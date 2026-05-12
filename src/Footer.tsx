import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="mt-auto py-8 px-8 text-center relative z-10">
      <div className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-white/40 backdrop-blur-md border border-white/50 shadow-sm text-slate-500 text-sm font-medium hover:bg-white/60 transition-colors">
        <span>&copy; สตท.8 {new Date().getFullYear() + 543}</span>
        <div className="w-1 h-1 rounded-full bg-slate-300"></div>
        <span>All rights reserved.</span>
      </div>
    </footer>
  );
};

export default Footer;
