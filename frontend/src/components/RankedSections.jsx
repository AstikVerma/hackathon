import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setCurrentPdfIndex } from '../store/slices/pdfSlice';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChevronLeft, ChevronRight, FileText, Hash, Eye } from 'lucide-react';

const RankedSections = forwardRef((props, ref) => {
  const dispatch = useDispatch();
  const { similarSections, currentPdfIndex, uploadedFiles, similaritySearchStatus } = useSelector((state) => state.pdf);
  
  // Use similarSections as rankedSections and manage currentSectionIndex locally
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const rankedSections = similarSections;
  const totalSections = rankedSections.length;

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentSectionIndex < totalSections - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
    }
  };

  const handleViewInPDF = () => {
    if (currentSection) {
      console.log('View in PDF clicked:', {
        documentName: currentSection.document || currentSection.filename,
        pageNumber: currentSection.page_number,
        sectionTitle: currentSection.section_title
      });
      
      // Find the index of the document in uploadedFiles
      const documentIndex = uploadedFiles.findIndex(file => 
        file === (currentSection.document || currentSection.filename)
      );
      
      console.log('Document index found:', documentIndex);
      console.log('Available files:', uploadedFiles);
      console.log('Ref available:', !!ref);
      console.log('Ref current available:', !!(ref && ref.current));
      
      if (documentIndex !== -1) {
        // Use the new function that handles both PDF switching and page navigation
        if (ref && ref.current && ref.current.switchPdfAndGoToPage) {
          console.log('Using switchPdfAndGoToPage function');
          ref.current.switchPdfAndGoToPage(documentIndex, currentSection.page_number);
        } else if (ref && ref.current && ref.current.goToPageInRightViewer) {
          // Fallback to old method if new function not available
          console.log('Using fallback goToPageInRightViewer function');
          setTimeout(() => {
            console.log('Executing navigation to page:', currentSection.page_number);
            ref.current.goToPageInRightViewer(currentSection.page_number);
          }, 2000);
        } else {
          console.error('PDFViewer ref or navigation functions not available');
          console.log('Ref:', ref);
          console.log('Ref current:', ref?.current);
        }
      } else {
        console.error('Document not found in uploadedFiles');
        console.log('Looking for:', currentSection.document || currentSection.filename);
        console.log('Available files:', uploadedFiles);
      }
    } else {
      console.warn('No current section available for View in PDF');
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'H1':
        return <Hash className="h-4 w-4 text-blue-600" />;
      case 'H2':
        return <Hash className="h-4 w-4 text-green-600" />;
      case 'H3':
        return <Hash className="h-4 w-4 text-orange-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  // Show loading state when similarity search is in progress
  if (similaritySearchStatus === 'loading') {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="text-center text-gray-500">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="font-medium">Searching for similar sections...</p>
            <p className="text-sm">
              Analyzing your selected text.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rankedSections || rankedSections.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="text-center text-gray-500">
            <p className="font-medium">No sections found</p>
            <p className="text-sm">
              Select text in the PDF to find similar sections.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentSection = rankedSections[currentSectionIndex];

  return (
    <div className="w-full">
      {/* Current Section Details */}
      {currentSection && (
        <div className="space-y-3">
          <div className="bg-gray-50 p-3 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">#{currentSection.importance_rank}</span>
                <span className="text-sm text-gray-500">{currentSection.document || currentSection.filename}</span>
                <span className="text-sm text-gray-500">Page: {currentSection.page_number}</span>
                <span className="text-sm text-gray-500">Match: {currentSection.similarity_score.toFixed(2)*100}%</span>
              </div>
              
              {/* Section Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={currentSectionIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentSectionIndex === totalSections - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewInPDF}
                  className="flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" />
                  View in PDF
                </Button>
              </div>
            </div>
          </div>
          
          {/* Content Display */}
          <div className="bg-white p-3 rounded-lg border">
            <div className="max-h-32 overflow-y-auto">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {currentSection.content || 'Content not available'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default RankedSections;
