import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white shadow-xl rounded-3xl p-12 flex flex-col items-center gap-8 w-full max-w-4xl">
        <img
          src="/images/aifa-logo.png"
          alt="Logotipo AIFA"
          className="h-24 w-auto"
          loading="lazy"
        />
        <App />
      </div>
    </div>
  </React.StrictMode>
);