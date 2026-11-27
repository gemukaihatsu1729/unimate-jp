import './style.css';
import { Game } from './game/Game';
import { installViewportGuard } from './game/ViewportGuard';

installViewportGuard();

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #game-canvas element');
}

new Game(canvas);
