import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import { bindAudioUnlock } from './game/audio.ts';

bindAudioUnlock(); // sound may start from the first click, so menu buttons click too

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
