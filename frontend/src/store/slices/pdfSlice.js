import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'

const initialState = {
  uploadedFiles: [],
  processingStatus: 'idle', // 'idle', 'processing', 'completed', 'error'
  similarSections: [],
  selectedText: '',
  currentPdfIndex: 0,
  similaritySearchStatus: 'idle', // 'idle', 'loading', 'completed', 'error'
  insightsStatus: 'idle', // 'idle', 'loading', 'completed', 'error'
  insights: null,
  processingProgress: {
    is_processing: false,
    total_files: 0,
    processed_files: 0,
    current_file: '',
    status: 'idle',
    percentage: 0
  },
  error: null
}

// Async thunks
export const uploadFiles = createAsyncThunk(
  'pdf/uploadFiles',
  async (files) => {
    const formData = new FormData()
    Array.from(files).forEach(file => {
      formData.append('files', file)
    })

    const response = await axios.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  }
)

export const processFiles = createAsyncThunk(
  'pdf/processFiles',
  async (_, { getState }) => {
    const response = await axios.post('/api/process')
    return response.data
  }
)

export const findSimilarSections = createAsyncThunk(
  'pdf/findSimilarSections',
  async ({ selectedText }) => {
    const response = await axios.post('/api/similarity', {
      selected_text: selectedText
    })
    return response.data
  }
)

export const generateInsights = createAsyncThunk(
  'pdf/generateInsights',
  async ({ selectedText }) => {
    const response = await axios.post('/api/insights', {
      selected_text: selectedText
    })
    return response.data
  }
)

export const getStatus = createAsyncThunk(
  'pdf/getStatus',
  async () => {
    const response = await axios.get('/api/status')
    return response.data
  }
)

export const getProgress = createAsyncThunk(
  'pdf/getProgress',
  async () => {
    const response = await axios.get('/api/progress')
    return response.data
  }
)

const pdfSlice = createSlice({
  name: 'pdf',
  initialState,
  reducers: {
    setSelectedText: (state, action) => {
      state.selectedText = action.payload
    },
    setCurrentPdfIndex: (state, action) => {
      state.currentPdfIndex = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
    resetState: (state) => {
      return initialState
    },
    clearInsights: (state) => {
      state.insights = null
      state.insightsStatus = 'idle'
    }
  },
  extraReducers: (builder) => {
    builder
      // Upload files
      .addCase(uploadFiles.pending, (state) => {
        state.processingStatus = 'processing'
        state.error = null
      })
      .addCase(uploadFiles.fulfilled, (state, action) => {
        state.processingStatus = 'completed'
        state.uploadedFiles = action.payload.files || []
      })
      .addCase(uploadFiles.rejected, (state, action) => {
        state.processingStatus = 'error'
        state.error = action.error.message
      })
      
      // Process files
      .addCase(processFiles.pending, (state) => {
        state.processingStatus = 'processing'
        state.error = null
      })
      .addCase(processFiles.fulfilled, (state, action) => {
        state.processingStatus = 'completed'
      })
      .addCase(processFiles.rejected, (state, action) => {
        state.processingStatus = 'error'
        state.error = action.error.message
      })
      
      // Find similar sections
      .addCase(findSimilarSections.pending, (state) => {
        state.similaritySearchStatus = 'loading'
        state.error = null
      })
      .addCase(findSimilarSections.fulfilled, (state, action) => {
        state.similarSections = action.payload.similar_sections || []
        state.similaritySearchStatus = 'completed'
      })
      .addCase(findSimilarSections.rejected, (state, action) => {
        state.similaritySearchStatus = 'error'
        state.error = action.error.message
      })
      
      // Generate insights
      .addCase(generateInsights.pending, (state) => {
        state.insightsStatus = 'loading'
        state.error = null
      })
      .addCase(generateInsights.fulfilled, (state, action) => {
        state.insights = action.payload.insights
        state.insightsStatus = 'completed'
      })
      .addCase(generateInsights.rejected, (state, action) => {
        state.insightsStatus = 'error'
        state.error = action.error.message
      })
      
      // Get status
      .addCase(getStatus.fulfilled, (state, action) => {
        state.uploadedFiles = action.payload.pdf_files || []
        state.processingStatus = action.payload.is_processed ? 'completed' : 'idle'
      })
      
      // Get progress
      .addCase(getProgress.fulfilled, (state, action) => {
        state.processingProgress = {
          is_processing: action.payload.is_processing,
          total_files: action.payload.total_files,
          processed_files: action.payload.processed_files,
          current_file: action.payload.current_file,
          status: action.payload.status,
          percentage: action.payload.percentage
        }
      })
  }
})

export const { setSelectedText, setCurrentPdfIndex, clearError, resetState, clearInsights } = pdfSlice.actions
export default pdfSlice.reducer
