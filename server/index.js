const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for multiple file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit per file
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, and documents
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype && (
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'text/plain'
    );
    
    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image, PDF, and document files are allowed!'));
    }
  }
});

// Store conversation history per session
const conversations = new Map();
// Store active requests for cancellation
const activeRequests = new Map();

// User storage (in production, use a proper database)
const USERS_FILE = 'users.json';

// Load users from file
function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) {
      return [];
    }
  }
  return [];
}

// Save users to file
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// JWT secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Validate Google email domain
function isValidGoogleEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  const googleDomains = ['gmail.com', 'googlemail.com', 'google.com'];
  return googleDomains.includes(domain);
}

// Helper function to convert file to base64
function fileToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString('base64');
}

// Helper function to get mime type
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Helper to check if file is an image
function isImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
}

// Helper to extract text from PDF (simplified - for production use a proper PDF parser)
async function extractTextFromPDF(filePath) {
  // For now, return a placeholder - in production, use pdf-parse or similar
  return '[PDF content - text extraction requires additional library]';
}

// Chat endpoint with multiple file support
app.post('/api/chat', upload.array('files', 10), async (req, res) => {
  const requestId = req.body.requestId || `req-${Date.now()}`;
  
  try {
    const { message, sessionId, autoAnalyze, language } = req.body;
    const files = req.files || [];

    if (!message && files.length === 0) {
      return res.status(400).json({ error: 'Message or files are required' });
    }

    // Get or create model instance
    // Using gemini-2.0-flash which supports vision and is available on free tier
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Initialize conversation history if new session
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
    }

    const conversationHistory = conversations.get(sessionId);

    // Map language codes to full language names
    const languageMap = {
      'en-US': 'English',
      'en-IN': 'English',
      'hi-IN': 'Hindi',
      'kn-IN': 'Kannada',
      'te-IN': 'Telugu',
      'ta-IN': 'Tamil',
      'mr-IN': 'Marathi',
      'gu-IN': 'Gujarati',
      'bn-IN': 'Bengali',
      'pa-IN': 'Punjabi'
    };

    const targetLanguage = language && languageMap[language] ? languageMap[language] : 'English';
    
    console.log(`Request language: ${language}, Target language: ${targetLanguage}`);

    // Prepare user parts for Gemini with language instruction
    let userMessage = message || 'Please analyze these files.';
    
    // Add strong language instruction if not English - ALWAYS add it to ensure correct language
    if (targetLanguage !== 'English') {
      userMessage = `[RESPOND IN ${targetLanguage} ONLY - NOT ENGLISH] ${userMessage}`;
    }
    
    const userParts = [{ text: userMessage }];

    // Process all uploaded files
    const fileCleanup = [];
    for (const file of files) {
      const filePath = file.path;
      fileCleanup.push(filePath);

      if (isImage(filePath)) {
        // Handle images
        const base64Image = fileToBase64(filePath);
        const mimeType = getMimeType(filePath);
        
        userParts.push({
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        });
      } else if (filePath.endsWith('.pdf')) {
        // For PDFs, we'll need to extract text or use Gemini's PDF support
        // For now, add as base64
        const base64Pdf = fileToBase64(filePath);
        userParts.push({
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf'
          }
        });
      } else {
        // For text files, read content
        try {
          const textContent = fs.readFileSync(filePath, 'utf-8');
          userParts.push({ text: `\n[File: ${file.originalname}]\n${textContent}` });
        } catch (err) {
          userParts.push({ text: `\n[File: ${file.originalname} - could not read]` });
        }
      }
    }

    // Build conversation history for Gemini
    let geminiHistory = conversationHistory.map(msg => {
      if (msg.role === 'user') {
        return { role: 'user', parts: msg.parts };
      } else {
        return { role: 'model', parts: msg.parts };
      }
    });

    // Add language instruction at the beginning of EVERY session if not English
    // This ensures the AI always knows what language to use
    if (targetLanguage !== 'English') {
      // Add primer messages at the start (won't be saved to conversationHistory)
      geminiHistory = [
        {
          role: 'user',
          parts: [{ text: `You must ALWAYS respond in ${targetLanguage} language. NEVER use English.` }]
        },
        {
          role: 'model',
          parts: [{ text: `I will respond only in ${targetLanguage}.` }]
        },
        ...geminiHistory
      ];
    }

    // Start or continue chat with history
    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.7,
      },
    });

    // Store request for potential cancellation
    activeRequests.set(requestId, { chat, cancelled: false });

    // Send the message with retry logic for rate limits
    let result;
    let retries = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    while (retries <= maxRetries) {
      try {
        result = await chat.sendMessage(userParts);
        break; // Success, exit retry loop
      } catch (error) {
        // Check if it's a rate limit error (429)
        if (error.status === 429 && retries < maxRetries) {
          retries++;
          const delay = baseDelay * Math.pow(2, retries - 1); // Exponential backoff: 1s, 2s, 4s
          console.log(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // Re-throw if not a rate limit error or max retries reached
          throw error;
        }
      }
    }
    
    // Check if request was cancelled
    if (activeRequests.get(requestId)?.cancelled) {
      activeRequests.delete(requestId);
      // Clean up files
      fileCleanup.forEach(filePath => {
        setTimeout(() => {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, 1000);
      });
      return res.status(499).json({ error: 'Request cancelled' });
    }

    const response = await result.response;
    let assistantMessage = response.text();
    let suggestions = [];

    // If auto-analyzing, extract suggestions from response
    if (autoAnalyze === 'true') {
      // Try to extract suggestions from the response
      // Look for patterns like "Questions:" or numbered lists
      const suggestionPatterns = [
        /(?:Suggested questions?|Questions? you can ask|You might ask|Try asking):?\s*\n?([\s\S]*?)(?:\n\n|$)/i,
        /(\d+[\.\)]\s*[^\n]+(?:\n\d+[\.\)]\s*[^\n]+)*)/g
      ];
      
      // Try to find suggestions in the response
      for (const pattern of suggestionPatterns) {
        const matches = assistantMessage.match(pattern);
        if (matches) {
          // Extract individual questions
          const questionLines = matches[0].split(/\n/).filter(line => {
            return line.trim().match(/^(\d+[\.\)]|\-|\*)\s*.+$/);
          });
          
          if (questionLines.length > 0) {
            suggestions = questionLines.slice(0, 5).map(q => {
              return q.replace(/^(\d+[\.\)]|\-|\*)\s*/, '').trim();
            }).filter(q => q.length > 0);
            
            // Remove suggestions from main message if found
            if (suggestions.length > 0) {
              assistantMessage = assistantMessage.replace(pattern, '').trim();
            }
          }
        }
      }
      
      // If no structured suggestions found, generate them separately
      if (suggestions.length === 0) {
        try {
          const suggestionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          const suggestionPrompt = targetLanguage !== 'English'
            ? `Based on this image analysis: "${assistantMessage.substring(0, 500)}", generate exactly 3-5 short, specific questions a user might ask about this image. Return only the questions in ${targetLanguage} language, one per line, without numbering or bullets.`
            : `Based on this image analysis: "${assistantMessage.substring(0, 500)}", generate exactly 3-5 short, specific questions a user might ask about this image. Return only the questions, one per line, without numbering or bullets.`;
          const suggestionResult = await suggestionModel.generateContent(suggestionPrompt);
          const suggestionText = suggestionResult.response.text();
          suggestions = suggestionText.split('\n')
            .map(q => q.trim())
            .filter(q => q.length > 0 && !q.match(/^(question|suggestion|you can|try)/i))
            .slice(0, 5);
        } catch (err) {
          console.error('Error generating suggestions:', err);
        }
      }
    }

    // Update conversation history
    conversationHistory.push({
      role: 'user',
      parts: userParts
    });
    conversationHistory.push({
      role: 'model',
      parts: [{ text: assistantMessage }]
    });

    // Keep conversation history manageable (last 30 messages)
    if (conversationHistory.length > 30) {
      conversationHistory.splice(0, conversationHistory.length - 30);
    }

    activeRequests.delete(requestId);

    // Clean up uploaded files after processing
    fileCleanup.forEach(filePath => {
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });

    res.json({
      response: assistantMessage,
      suggestions: suggestions,
      sessionId: sessionId
    });

  } catch (error) {
    activeRequests.delete(requestId);
    console.error('Error:', error);
    
    // Handle specific error types
    if (error.status === 429) {
      console.error('\n⚠️  Rate limit exceeded (429). Please wait before making more requests.');
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait a moment and try again. The free tier has limits on requests per minute.',
        retryAfter: 60 // Suggest waiting 60 seconds
      });
    }
    
    if (error.message && error.message.includes('not found')) {
      console.error('\n⚠️  Model not found. Try these alternatives:');
      console.error('   - gemini-2.0-flash (current)');
      console.error('   - gemini-2.5-flash');
      console.error('   - gemini-2.0-flash-lite');
      console.error('   - gemini-2.5-pro');
    }
    
    res.status(error.status || 500).json({ 
      error: 'Failed to process request',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Cancel request endpoint
app.post('/api/chat/cancel', (req, res) => {
  const { requestId } = req.body;
  if (requestId && activeRequests.has(requestId)) {
    activeRequests.get(requestId).cancelled = true;
    activeRequests.delete(requestId);
    res.json({ success: true, message: 'Request cancelled' });
  } else {
    res.json({ success: false, message: 'Request not found' });
  }
});

// Generate report endpoint
app.post('/api/generate-report', async (req, res) => {
  try {
    const { content, title, format, sessionId } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const reportTitle = title || 'AI Generated Report';
    const reportFormat = format || 'pdf';

    if (reportFormat === 'pdf') {
      // Generate PDF
      const doc = new PDFDocument();
      const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
      const filePath = path.join('uploads', filename);

      // Ensure uploads directory exists
      if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads');
      }

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(20).text(reportTitle, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12);
      
      // Split content into paragraphs and add
      const paragraphs = content.split('\n\n');
      paragraphs.forEach(para => {
        if (para.trim()) {
          doc.text(para.trim());
          doc.moveDown();
        }
      });

      doc.end();

      stream.on('finish', () => {
        res.download(filePath, filename, (err) => {
          if (err) {
            console.error('Error sending file:', err);
          }
          // Clean up after download
          setTimeout(() => {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }, 5000);
        });
      });
    } else if (reportFormat === 'docx') {
      // Generate Word document
      const paragraphs = content.split('\n\n').map(para => 
        new Paragraph({
          children: [new TextRun(para.trim())],
          spacing: { after: 200 }
        })
      );

      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              children: [new TextRun({
                text: reportTitle,
                bold: true,
                size: 32
              })],
              alignment: 'center',
              spacing: { after: 400 }
            }),
            ...paragraphs
          ]
        }]
      });

      const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.docx`;
      const filePath = path.join('uploads', filename);

      if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads');
      }

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);

      res.download(filePath, filename, (err) => {
        if (err) {
          console.error('Error sending file:', err);
        }
        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }, 5000);
      });
    } else {
      res.status(400).json({ error: 'Invalid format. Use "pdf" or "docx"' });
    }

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ 
      error: 'Failed to generate report',
      message: error.message 
    });
  }
});

// Save chat history endpoint
app.post('/api/chat/save', (req, res) => {
  try {
    const { sessionId, chatName } = req.body;
    if (!conversations.has(sessionId)) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const chatHistory = conversations.get(sessionId);
    const savedChatsDir = 'saved-chats';
    
    if (!fs.existsSync(savedChatsDir)) {
      fs.mkdirSync(savedChatsDir);
    }

    const filename = `${chatName || sessionId}_${Date.now()}.json`;
    const filePath = path.join(savedChatsDir, filename);

    fs.writeFileSync(filePath, JSON.stringify({
      sessionId,
      chatName: chatName || 'Untitled Chat',
      messages: chatHistory,
      savedAt: new Date().toISOString()
    }, null, 2));

    res.json({ success: true, filename, message: 'Chat saved successfully' });
  } catch (error) {
    console.error('Error saving chat:', error);
    res.status(500).json({ error: 'Failed to save chat', message: error.message });
  }
});

// Load chat history endpoint
app.get('/api/chat/load/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join('saved-chats', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chatData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Convert Gemini format messages to frontend format
    const convertedMessages = [];
    if (chatData.messages && Array.isArray(chatData.messages)) {
      chatData.messages.forEach(msg => {
        if (msg.role === 'user') {
          // Extract text from user parts
          const textParts = msg.parts.filter(p => p.text);
          const content = textParts.map(p => p.text).join(' ') || 'User message';
          convertedMessages.push({
            type: 'user',
            content: content,
            files: [] // Files are not stored in saved format
          });
        } else if (msg.role === 'model') {
          // Extract text from model parts
          const textParts = msg.parts.filter(p => p.text);
          const content = textParts.map(p => p.text).join(' ') || '';
          if (content) {
            convertedMessages.push({
              type: 'assistant',
              content: content,
              suggestions: [] // Suggestions not stored in saved format
            });
          }
        }
      });
    }
    
    res.json({
      ...chatData,
      messages: convertedMessages
    });
  } catch (error) {
    console.error('Error loading chat:', error);
    res.status(500).json({ error: 'Failed to load chat', message: error.message });
  }
});

// List saved chats endpoint
app.get('/api/chat/saved', (req, res) => {
  try {
    const savedChatsDir = 'saved-chats';
    if (!fs.existsSync(savedChatsDir)) {
      fs.mkdirSync(savedChatsDir, { recursive: true });
      return res.json([]);
    }

    const files = fs.readdirSync(savedChatsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const filePath = path.join(savedChatsDir, file);
          const stats = fs.statSync(filePath);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return {
            filename: file,
            chatName: data.chatName || 'Unnamed Chat',
            savedAt: data.savedAt || stats.mtime.toISOString(),
            messageCount: data.messages ? data.messages.length : 0
          };
        } catch (fileError) {
          console.error(`Error reading file ${file}:`, fileError);
          return null;
        }
      })
      .filter(chat => chat !== null) // Remove any null entries from failed reads
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    console.log(`Found ${files.length} saved chats`);
    res.json(files);
  } catch (error) {
    console.error('Error listing chats:', error);
    res.status(500).json({ error: 'Failed to list chats', message: error.message });
  }
});

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    // Check if it's a Google email
    if (!isValidGoogleEmail(email)) {
      return res.status(400).json({ message: 'Please use a Google email address (Gmail)' });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const users = loadUsers();

    // Check if user already exists
    if (users.find(u => u.email === email.toLowerCase())) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      id: Date.now().toString(),
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const users = loadUsers();
    const user = users.find(u => u.email === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Export app for Vercel serverless functions
module.exports = app;

// Start server only if not in serverless environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn('Warning: GEMINI_API_KEY not set in environment variables');
    }
  });
}
