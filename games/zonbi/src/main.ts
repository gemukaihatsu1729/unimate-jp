import './style.css';
import { Game } from './game/Game';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Missing #game-canvas element');
  }
  const game = new Game(canvas);
  (window as unknown as { __shelterMusou?: Game }).__shelterMusou = game;
});
