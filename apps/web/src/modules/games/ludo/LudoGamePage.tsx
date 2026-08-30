import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './state/store';
import Play from './pages/Play/Play';
import './ludo-game.css';

export function LudoGamePage() {
  useEffect(() => {
    document.documentElement.classList.add('ludo-game-active');
    return () => {
      document.documentElement.classList.remove('ludo-game-active');
    };
  }, []);

  return (
    <Provider store={store}>
      <Play />
    </Provider>
  );
}

export default LudoGamePage;
