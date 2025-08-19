import React, { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { X, Lightbulb, Info, AlertTriangle, Play, Pause, Volume2 } from 'lucide-react'

const InsightsModal = ({ isOpen, onClose, insights, selectedText, isLoading }) => {
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [audioElement, setAudioElement] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const progressRef = useRef(null)
  
  // Reset card index when modal opens with new insights
  React.useEffect(() => {
    if (isOpen && insights) {
      setCurrentCardIndex(0)
    }
  }, [isOpen, insights])

  // Reset audio state when insights change (new text selected)
  React.useEffect(() => {
    if (insights) {
      // Clean up previous audio
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      
      // Reset audio states
      setAudioUrl(null)
      setAudioElement(null)
      setIsPlaying(false)
      setIsGeneratingAudio(false)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [insights])

  // Generate audio for podcast script
  const generateAudio = async (text) => {
    if (!text) return
    
    setIsGeneratingAudio(true)
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })
      
      if (response.ok) {
        const data = await response.json()
        const audioBlob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: 'audio/mp3' })
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
        
        // Create audio element
        const audio = new Audio(url)
        audio.onended = () => setIsPlaying(false)
        
        // Add time update listener
        audio.addEventListener('timeupdate', () => {
          setCurrentTime(audio.currentTime)
        })
        
        // Add loaded metadata listener
        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration)
        })
        
        setAudioElement(audio)
      }
    } catch (error) {
      console.error('Error generating audio:', error)
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  // Auto-generate audio when podcast script is available
  React.useEffect(() => {
    if (insights?.podcast_script && !audioUrl && !isGeneratingAudio) {
      generateAudio(insights.podcast_script)
    }
  }, [insights?.podcast_script, audioUrl, isGeneratingAudio])

  // Play/pause audio
  const toggleAudio = () => {
    if (!audioElement) return
    
    if (isPlaying) {
      audioElement.pause()
      setIsPlaying(false)
    } else {
      audioElement.play()
      setIsPlaying(true)
    }
  }

  // Format time to MM:SS
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Handle progress bar click
  const handleProgressClick = (e) => {
    if (!audioElement || !progressRef.current) return
    
    const rect = progressRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const width = rect.width
    const percentage = clickX / width
    const newTime = percentage * audioElement.duration
    
    audioElement.currentTime = newTime
    setCurrentTime(newTime)
  }

  // Cleanup audio when modal closes
  React.useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioElement, audioUrl])
  
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">AI Insights</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Generating insights...</p>
              </div>
            </div>
          ) : insights ? (
            <div className="space-y-6">
              {/* Selected Text */}
              {selectedText && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <h3 className="text-sm font-medium mb-2">Selected Text</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedText}
                  </p>
                </div>
              )}

                                            {/* Insights Cards - Horizontal with Navigation */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">AI Insights</h3>
                                         <div className="flex items-center gap-2">
                       <Button
                         variant={currentCardIndex === 0 ? "default" : "outline"}
                         size="sm"
                         onClick={() => setCurrentCardIndex(0)}
                         className="h-8 px-3"
                       >
                         Key Insights
                       </Button>
                       <Button
                         variant={currentCardIndex === 1 ? "default" : "outline"}
                         size="sm"
                         onClick={() => setCurrentCardIndex(1)}
                         className="h-8 px-3"
                       >
                         Did You Know
                       </Button>
                       <Button
                         variant={currentCardIndex === 2 ? "default" : "outline"}
                         size="sm"
                         onClick={() => setCurrentCardIndex(2)}
                         className="h-8 px-3"
                       >
                         Counterpoints
                       </Button>
                       <Button
                         variant={currentCardIndex === 3 ? "default" : "outline"}
                         size="sm"
                         onClick={() => setCurrentCardIndex(3)}
                         className="h-8 px-3"
                       >
                         Podcast
                       </Button>
                     </div>
                  </div>
                 
                 <div className="overflow-hidden">
                   <div 
                     className="flex transition-transform duration-300 ease-in-out"
                     style={{ transform: `translateX(-${currentCardIndex * 100}%)` }}
                   >
                     {/* Key Insights */}
                     <div className="w-full flex-shrink-0">
                       <Card className="p-6">
                         <div className="flex items-center gap-2 mb-4">
                           <Lightbulb className="h-6 w-6 text-yellow-600" />
                           <h3 className="font-semibold text-lg">Key Insights</h3>
                         </div>
                         <ul className="space-y-3">
                           {insights.key_insights?.map((insight, index) => (
                             <li key={index} className="text-sm text-muted-foreground leading-relaxed">
                               • {insight}
                             </li>
                           ))}
                         </ul>
                       </Card>
                     </div>

                     {/* Did You Know */}
                     <div className="w-full flex-shrink-0">
                       <Card className="p-6">
                         <div className="flex items-center gap-2 mb-4">
                           <Info className="h-6 w-6 text-blue-600" />
                           <h3 className="font-semibold text-lg">Did You Know</h3>
                         </div>
                         <ul className="space-y-3">
                           {insights.did_you_know?.map((fact, index) => (
                             <li key={index} className="text-sm text-muted-foreground leading-relaxed">
                               • {fact}
                             </li>
                           ))}
                         </ul>
                       </Card>
                     </div>

                                           {/* Counterpoints */}
                      <div className="w-full flex-shrink-0">
                        <Card className="p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="h-6 w-6 text-orange-600" />
                            <h3 className="font-semibold text-lg">Counterpoints</h3>
                          </div>
                          <ul className="space-y-3">
                            {insights.counterpoints?.map((counterpoint, index) => (
                              <li key={index} className="text-sm text-muted-foreground leading-relaxed">
                                • {counterpoint}
                              </li>
                            ))}
                          </ul>
                        </Card>
                      </div>

                      {/* Podcast */}
                      <div className="w-full flex-shrink-0">
                        <Card className="p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <Volume2 className="h-6 w-6 text-purple-600" />
                            <h3 className="font-semibold text-lg">Podcast</h3>
                          </div>
                                                     <div className="space-y-4">
                             {isGeneratingAudio ? (
                               <div className="flex items-center gap-3 mb-4">
                                 <Button
                                   disabled
                                   size="sm"
                                   className="flex items-center gap-2"
                                 >
                                   <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                   Generating Audio...
                                 </Button>
                               </div>
                             ) : audioUrl ? (
                               <div className="space-y-3 mb-4">
                                 {/* Audio Player */}
                                 <div className="bg-muted/30 rounded-lg p-4">
                                   <div className="flex items-center gap-3 mb-3">
                                     <Button
                                       onClick={toggleAudio}
                                       size="sm"
                                       className="flex items-center gap-2"
                                     >
                                       {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                       {isPlaying ? 'Pause' : 'Play'}
                                     </Button>
                                     <div className="text-sm text-muted-foreground">
                                       {formatTime(currentTime)} / {formatTime(duration)}
                                     </div>
                                   </div>
                                   
                                   {/* Progress Bar */}
                                   <div 
                                     ref={progressRef}
                                     className="w-full h-2 bg-muted rounded-full cursor-pointer relative"
                                     onClick={handleProgressClick}
                                   >
                                     <div 
                                       className="h-full bg-primary rounded-full transition-all duration-100"
                                       style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                     />
                                   </div>
                                 </div>
                               </div>
                             ) : null}
                             
                             <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                               {insights.podcast_script}
                             </div>
                           </div>
                        </Card>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No insights available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default InsightsModal
