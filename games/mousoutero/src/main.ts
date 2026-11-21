import './style.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Game canvas element #game-canvas not found');
}

// Prevent accidental iOS Safari pinch-zoom / scroll bounce during gameplay
document.addEventListener(
  'gesturestart',
  (e) => {
    e.preventDefault();
  },
  { passive: false }
);

new Game(canvas);
