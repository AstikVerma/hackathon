import { configureStore } from '@reduxjs/toolkit'
import pdfReducer from './slices/pdfSlice'

export const store = configureStore({
  reducer: {
    pdf: pdfReducer,
  },
})
