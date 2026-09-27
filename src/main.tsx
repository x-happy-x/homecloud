import React from 'react';
import { createRoot } from 'react-dom/client';
// Общие стили — раньше компонентов: стили экранов уточняют примитивы и в
// каскаде должны идти после них.
// Onest лежит в сборке: политика страницы (default-src 'self') внешние шрифты не пустит.
import '@fontsource-variable/onest';
import './styles/index.scss';
import { App } from './App';
import { blockPageZoom } from './hooks/useGridZoom';

// Страница не масштабируется: щипок нужен сетке и просмотрщику.
blockPageZoom();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
