import './style.css';
import { Game } from './game/Game';
import { installViewportGuard } from './game/ViewportGuard';

installViewportGuard();

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
