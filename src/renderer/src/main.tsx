import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Companion } from './Companion'
import './styles.css'

// The same page serves the main window and the floating companion overlay (loaded with #companion).
const companion = location.hash === '#companion'
if (companion) document.documentElement.classList.add('companion')

createRoot(document.getElementById('root')!).render(<StrictMode>{companion ? <Companion /> : <App />}</StrictMode>)
