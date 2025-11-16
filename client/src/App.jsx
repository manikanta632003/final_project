import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import Auth from './Auth';

function App() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [savedChats, setSavedChats] = useState([]);
  const [showSavedChats, setShowSavedChats] = useState(false);
  const [loadingSavedChats, setLoadingSavedChats] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputLanguage, setInputLanguage] = useState('en-US');
  const [voiceGender, setVoiceGender] = useState('female'); // 'male' or 'female'
  
  const fileInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const isListeningRef = useRef(false); // Track listening state for onend handler
  const fullTranscriptRef = useRef(''); // Track full transcript using ref
  const selectedFilesRef = useRef([]); // Track current selected files
  const filePreviewsRef = useRef([]); // Track current file previews
  
  // Language options for voice input and output
  const languages = {
    'en-US': { name: 'English (US)', code: 'en-US' },
    'en-IN': { name: 'English (India)', code: 'en-IN' },
    'hi-IN': { name: 'Hindi', code: 'hi-IN' },
    'kn-IN': { name: 'Kannada', code: 'kn-IN' },
    'te-IN': { name: 'Telugu', code: 'te-IN' },
    'ta-IN': { name: 'Tamil', code: 'ta-IN' },
    'mr-IN': { name: 'Marathi', code: 'mr-IN' },
    'gu-IN': { name: 'Gujarati', code: 'gu-IN' },
    'bn-IN': { name: 'Bengali', code: 'bn-IN' },
    'pa-IN': { name: 'Punjabi', code: 'pa-IN' }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        // Verify token is still valid
        axios.get('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(() => {
          setUser(userData);
        }).catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        });
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    
    // Initialize speech recognition immediately (don't wait for login)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    console.log('Checking Speech Recognition support...');
    console.log('window.SpeechRecognition:', window.SpeechRecognition);
    console.log('window.webkitSpeechRecognition:', window.webkitSpeechRecognition);
    console.log('Is Secure Context:', window.isSecureContext);
    console.log('Location:', window.location.hostname);
    
    if (SpeechRecognition) {
      console.log('✅ Speech Recognition API available - initializing...');
      setSpeechSupported(true);
      
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = inputLanguage;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          console.log('Voice recognition started');
          setIsListening(true);
          isListeningRef.current = true;
          fullTranscriptRef.current = '';
          setInput('');
        };

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
              fullTranscriptRef.current += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          const displayText = fullTranscriptRef.current + (interimTranscript ? interimTranscript : '');
          setInput(displayText);
          console.log('Transcript updated:', displayText);
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error, event);
          setIsListening(false);
          isListeningRef.current = false;
          
          if (event.error === 'not-allowed') {
            alert('Microphone permission denied. Please:\n1. Click the lock icon in your browser address bar\n2. Allow microphone access\n3. Refresh the page');
          } else if (event.error === 'no-speech') {
            console.log('No speech detected');
          } else if (event.error === 'audio-capture') {
            alert('No microphone found. Please connect a microphone.');
          } else if (event.error === 'network') {
            alert('⚠️ Network Error\n\nVoice input requires internet connection.');
          }
          setInput(prev => prev.replace(' [listening...]', '').trim());
        };

        recognition.onend = () => {
          console.log('Voice recognition ended. Transcript:', fullTranscriptRef.current);
          const transcript = fullTranscriptRef.current.trim();
          
          if (isListeningRef.current && transcript) {
            setIsListening(false);
            isListeningRef.current = false;
            setInput(transcript);
            
            // Auto-send after voice input
            setTimeout(() => {
              const userMessage = transcript;
              setInput('');
              
              const currentFiles = selectedFilesRef.current;
              const currentPreviews = filePreviewsRef.current;
              
              setMessages(prev => [...prev, {
                type: 'user',
                content: userMessage || (currentFiles.length > 0 ? `${currentFiles.length} file(s) uploaded` : ''),
                files: currentPreviews.map(p => p.preview || p.name)
              }]);

              setIsLoading(true);
              const requestId = `req-${Date.now()}-${Math.random()}`;
              setCurrentRequestId(requestId);
              abortControllerRef.current = new AbortController();

              const formData = new FormData();
              currentFiles.forEach(file => {
                formData.append('files', file);
              });
              
              if (userMessage) {
                formData.append('message', userMessage);
              }
              formData.append('sessionId', sessionId);
              formData.append('requestId', requestId);
              formData.append('language', inputLanguage); // Send input language

              axios.post('/api/chat', formData, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                },
                signal: abortControllerRef.current.signal,
              }).then(response => {
                const assistantMsg = {
                  type: 'assistant',
                  content: response.data.response,
                  suggestions: response.data.suggestions || []
                };
                setMessages(prev => [...prev, assistantMsg]);
                
                setTimeout(() => {
                  speakText(response.data.response);
                }, 500);
              }).catch(error => {
                if (error.name !== 'AbortError' && error.name !== 'CanceledError') {
                  if (error.response && error.response.status === 429) {
                    const retryAfter = error.response.data?.retryAfter || 60;
                    setMessages(prev => [...prev, {
                      type: 'assistant',
                      content: `⚠️ Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`
                    }]);
                  } else {
                    setMessages(prev => [...prev, {
                      type: 'assistant',
                      content: error.response?.data?.message || 'Sorry, I encountered an error. Please try again.'
                    }]);
                  }
                }
              }).finally(() => {
                setIsLoading(false);
                setCurrentRequestId(null);
                abortControllerRef.current = null;
                
                setSelectedFiles([]);
                setFilePreviews([]);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              });
            }, 500);
          } else if (isListeningRef.current && !transcript) {
            console.log('No speech detected, restarting...');
            setTimeout(() => {
              try {
                if (isListeningRef.current) {
                  recognition.start();
                }
              } catch (error) {
                console.error('Error restarting recognition:', error);
                setIsListening(false);
                isListeningRef.current = false;
              }
            }, 100);
          } else {
            setIsListening(false);
            isListeningRef.current = false;
          }
        };

        recognitionRef.current = recognition;
        console.log('✅ Speech recognition initialized successfully');
      } catch (error) {
        console.error('Failed to create SpeechRecognition:', error);
        setSpeechSupported(false);
      }
    } else {
      console.log('❌ Speech Recognition NOT available in this browser');
      setSpeechSupported(false);
    }
    
    // Initialize Speech Synthesis (Text-to-Speech)
    if ('speechSynthesis' in window) {
      speechSynthesisRef.current = window.speechSynthesis;
      console.log('Speech Synthesis (TTS) available');
      
      const loadVoices = () => {
        const voices = speechSynthesisRef.current.getVoices();
        console.log('Available voices:', voices.length);
      };
      
      if (speechSynthesisRef.current.onvoiceschanged !== undefined) {
        speechSynthesisRef.current.onvoiceschanged = loadVoices;
      }
      loadVoices();
    } else {
      console.warn('Speech Synthesis not supported in this browser');
    }
  }, [inputLanguage, sessionId]);

  useEffect(() => {
    if (!user) return;
    
    scrollToBottom();
    loadSavedChats();
    // Load chat from localStorage on mount
    const savedChat = localStorage.getItem(`chat_${sessionId}`);
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        setMessages(parsed.messages || []);
      } catch (e) {
        console.error('Error loading saved chat:', e);
      }
    }
  }, [user, sessionId]);

  // Keep refs in sync with state
  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
    filePreviewsRef.current = filePreviews;
  }, [selectedFiles, filePreviews]);

  // Save chat to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat_${sessionId}`, JSON.stringify({ messages, sessionId }));
    }
  }, [messages, sessionId]);

  const loadSavedChats = async () => {
    setLoadingSavedChats(true);
    try {
      const response = await axios.get('/api/chat/saved');
      console.log('Loaded saved chats:', response.data);
      if (Array.isArray(response.data)) {
        setSavedChats(response.data);
      } else {
        console.error('Invalid response format:', response.data);
        setSavedChats([]);
      }
    } catch (error) {
      console.error('Error loading saved chats:', error);
      setSavedChats([]);
      // Show user-friendly error message
      if (error.response) {
        console.error('Server error:', error.response.data);
      }
    } finally {
      setLoadingSavedChats(false);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    const newFiles = [...selectedFiles];
    const newPreviews = [...filePreviews];
    const imageFiles = [];

    files.forEach(file => {
      if (file.size > 20 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is 20MB.`);
        return;
      }

      newFiles.push(file);
      
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push({ file, preview: reader.result, type: 'image' });
          setFilePreviews([...newPreviews]);
        };
        reader.readAsDataURL(file);
      } else {
        newPreviews.push({ file, preview: null, type: 'file', name: file.name });
        setFilePreviews([...newPreviews]);
      }
    });

    setSelectedFiles(newFiles);

    // Auto-analyze if only images are uploaded without text
    if (imageFiles.length > 0 && !input.trim()) {
      // Wait a bit for previews to load, then auto-analyze
      setTimeout(() => {
        autoAnalyzeImages(imageFiles);
      }, 500);
    }
  };

  const autoAnalyzeImages = async (imageFiles) => {
    if (isLoading) return; // Don't auto-analyze if already processing
    
    // Wait a bit more for previews to be ready
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Get current previews
    const currentPreviews = filePreviewsRef.current;
    const imagePreviews = currentPreviews.filter(p => imageFiles.includes(p.file)).map(p => p.preview || p.name);
    
    // Add user message showing images were uploaded
    const userMessageObj = {
      type: 'user',
      content: `${imageFiles.length} image(s) uploaded`,
      files: imagePreviews
    };
    setMessages(prev => [...prev, userMessageObj]);

    setIsLoading(true);
    const requestId = `req-${Date.now()}-${Math.random()}`;
    setCurrentRequestId(requestId);
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      imageFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('message', 'Please analyze this image and provide a detailed description. Also suggest 3-5 questions I could ask about this image.');
      formData.append('sessionId', sessionId);
      formData.append('requestId', requestId);
      formData.append('autoAnalyze', 'true'); // Flag for auto-analysis
      formData.append('language', inputLanguage); // Send input language

      const response = await axios.post('/api/chat', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal: abortControllerRef.current.signal,
      });

      // Parse response to extract description and suggestions
      const responseText = response.data.response;
      const suggestions = response.data.suggestions || [];
      
      const assistantMsg = {
        type: 'assistant',
        content: responseText,
        suggestions: suggestions
      };
      
      setMessages(prev => [...prev, assistantMsg]);
      
      // Automatically speak the assistant's response
      setTimeout(() => {
        speakText(responseText);
      }, 500);

      // Clear file selection after auto-analysis
      setSelectedFiles([]);
      setFilePreviews([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      if (error.name !== 'AbortError' && error.name !== 'CanceledError') {
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: error.response?.data?.message || 'Sorry, I encountered an error analyzing the image. Please try again.'
        }]);
      }
    } finally {
      setIsLoading(false);
      setCurrentRequestId(null);
      abortControllerRef.current = null;
    }
  };

  const removeFile = (index) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = filePreviews.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setFilePreviews(newPreviews);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startCamera = async () => {
    try {
      console.log('🎥 Requesting camera access...');
      
      // First show the camera modal
      setShowCamera(true);
      
      // Small delay to ensure video element is rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Request camera stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      console.log('✅ Camera stream obtained');
      cameraStreamRef.current = stream;
      
      // Wait for video element to be available
      let attempts = 0;
      while (!cameraVideoRef.current && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!cameraVideoRef.current) {
        throw new Error('Video element not found');
      }
      
      console.log('✅ Video element found, attaching stream...');
      
      // Attach stream to video element
      cameraVideoRef.current.srcObject = stream;
      
      // Wait for metadata to load
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video loading timeout')), 5000);
        
        cameraVideoRef.current.onloadedmetadata = () => {
          clearTimeout(timeout);
          console.log('✅ Video metadata loaded');
          resolve();
        };
      });
      
      // Play the video
      await cameraVideoRef.current.play();
      
      console.log('✅ Camera ready and playing:', {
        width: cameraVideoRef.current.videoWidth,
        height: cameraVideoRef.current.videoHeight,
        readyState: cameraVideoRef.current.readyState
      });
      
    } catch (error) {
      console.error('❌ Camera error:', error);
      setShowCamera(false);
      
      if (error.name === 'NotAllowedError') {
        alert('❌ Camera Access Denied\n\nPlease:\n1. Click the camera icon 🎥 in your browser address bar\n2. Allow camera permission\n3. Refresh the page and try again');
      } else if (error.name === 'NotFoundError') {
        alert('❌ No camera found on this device.');
      } else if (error.message === 'Video loading timeout') {
        alert('⏱️ Camera timeout. Please check if:\n1. Your camera is working\n2. No other app is using the camera\n3. Try refreshing the page');
      } else {
        alert('❌ Camera Error: ' + error.message);
      }
      
      // Clean up stream if error occurred
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    const video = cameraVideoRef.current;
    
    if (!video) {
      alert('Camera not available.');
      return;
    }
    
    // Use actual dimensions or default to 1280x720 (as per memory guidance)
    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;
    
    console.log('📸 Capturing from video:', {
      actualWidth: video.videoWidth,
      actualHeight: video.videoHeight,
      usingWidth: videoWidth,
      usingHeight: videoHeight,
      readyState: video.readyState
    });
    
    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Draw the current video frame
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    
    console.log('✅ Photo captured successfully');
    
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Failed to capture photo. Please try again.');
        return;
      }
      
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const newFiles = [...selectedFiles, file];
      setSelectedFiles(newFiles);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const newPreviews = [...filePreviews, { file, preview: reader.result, type: 'image' }];
        setFilePreviews(newPreviews);
        
        console.log('✅ Analyzing photo...');
        
        // Auto-analyze immediately - no delay
        autoAnalyzeImages([file]);
      };
      reader.readAsDataURL(file);
      
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  const stopRequest = async () => {
    if (currentRequestId && abortControllerRef.current) {
      abortControllerRef.current.abort();
      try {
        await axios.post('/api/chat/cancel', { requestId: currentRequestId });
      } catch (e) {
        console.error('Error cancelling request:', e);
      }
      setIsLoading(false);
      setCurrentRequestId(null);
    }
  };

  // Text-to-Speech function
  const speakText = (text) => {
    if (!speechSynthesisRef.current) {
      console.warn('Speech Synthesis not available');
      return;
    }

    // Stop any ongoing speech
    stopSpeaking();

    // Clean text - remove markdown and special characters for better speech
    const cleanText = text
      .replace(/\[RESPOND IN .*?\]\s*/g, '') // Remove language instructions (new format)
      .replace(/\[You must.*?\]\s*/g, '') // Remove language instructions (old format)
      .replace(/[#*_`]/g, '') // Remove markdown
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .trim();

    if (!cleanText) {
      console.warn('No text to speak');
      return;
    }

    console.log('Speaking text in language:', inputLanguage);
    console.log('Text to speak:', cleanText.substring(0, 100) + '...');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = inputLanguage; // Use inputLanguage instead of outputLanguage for consistency
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Get available voices and try to find a matching one
    const voices = speechSynthesisRef.current.getVoices();
    console.log('Total available voices:', voices.length);
    
    const langCode = inputLanguage.split('-')[0]; // Get language code (e.g., 'hi' from 'hi-IN')
    
    // Filter voices by language
    const langVoices = voices.filter(voice => 
      voice.lang.toLowerCase().startsWith(langCode.toLowerCase()) ||
      voice.lang.toLowerCase().includes(langCode.toLowerCase())
    );
    
    console.log(`Voices for ${langCode}:`, langVoices.length, langVoices.map(v => v.name));
    
    // Filter by gender preference
    // Voice names often contain gender indicators
    const genderKeywords = {
      female: ['female', 'woman', 'woman', 'zira', 'samantha', 'karen', 'veena', 'lekha', 'swara'],
      male: ['male', 'man', 'david', 'mark', 'richard', 'ravi', 'hemant', 'kumar']
    };
    
    let preferredVoice = null;
    
    // First try to find voice matching both language and gender
    preferredVoice = langVoices.find(voice => {
      const nameLower = voice.name.toLowerCase();
      return genderKeywords[voiceGender].some(keyword => nameLower.includes(keyword));
    });
    
    // If no gender match, try any voice in the language
    if (!preferredVoice && langVoices.length > 0) {
      preferredVoice = langVoices[0];
      console.log('Using first available voice for language');
    }
    
    // Fallback to any voice if no language match
    if (!preferredVoice && voices.length > 0) {
      console.warn(`No ${langCode} voice found, trying gender preference from all voices`);
      // Try to find by gender in all voices
      preferredVoice = voices.find(voice => {
        const nameLower = voice.name.toLowerCase();
        return genderKeywords[voiceGender].some(keyword => nameLower.includes(keyword));
      });
      
      // Last resort: use default voice
      if (!preferredVoice) {
        preferredVoice = voices[0];
        console.warn('Using default voice');
      }
    }
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log('✅ Using voice:', preferredVoice.name, '| Language:', preferredVoice.lang, '| Gender:', voiceGender);
    } else {
      console.error('❌ No voice found for language:', inputLanguage);
      console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
    }

    utterance.onstart = () => {
      console.log('🔊 Speech started');
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      console.log('✅ Speech ended');
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('❌ Speech synthesis error:', event);
      setIsSpeaking(false);
    };

    speechSynthesisRef.current.speak(utterance);
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  // Update recognition language when inputLanguage changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = inputLanguage;
      console.log('Updated recognition language to:', inputLanguage);
    }
    
    // Clear chat when language changes to reset the AI's language context
    if (messages.length > 0) {
      const confirmed = window.confirm('Language changed! Would you like to start a new conversation? (Recommended to ensure correct language response)');
      if (confirmed) {
        setMessages([]);
        localStorage.removeItem(`chat_${sessionId}`);
        console.log('Chat cleared due to language change');
      }
    }
  }, [inputLanguage]);

  const startVoiceInput = async () => {
    if (!speechSupported) {
      alert('Voice input is not supported in this browser.\n\nPlease use:\n- Google Chrome\n- Microsoft Edge\n- Safari\n\nFirefox has limited support.');
      return;
    }

    // Check if we're in a secure context
    const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isSecure) {
      alert('⚠️ Voice input requires a secure connection!\n\nPlease access this app via:\n- https:// (secure)\n- localhost\n- 127.0.0.1');
      return;
    }

    // Check network connectivity
    if (!navigator.onLine) {
      alert('⚠️ No Internet Connection\n\nVoice input requires an internet connection because speech recognition is processed on remote servers.\n\nPlease:\n1. Check your internet connection\n2. Make sure you\'re connected to WiFi or mobile data\n3. Try again');
      return;
    }

    // Check microphone permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop the test stream
      console.log('Microphone access granted');
    } catch (error) {
      console.error('Microphone permission error:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('🎤 Microphone Access Required\n\nPlease grant microphone permission:\n\n1. Click the 🔒 lock/camera icon in the address bar\n2. Find "Microphone" and set it to "Allow"\n3. Refresh the page (F5)\n4. Try again\n\nIf you don\'t see the option, you may have permanently blocked it. To reset:\n- Chrome: Settings → Privacy → Site Settings → Microphone\n- Edge: Settings → Cookies and site permissions → Microphone');
        return;
      } else if (error.name === 'NotFoundError') {
        alert('⚠️ No Microphone Found\n\nPlease:\n1. Connect a microphone\n2. Check system settings\n3. Try again');
        return;
      }
    }

    if (recognitionRef.current && !isListening) {
      try {
        console.log('Starting voice recognition...');
        recognitionRef.current.lang = inputLanguage; // Update language
        fullTranscriptRef.current = ''; // Reset transcript
        setInput(''); // Clear input field
        recognitionRef.current.start();
      } catch (error) {
        console.error('Error starting voice recognition:', error);
        if (error.message && error.message.includes('already started')) {
          // Already started, ignore
          console.log('Recognition already started');
        } else {
          alert('Could not start voice recognition.\n\nPossible reasons:\n- Browser not fully supported\n- Microphone not available\n\nCheck the browser console (F12) for more details.');
        }
      }
    } else {
      if (!recognitionRef.current) {
        console.error('Recognition not initialized');
        alert('Voice recognition is not available. Please refresh the page.');
      } else if (isListening) {
        console.log('Already listening');
      }
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current && isListening) {
      console.log('Stopping voice recognition...');
      isListeningRef.current = false; // Set this first to prevent auto-restart
      setIsListening(false);
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
      // Keep the transcript in the input field so user can edit it
      const finalText = fullTranscriptRef.current.trim();
      setInput(finalText);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() && selectedFiles.length === 0) return;

    const userMessage = input.trim();
    setInput('');
    
    // Add user message to chat
    const userMessageObj = {
      type: 'user',
      content: userMessage || (selectedFiles.length > 0 ? `${selectedFiles.length} file(s) uploaded` : ''),
      files: filePreviews.map(p => p.preview || p.name)
    };
    
    setMessages(prev => [...prev, userMessageObj]);

    setIsLoading(true);
    const requestId = `req-${Date.now()}-${Math.random()}`;
    setCurrentRequestId(requestId);
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      
      // Append all files
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      
      if (userMessage) {
        formData.append('message', userMessage);
      }
      formData.append('sessionId', sessionId);
      formData.append('requestId', requestId);
      formData.append('language', inputLanguage); // Send input language

      const response = await axios.post('/api/chat', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal: abortControllerRef.current.signal,
      });

      const assistantMessage = {
        type: 'assistant',
        content: response.data.response,
        suggestions: response.data.suggestions || []
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Automatically speak the assistant's response
      setTimeout(() => {
        speakText(response.data.response);
      }, 500);

      // Clear file selection
      setSelectedFiles([]);
      setFilePreviews([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'CanceledError') {
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: 'Request cancelled.'
        }]);
      } else if (error.response && error.response.status === 429) {
        // Rate limit error
        const retryAfter = error.response.data?.retryAfter || 60;
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: `⚠️ Rate limit exceeded. Too many requests. Please wait ${retryAfter} seconds before trying again. The free tier has limits on requests per minute.`
        }]);
      } else {
        console.error('Error:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Sorry, I encountered an error. Please try again.';
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: errorMessage
        }]);
      }
    } finally {
      setIsLoading(false);
      setCurrentRequestId(null);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const saveChat = async () => {
    const chatName = prompt('Enter a name for this chat:');
    if (!chatName) return;

    try {
      await axios.post('/api/chat/save', {
        sessionId,
        chatName
      });
      alert('Chat saved successfully!');
      loadSavedChats();
    } catch (error) {
      alert('Error saving chat: ' + error.message);
    }
  };

  const loadChat = async (filename) => {
    try {
      const response = await axios.get(`/api/chat/load/${filename}`);
      setMessages(response.data.messages || []);
      setShowSavedChats(false);
      alert('Chat loaded successfully!');
    } catch (error) {
      alert('Error loading chat: ' + error.message);
    }
  };

  const generateReport = async (format = 'pdf') => {
    if (messages.length === 0) {
      alert('No conversation to generate report from.');
      return;
    }

    const reportTitle = prompt('Enter report title:', 'AI Chat Report');
    if (!reportTitle) return;

    // Combine all messages into report content
    const reportContent = messages.map(msg => {
      if (msg.type === 'user') {
        return `User: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    }).join('\n\n');

    try {
      const response = await axios.post('/api/generate-report', {
        content: reportContent,
        title: reportTitle,
        format,
        sessionId
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportTitle.replace(/[^a-z0-9]/gi, '_')}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Error generating report: ' + error.message);
    }
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear this chat?')) {
      setMessages([]);
      localStorage.removeItem(`chat_${sessionId}`);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setMessages([]);
  };

  // Show auth page if not logged in
  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-top">
            <h1>🤖 AI Image Recognition Chatbot</h1>
            <div className="header-actions">
              <span className="user-info">👤 {user.username}</span>
              <button onClick={() => {
                setShowSavedChats(!showSavedChats);
                if (!showSavedChats) {
                  loadSavedChats(); // Reload when opening
                }
              }} className="icon-button" title="Saved Chats">
                💾
              </button>
              <button onClick={saveChat} className="icon-button" title="Save Chat">
                💾
              </button>
              <button onClick={clearChat} className="icon-button" title="Clear Chat">
                🗑️
              </button>
              <button onClick={handleLogout} className="icon-button" title="Logout">
                🚪
              </button>
            </div>
          </div>
          <p>Upload images/files, ask questions, or use camera to capture images!</p>
          {!speechSupported && (
            <div style={{padding: '8px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', marginTop: '8px', fontSize: '13px'}}>
              ⚠️ Voice input not supported. Use Chrome, Edge, or Safari.
            </div>
          )}
          {speechSupported && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
            <div style={{padding: '8px', background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', marginTop: '8px', fontSize: '13px'}}>
              ⚠️ Voice input requires HTTPS. Access via https:// or localhost
            </div>
          )}
          <div className="language-controls">
            <div className="language-selector">
              <label>Language (Input & Output):</label>
              <select 
                value={inputLanguage} 
                onChange={(e) => setInputLanguage(e.target.value)}
                className="language-select"
              >
                {Object.entries(languages).map(([code, lang]) => (
                  <option key={code} value={code}>{lang.name}</option>
                ))}
              </select>
            </div>
            <div className="language-selector">
              <label>Voice Gender:</label>
              <select 
                value={voiceGender} 
                onChange={(e) => setVoiceGender(e.target.value)}
                className="language-select"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            {isSpeaking && (
              <button onClick={stopSpeaking} className="stop-voice-button" title="Stop Voice">
                ⏹ Stop Voice
              </button>
            )}
          </div>
        </div>

        {showSavedChats && (
          <div className="saved-chats-panel">
            <div className="saved-chats-header">
              <h3>Saved Chats</h3>
              <button onClick={() => setShowSavedChats(false)}>✕</button>
            </div>
            <div className="saved-chats-list">
              {loadingSavedChats ? (
                <div className="loading-chats">
                  <p>Loading saved chats...</p>
                </div>
              ) : savedChats.length === 0 ? (
                <div className="no-saved-chats">
                  <p>No saved chats yet</p>
                  <p className="no-chats-hint">Save your conversations using the 💾 button</p>
                </div>
              ) : (
                savedChats.map((chat, index) => (
                  <div key={index} className="saved-chat-item" onClick={() => loadChat(chat.filename)}>
                    <div className="saved-chat-name">{chat.chatName || 'Unnamed Chat'}</div>
                    <div className="saved-chat-meta">
                      {chat.messageCount || 0} messages • {chat.savedAt ? new Date(chat.savedAt).toLocaleDateString() : 'Unknown date'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {showCamera && (
          <div className="camera-modal">
            <div className="camera-container">
              <video ref={cameraVideoRef} autoPlay playsInline className="camera-video"></video>
              <div className="camera-controls">
                <button 
                  onClick={capturePhoto} 
                  className="capture-button"
                  title="Take photo"
                >
                  📷 Capture
                </button>
                <button onClick={stopCamera} className="close-button">✕ Close</button>
              </div>
            </div>
          </div>
        )}

        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <div className="welcome-icon">👋</div>
              <h2>Welcome!</h2>
              <p>Upload images/files, use camera, or start a conversation. I can analyze multiple files and answer your questions. Click 🎤 for voice input!</p>
            </div>
          )}
          
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.type}`}>
              {msg.files && msg.files.length > 0 && (
                <div className="message-files">
                  {msg.files.map((file, fileIndex) => (
                    file && typeof file === 'string' && file.startsWith('data:') ? (
                      <div key={fileIndex} className="message-file">
                        <img src={file} alt="Uploaded" />
                      </div>
                    ) : (
                      <div key={fileIndex} className="message-file file-icon">
                        📄 {file}
                      </div>
                    )
                  ))}
                </div>
              )}
              <div className="message-content">
                <div className="message-text-wrapper">
                  {msg.content && <p>{msg.content}</p>}
                  {msg.type === 'assistant' && msg.content && (
                    <button
                      className="speak-button"
                      onClick={() => speakText(msg.content)}
                      title="Speak this message"
                    >
                      🔊
                    </button>
                  )}
                </div>
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="suggestions">
                    <p className="suggestions-title">💡 Suggested Questions:</p>
                    {msg.suggestions.map((suggestion, sugIndex) => (
                      <button
                        key={sugIndex}
                        className="suggestion-button"
                        onClick={() => setInput(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message assistant loading">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <button onClick={stopRequest} className="stop-button">⏹ Stop</button>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          {filePreviews.length > 0 && (
            <div className="files-preview">
              {filePreviews.map((preview, index) => (
                <div key={index} className="file-preview-item">
                  {preview.type === 'image' && preview.preview ? (
                    <img src={preview.preview} alt="Preview" />
                  ) : (
                    <div className="file-icon-preview">📄 {preview.name}</div>
                  )}
                  <button onClick={() => removeFile(index)} className="remove-file">×</button>
                </div>
              ))}
            </div>
          )}
          
          <div className="input-wrapper">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label htmlFor="file-upload" className="upload-button" title="Upload Files">
              📁
            </label>
            <button onClick={startCamera} className="camera-button" title="Camera">
              📷
            </button>
            <button
              onClick={isListening ? stopVoiceInput : startVoiceInput}
              className={`voice-button ${isListening ? 'listening' : ''} ${!speechSupported ? 'disabled' : ''}`}
              title={!speechSupported ? 'Voice input not supported in this browser. Use Chrome, Edge, or Safari.' : (isListening ? 'Stop Recording' : 'Voice Input')}
              disabled={!speechSupported}
            >
              {isListening ? '🔴' : '🎤'}
            </button>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={speechSupported ? "Type your message, upload files, use camera, or click 🎤 for voice..." : "Type your message, upload files, or use camera..."}
              rows="1"
              className="message-input"
            />
            
            <button
              onClick={sendMessage}
              disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
              className="send-button"
            >
              {isLoading ? '⏳' : '➤'}
            </button>
          </div>

          <div className="report-actions">
            <button onClick={() => generateReport('pdf')} className="report-button">
              📄 Generate PDF Report
            </button>
            <button onClick={() => generateReport('docx')} className="report-button">
              📝 Generate Word Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
