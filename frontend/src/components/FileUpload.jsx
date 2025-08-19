import React, { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { uploadFiles, processFiles, getProgress } from '../store/slices/pdfSlice'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Upload, X, FileText, AlertCircle } from 'lucide-react'

const FileUpload = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { processingStatus, error, processingProgress } = useSelector((state) => state.pdf)
  
  const [selectedFiles, setSelectedFiles] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const progressIntervalRef = useRef(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = (files) => {
    const pdfFiles = Array.from(files).filter(file => 
      file.type === 'application/pdf'
    )
    setSelectedFiles(prev => [...prev, ...pdfFiles])
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    handleFileSelect(files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Start progress polling when processing starts
  useEffect(() => {
    console.log('🔄 Processing status changed:', processingStatus)
    console.log('📊 Current progress:', processingProgress)
    
    if (processingStatus === 'processing') {
      console.log('🚀 Starting progress polling...')
      // Start polling for progress updates
      const interval = setInterval(() => {
        dispatch(getProgress())
      }, 2000) // Poll every second
      
      progressIntervalRef.current = interval
      
      // Cleanup interval when processing completes
      return () => {
        if (interval) {
          console.log('🛑 Clearing progress interval')
          clearInterval(interval)
          progressIntervalRef.current = null
        }
      }
    } else if (processingStatus === 'completed') {
      // When processing is marked as completed, do one final poll
      console.log('🔄 Processing marked as completed, doing final progress check')
      dispatch(getProgress())
      
      // Clear any existing interval
      if (progressIntervalRef.current) {
        console.log('🛑 Clearing progress interval (completed)')
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    } else {
      // Clear interval when not processing
      if (progressIntervalRef.current) {
        console.log('🛑 Clearing progress interval (not processing)')
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [processingStatus, dispatch])

  // Additional check to stop polling if processing should be complete
  useEffect(() => {
    if (processingProgress.is_processing === false && 
        processingProgress.status === 'completed' && 
        progressIntervalRef.current) {
      console.log('✅ Processing detected as complete, stopping polling')
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [processingProgress.is_processing, processingProgress.status])

  // Force progress update when processing status changes to completed
  useEffect(() => {
    if (processingStatus === 'completed') {
      console.log('🔄 Processing status changed to completed, forcing progress update')
      // Force a progress update to get the latest state
      dispatch(getProgress())
    }
  }, [processingStatus, dispatch])

  // Navigate to viewer when processing completes
  useEffect(() => {
    if (processingProgress.status === 'completed') {
      console.log('✅ Processing completed, navigating to viewer...')
      // Make one final progress request to ensure we have the latest state
      dispatch(getProgress())
      // Add a small delay to ensure the final progress update is shown
      setTimeout(() => {
        navigate('/viewer')
      }, 2000)
    }
  }, [processingProgress.status, navigate, dispatch])

  // Fallback navigation if processing status is completed but progress doesn't update
  useEffect(() => {
    if (processingStatus === 'completed') {
      console.log('🔄 Processing status is completed, setting fallback navigation')
      const fallbackTimer = setTimeout(() => {
        console.log('⏰ Fallback navigation triggered')
        navigate('/viewer')
      }, 5000) // 5 second fallback
      
      return () => clearTimeout(fallbackTimer)
    }
  }, [processingStatus, navigate])

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return

    try {
      // Upload files
      const uploadResult = await dispatch(uploadFiles(selectedFiles))
      
      if (uploadFiles.fulfilled.match(uploadResult)) {
        // Process files (navigation will be handled by progress effect)
        await dispatch(processFiles())
      }
    } catch (error) {
      console.error('Error uploading files:', error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">PDF Analyzer</h1>
          <p className="text-muted-foreground">
            Upload PDF files to analyze and find similar sections
          </p>
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Upload PDF Files</h3>
          <p className="text-muted-foreground mb-4">
            Drag and drop PDF files here, or click to select files
          </p>
          <Button variant="outline">
            Select Files
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </div>

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold mb-3">Selected Files ({selectedFiles.length})</h3>
            <div className="space-y-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-sm text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {processingProgress.is_processing && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Processing files... ({processingProgress.processed_files}/{processingProgress.total_files})
              </span>
              <span className="text-sm text-muted-foreground">
                {processingProgress.percentage}%
              </span>
            </div>
            <Progress value={processingProgress.percentage} className="w-full" />
            {processingProgress.current_file && (
              <div className="mt-2 text-xs text-muted-foreground">
                Currently processing: {processingProgress.current_file}
              </div>
            )}
          </div>
        )}

        {/* Completion Message */}
        {processingProgress.status === 'completed' && !processingProgress.is_processing && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <div className="h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">
                Processing completed! Opening viewer...
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6">
          <Button
            onClick={handleSubmit}
            disabled={selectedFiles.length === 0 || processingProgress.is_processing}
            className="w-full"
            size="lg"
          >
            {processingProgress.is_processing 
              ? `Processing... (${processingProgress.processed_files}/${processingProgress.total_files})` 
              : 'Upload & Process Files'
            }
          </Button>
        </div>
      </div>
    </div>
  )
}

export default FileUpload
