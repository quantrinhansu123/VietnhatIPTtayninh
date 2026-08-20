import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {enableMobileNumericKeyboards} from './utils/mobileNumericKeyboard.ts';
import {enablePrintAutoFit} from './utils/printAutoFit.ts';

enableMobileNumericKeyboards();
enablePrintAutoFit();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
