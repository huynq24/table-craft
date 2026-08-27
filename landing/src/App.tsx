import Header from './components/Header'
import Hero from './components/Hero'
import Features from './components/Features'
import Preview from './components/Preview'
import Download from './components/Download'
import Footer from './components/Footer'
import './App.css'

function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <Preview />
        <Download />
      </main>
      <Footer />
    </>
  )
}

export default App
