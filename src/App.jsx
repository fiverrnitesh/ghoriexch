import { BrowserRouter, Route, Routes } from 'react-router-dom'
import GameHub from './pages/GameHub'
import GamePage from './pages/GamePage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GameHub />} />
        <Route path="/play/:gameId" element={<GamePage />} />
      </Routes>
    </BrowserRouter>
  )
}
