import React, { useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import FileUpload from './components/FileUpload'
import PDFViewer from './components/PDFViewer'

function App() {
  const pdfViewerRef = useRef(null)

  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route path="/" element={<FileUpload />} />
        <Route path="/viewer" element={<PDFViewer ref={pdfViewerRef} />} />
      </Routes>
    </div>
  )
}

export default App
