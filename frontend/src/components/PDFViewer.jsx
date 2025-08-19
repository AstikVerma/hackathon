import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { findSimilarSections, setSelectedText, getStatus, setCurrentPdfIndex, generateInsights, clearInsights } from '../store/slices/pdfSlice'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight, Search, FileText, Hash, Eye, Upload, Plus, Lightbulb } from 'lucide-react'
import RankedSections from './RankedSections'
import InsightsModal from './InsightsModal'

const PDFViewer = forwardRef((props, ref) => {
  const dispatch = useDispatch()
  const { uploadedFiles, currentPdfIndex, similarSections, selectedText, processingStatus, similaritySearchStatus, insights, insightsStatus } = useSelector((state) => state.pdf)
  
  const [pdfUrl, setPdfUrl] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [newlyUploadedFile, setNewlyUploadedFile] = useState(null)
  const [initiallyUploadedFiles, setInitiallyUploadedFiles] = useState([])
  const [currentInitialFileIndex, setCurrentInitialFileIndex] = useState(0)
  const [rightPdfUrl, setRightPdfUrl] = useState('')
  const [isInsightsModalOpen, setIsInsightsModalOpen] = useState(false)
  const [adobeClientId, setAdobeClientId] = useState('')
  
  const pdfContainerRef = useRef(null)
  const adobeViewerRef = useRef(null)
  const rightPdfContainerRef = useRef(null)
  const rightAdobeViewerRef = useRef(null)
  const fileInputRef = useRef(null)
  
  // Add refs for debouncing and tracking previous text
  const intervalRef = useRef(null)
  const previousTextRef = useRef('')
  const debounceTimeoutRef = useRef(null)

  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    goToPageInRightViewer: (pageNumber) => {
      console.log('goToPageInRightViewer called with page:', pageNumber);
      console.log('rightAdobeViewerRef.current available:', !!rightAdobeViewerRef.current);
      
      if (rightAdobeViewerRef.current) {
        console.log('Getting APIs from right Adobe viewer...');
        rightAdobeViewerRef.current.getAPIs().then(apis => {
          console.log('APIs obtained, calling gotoLocation...');
          apis.gotoLocation(pageNumber, 0, 0)
            .then(() => console.log(`Successfully navigated to page ${pageNumber}`))
            .catch(error => {
              console.error('Error navigating to page:', error);
              console.error('Error details:', {
                code: error.code,
                message: error.message,
                pageNumber: pageNumber
              });
            })
        }).catch(error => {
          console.error('Error getting APIs:', error);
          console.error('API error details:', {
            code: error.code,
            message: error.message
          });
        })
      } else {
        console.warn('Right Adobe viewer not initialized yet');
        console.log('rightAdobeViewerRef.current:', rightAdobeViewerRef.current);
      }
    },
    switchPdfAndGoToPage: (pdfIndex, pageNumber) => {
      console.log('switchPdfAndGoToPage called with pdfIndex:', pdfIndex, 'pageNumber:', pageNumber);
      
      // First switch to the correct PDF
      if (pdfIndex >= 0 && pdfIndex < initiallyUploadedFiles.length) {
        console.log('Switching to PDF index:', pdfIndex);
        setCurrentInitialFileIndex(pdfIndex);
        
        // Wait for the PDF to load, then navigate to the page
        setTimeout(() => {
          console.log('PDF should be loaded now, attempting navigation to page:', pageNumber);
          if (rightAdobeViewerRef.current) {
            rightAdobeViewerRef.current.getAPIs().then(apis => {
              console.log('APIs obtained after PDF switch, calling gotoLocation...');
              apis.gotoLocation(pageNumber, 0, 0)
                .then(() => console.log(`Successfully navigated to page ${pageNumber} in new PDF`))
                .catch(error => {
                  console.error('Error navigating to page after PDF switch:', error);
                })
            }).catch(error => {
              console.error('Error getting APIs after PDF switch:', error);
            })
          } else {
            console.warn('Right Adobe viewer not available after PDF switch');
          }
        }, 3000); // Wait 3 seconds for PDF to load
      } else {
        console.error('Invalid PDF index:', pdfIndex);
      }
    }
  }))

  // Debounced function to handle text selection changes
  const debouncedTextSelection = useCallback((text) => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    
    // Only proceed if text is different from previous
    if (text !== previousTextRef.current) {
      console.log('Text changed, starting debounce timer...')
      // Set a new timeout
      debounceTimeoutRef.current = setTimeout(() => {
        if (text && text.trim()) {
          console.log('Making similarity search request for:', text.substring(0, 50) + '...')
          dispatch(setSelectedText(text))
          dispatch(findSimilarSections({ selectedText: text }))
          // Also generate insights in the background
          dispatch(generateInsights({ selectedText: text }))
        }
        previousTextRef.current = text
      }, 500) // 500ms debounce delay
    } else {
      console.log('Text unchanged, skipping request')
    }
  }, [dispatch])

  // Cleanup function to clear intervals and timeouts
  const cleanupTextSelection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
      debounceTimeoutRef.current = null
    }
  }, [])

  // Load current status when component mounts
  useEffect(() => {
    dispatch(getStatus())
  }, [dispatch])

  // Fetch Adobe client ID from backend
  useEffect(() => {
    const fetchAdobeClientId = async () => {
      try {
        const response = await fetch('/api/config')
        const data = await response.json()
        setAdobeClientId(data.adobe_client_id)
      } catch (error) {
        console.warn('Failed to fetch Adobe client ID from backend, using fallback')
        setAdobeClientId(import.meta.env.VITE_ADOBE_CLIENT_ID || "4262f000329a47a1ad50ae29a2022b35")
      }
    }
    fetchAdobeClientId()
  }, [])

  // Cleanup intervals and timeouts when component unmounts
  useEffect(() => {
    return () => {
      cleanupTextSelection()
    }
  }, [cleanupTextSelection])

  // Separate files into initially uploaded (right side)
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      setInitiallyUploadedFiles(uploadedFiles)
    }
  }, [uploadedFiles])

  // Load PDF for newly uploaded file (left side)
  useEffect(() => {
    if (newlyUploadedFile) {
      setPdfUrl(URL.createObjectURL(newlyUploadedFile))
    }
  }, [newlyUploadedFile])

  // Load PDF for initially uploaded files (right side)
  useEffect(() => {
    if (initiallyUploadedFiles.length > 0 && currentInitialFileIndex < initiallyUploadedFiles.length) {
      const filename = initiallyUploadedFiles[currentInitialFileIndex]
      setRightPdfUrl(`/api/pdf/${filename}`)
    }
  }, [initiallyUploadedFiles, currentInitialFileIndex])

  useEffect(() => {
    if (pdfUrl && pdfContainerRef.current) {
      // Clean up any existing intervals before loading new PDF
      cleanupTextSelection()
      loadAdobePDF()
    }
  }, [pdfUrl, cleanupTextSelection])

  useEffect(() => {
    if (rightPdfUrl && rightPdfContainerRef.current) {
      loadRightAdobePDF()
    }
  }, [rightPdfUrl])

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'application/pdf') {
      setNewlyUploadedFile(file)
    }
  }

  const loadAdobePDF = () => {
    if (!window.AdobeDC) {
      console.warn('Adobe DC library not loaded yet, retrying in 1 second...')
      setTimeout(loadAdobePDF, 1000)
      return
    }

    try {
      const adobeDCView = new window.AdobeDC.View({
        clientId: adobeClientId || import.meta.env.VITE_ADOBE_CLIENT_ID || "4262f000329a47a1ad50ae29a2022b35",
        divId: "adobe-dc-view"
      })

      adobeViewerRef.current = adobeDCView

      adobeDCView.previewFile({
        content: { location: { url: pdfUrl } },
        metaData: { fileName: newlyUploadedFile?.name || 'New File' }
      }, {
        defaultViewMode: "FIT_WIDTH",
        showDownloadPDF: false,
        showPrintPDF: false,
        showLeftHandPanel: false,
        showAnnotationTools: false,
        enableFormFilling: false
      }).then(adobeViewer => {
        // Store the viewer reference for text selection
        adobeViewerRef.current = adobeViewer
        
        // Listen for text selection using getSelectedContent API
        adobeViewer.getAPIs().then(apis => {
          // Clear any existing interval
          cleanupTextSelection()
          
          // Set up a periodic check for selected content
          intervalRef.current = setInterval(() => {
            apis.getSelectedContent()
              .then(result => {
                if (result && result.type === 'text' && result.data && result.data.trim()) {
                  // Use debounced function instead of direct dispatch
                  debouncedTextSelection(result.data)
                }
              })
              .catch(error => {
                // Ignore errors when no text is selected
                // console.log('No text selected or error:', error)
              })
          }, 1000) // Check every second
        })
      })

      // Listen for page changes
      adobeDCView.registerCallback(
        window.AdobeDC.View.Enum.CoreControls.API_EVENT_TYPE.PAGE_CHANGED,
        (event) => {
          setCurrentPage(event.data.pageNumber)
        }
      )

      // Get total pages
      adobeDCView.registerCallback(
        window.AdobeDC.View.Enum.CoreControls.API_EVENT_TYPE.DOCUMENT_OPENED,
        (event) => {
          setTotalPages(event.data.totalPages)
        }
      )
    } catch (error) {
      console.error('Error loading Adobe PDF:', error)
    }
  }

  const loadRightAdobePDF = () => {
    if (!window.AdobeDC) {
      console.warn('Adobe DC library not loaded yet, retrying in 1 second...')
      setTimeout(loadRightAdobePDF, 1000)
      return
    }

    try {
      const adobeDCView = new window.AdobeDC.View({
        clientId: adobeClientId || import.meta.env.VITE_ADOBE_CLIENT_ID || "4262f000329a47a1ad50ae29a2022b35",
        divId: "right-adobe-dc-view"
      })

      adobeDCView.previewFile({
        content: { location: { url: rightPdfUrl } },
        metaData: { fileName: initiallyUploadedFiles[currentInitialFileIndex] }
      }, {
        defaultViewMode: "FIT_WIDTH",
        showDownloadPDF: false,
        showPrintPDF: false,
        showLeftHandPanel: false,
        showAnnotationTools: false,
        enableFormFilling: false
      }).then(adobeViewer => {
        // Store the viewer reference for navigation
        rightAdobeViewerRef.current = adobeViewer
      })
    } catch (error) {
      console.error('Error loading right Adobe PDF:', error)
    }
  }

  const goToPreviousInitialFile = () => {
    if (currentInitialFileIndex > 0) {
      setCurrentInitialFileIndex(currentInitialFileIndex - 1)
    }
  }

  const goToNextInitialFile = () => {
    if (currentInitialFileIndex < initiallyUploadedFiles.length - 1) {
      setCurrentInitialFileIndex(currentInitialFileIndex + 1)
    }
  }

  const goToPage = (pageNumber) => {
    if (adobeViewerRef.current) {
      adobeViewerRef.current.goToPage(pageNumber)
    }
  }

  const handleInsightsClick = () => {
    if (selectedText && selectedText.trim()) {
      // Insights are already generated when text is selected, just open the modal
      setIsInsightsModalOpen(true)
    }
  }

  const handleCloseInsightsModal = () => {
    setIsInsightsModalOpen(false)
  }

  // Show loading state
  if (processingStatus === 'idle' && uploadedFiles.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading files...</p>
        </div>
      </div>
    )
  }

  // Show message if no files are uploaded
  if (uploadedFiles.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No PDF files uploaded</h3>
          <p className="text-muted-foreground mb-4">
            Please upload some PDF files first to start analyzing them.
          </p>
          <Button onClick={() => window.location.href = '/'}>
            Go to Upload Page
          </Button>
        </div>
      </div>
    )
  }

  const currentInitialFile = initiallyUploadedFiles[currentInitialFileIndex]

  return (
    <div className="h-screen flex">
      {/* Left Part - 50% width */}
      <div className="w-1/2 flex flex-col border-r">
        {/* PDF Viewer - 65% of left part */}
        <div className="h-[65%] p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-1">
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Upload New File
              </Button>
              {newlyUploadedFile && (
                <span className="text-sm font-medium text-muted-foreground">
                  {newlyUploadedFile.name}
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          
          {newlyUploadedFile ? (
            <>
              {/* PDF Viewer */}
              <div className="h-full border rounded-lg overflow-hidden">
                <div id="adobe-dc-view" ref={pdfContainerRef} className="w-full h-full" />
                {!window.AdobeDC && (
                  <div className="flex items-center justify-center h-full bg-muted/50">
                    <div className="text-center">
                      <FileText className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        PDF viewer loading...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full border rounded-lg flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click "Upload New File" to view a PDF here
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Selected Text - 25% of left part */}
        <div className="h-[25%] p-4 mt-10">
          <div className="h-full border rounded-lg p-3 bg-muted/50 overflow-y-auto">
            {selectedText ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Selected Text</h3>
                  <Button
                    onClick={handleInsightsClick}
                    size="sm"
                    className="flex items-center gap-1 text-xs h-7"
                    disabled={insightsStatus === 'loading' || !selectedText}
                  >
                    {insightsStatus === 'loading' ? (
                      <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Lightbulb className="h-3 w-3" />
                    )}
                    {insightsStatus === 'loading' ? 'Generating...' : 'Insights'}
                  </Button>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedText}
                </div>
                {similaritySearchStatus === 'loading' && (
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    <div className="h-3 w-3 border border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>Processing text...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Select text in the PDF above to see it here
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Part - 50% width */}
      <div className="w-1/2 flex flex-col">
        {/* PDF Name and Navigation - Small Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 mr-2">
              <span className="text-sm font-medium truncate">
                {currentInitialFile}
              </span>
              {initiallyUploadedFiles.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  {currentInitialFileIndex + 1} of {initiallyUploadedFiles.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousInitialFile}
                disabled={currentInitialFileIndex === 0}
                className="flex items-center gap-1 text-xs h-7"
              >
                <ChevronLeft className="h-3 w-3" />
                Prev
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextInitialFile}
                disabled={currentInitialFileIndex >= initiallyUploadedFiles.length - 1}
                className="flex items-center gap-1 text-xs h-7"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* PDF Viewer - Fixed height like left side */}
        <div className="h-[65%] p-4">
          <div className="h-full border rounded-lg overflow-hidden">
            {initiallyUploadedFiles.length > 0 ? (
              <div id="right-adobe-dc-view" ref={rightPdfContainerRef} className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center h-full bg-muted/50">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No initially uploaded files to display
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ranked Sections - Flexible height (adjusts to remaining space) */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <RankedSections ref={ref} />
          </div>
        </div>
      </div>
      
      {/* Insights Modal */}
      <InsightsModal
        isOpen={isInsightsModalOpen}
        onClose={handleCloseInsightsModal}
        insights={insights}
        selectedText={selectedText}
        isLoading={insightsStatus === 'loading'}
      />
    </div>
  )
})

export default PDFViewer
