import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {enableMobileNumericKeyboards, enableNumberInputWheelGuard} from './utils/mobileNumericKeyboard.ts';
import {enablePrintAutoFit} from './utils/printAutoFit.ts';

enableMobileNumericKeyboards();
enableNumberInputWheelGuard();
enablePrintAutoFit();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
