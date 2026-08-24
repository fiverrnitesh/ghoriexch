import { gameCategories, getGamesByCategory } from '../games/registry'
import GameSection from '../components/home/GameSection'
import './GameHub.css'

export default function GameHub() {
  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header__inner">
          <div className="home-logo">
            <span className="home-logo__mark">GO</span>
            <span className="home-logo__text">Exchange</span>
          </div>

          <nav className="home-nav">
            <a href="#games" className="home-nav__link home-nav__link--active">
              Casino
            </a>
            <a href="#games" className="home-nav__link">
              Sports
            </a>
            <a href="#games" className="home-nav__link">
              Live
            </a>
          </nav>

          <div className="home-auth">
            <button type="button" className="home-auth__btn home-auth__btn--ghost">
              Login
            </button>
            <button type="button" className="home-auth__btn home-auth__btn--primary">
              Register
            </button>
          </div>
        </div>
      </header>

      <section className="home-banner">
        <div className="home-banner__content">
          <p className="home-banner__tag">Welcome bonus</p>
          <h1>Play live casino games</h1>
          <p>Dice, Teen Patti, Aviator &amp; more — all in one place.</p>
        </div>
      </section>

      <main id="games" className="home-main">
        {gameCategories.map((category) => (
          <GameSection
            key={category.id}
            title={category.title}
            games={getGamesByCategory(category.id)}
          />
        ))}
      </main>

      <footer className="home-footer">
        <p>Local development · Games platform</p>
      </footer>
    </div>
  )
}
