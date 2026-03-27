/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ArrowLeftRight, Copy, Trash2, Sparkles, Loader2, Check, MessageSquareQuote, Play, Pause, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const SUGGESTIONS = [
  "كيف حالك يا صديقي؟ أتمنى أن تكون بخير.",
  "ماذا تفعل الآن؟ هل تريد أن نخرج معاً؟",
  "هذا الموضوع معقد جداً ولا أستطيع فهمه.",
  "أنا جائع جداً، دعنا نذهب لنأكل شيئاً لذيذاً.",
];

const DIALECTS = [
  "اللهجة البيضاء (عامة)",
  "اللهجة النجدية",
  "اللهجة الحجازية",
  "اللهجة الجنوبية",
  "اللهجة الشرقية",
  "اللهجة القصيمية",
  "اللهجة الشمالية",
  "اللهجة المصرية",
  "اللهجة الشامية (سوريا/لبنان)",
  "اللهجة العراقية",
  "اللهجة المغربية",
  "اللهجة الإماراتية",
  "اللهجة الكويتية",
  "اللهجة السودانية",
  "اللغة العربية الفصحى"
];

export default function App() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedDialect, setSelectedDialect] = useState(DIALECTS[0]);
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioPlayer, setAudioPlayer] = useState<any>(null);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('Kore');
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [correctionIssues, setCorrectionIssues] = useState<string[]>([]);
  const [ttsText, setTtsText] = useState('');

  const GEMINI_VOICES = [
    { id: 'Kore', name: 'صوت نسائي هادئ' },
    { id: 'Zephyr', name: 'صوت نسائي حيوي' },
    { id: 'Puck', name: 'صوت رجالي دافئ' },
    { id: 'Charon', name: 'صوت رجالي عميق' },
    { id: 'Fenrir', name: 'صوت رجالي قوي' }
  ];

  useEffect(() => {
    if (audioPlayer) {
      if (audioPlayer instanceof HTMLAudioElement) {
        audioPlayer.pause();
      } else if (audioPlayer.source) {
        try { audioPlayer.source.stop(); } catch(e){}
        try { audioPlayer.ctx.close(); } catch(e){}
      }
      setAudioPlayer(null);
    }
    setIsSpeaking(false);
    setIsAudioLoading(false);
  }, [outputText]);

  const toggleSpeech = async () => {
    if (!outputText) return;
    
    if (isSpeaking || isAudioLoading) {
      if (audioPlayer) {
        if (audioPlayer instanceof HTMLAudioElement) {
          audioPlayer.pause();
        } else if (audioPlayer.source) {
          try { audioPlayer.source.stop(); } catch(e){}
          try { audioPlayer.ctx.close(); } catch(e){}
        }
      }
      setIsSpeaking(false);
      setIsAudioLoading(false);
      setAudioPlayer(null);
      return;
    }

    setIsAudioLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const textToRead = ttsText || outputText;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: textToRead }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoiceURI },
              },
          },
        },
      });
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = window.atob(base64Audio);
        if (binaryString.startsWith('RIFF')) {
          const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
          audio.playbackRate = speechRate;
          audio.onended = () => {
            setIsSpeaking(false);
            setAudioPlayer(null);
          };
          audio.play();
          setAudioPlayer(audio);
        } else {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          const buffer = audioCtx.createBuffer(1, bytes.length / 2, 24000);
          const channelData = buffer.getChannelData(0);
          const dataView = new DataView(bytes.buffer);
          for (let i = 0; i < channelData.length; i++) {
              channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
          }
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = speechRate;
          source.connect(audioCtx.destination);
          source.onended = () => {
            setIsSpeaking(false);
            setAudioPlayer(null);
          };
          source.start();
          setAudioPlayer({ source, ctx: audioCtx });
        }
        setIsSpeaking(true);
      }
    } catch (err) {
      console.error("TTS Error:", err);
      setError("عذراً، حدث خطأ أثناء توليد الصوت.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  const handleTranslate = async (textToTranslate: string = inputText) => {
    if (!textToTranslate.trim()) return;
    
    setIsTranslating(true);
    setError(null);
    setCorrectionIssues([]);
    
    try {
      const systemInstruction = `أنت مترجم محترف وخبير لغوي متخصص في ${selectedDialect}.
مهمتك هي ترجمة أو صياغة النص المدخل إلى ${selectedDialect} بشكل سليم وبليغ وطبيعي.
لضمان أعلى جودة، اتبع نظام المراجعة الذاتية التالي:
1. قم بترجمة أو صياغة النص مبدئياً.
2. راجع الترجمة واكتشف أي أخطاء نحوية، أو صياغة ركيكة، أو كلمات غير طبيعية.
3. قم بتصحيح هذه الأخطاء وصياغة النص النهائي ليكون طبيعياً واحترافياً بنسبة 100٪.

يجب أن يكون المخرج بصيغة JSON صالحة (Valid JSON) فقط، ويحتوي على الحقول التالية:
{
  "draft_translation": "الترجمة المبدئية",
  "detected_issues": ["قائمة بالمشاكل أو الركاكة التي تم اكتشافها (إن وجدت)"],
  "final_corrected_translation": "الترجمة النهائية المصححة والمنقحة",
  "tts_diacritized": "الترجمة النهائية مع التشكيل الكامل (الفتحة، الضمة، الكسرة، السكون، الشدة) لضمان النطق الصحيح 100% بواسطة القارئ الآلي"
}`;

      const parseJSONResponse = (text: string) => {
        try {
          const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          return JSON.parse(cleanText);
        } catch (e) {
          console.error("Failed to parse JSON", text);
          return { final_corrected_translation: text.replace(/```json/g, '').replace(/```/g, '').trim() };
        }
      };

      if (selectedModel === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: textToTranslate,
          config: {
            systemInstruction,
            temperature: 0.7,
            responseMimeType: "application/json",
          }
        });
        const parsed = parseJSONResponse(response.text || '{}');
        setOutputText(parsed.final_corrected_translation || parsed.draft_translation || '');
        setTtsText(parsed.tts_diacritized || parsed.final_corrected_translation || parsed.draft_translation || '');
        setCorrectionIssues(parsed.detected_issues || []);
      } else if (selectedModel === 'deepseek') {
        const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY || "sk-81a7efe7437a499d851a9dc694c8a611";
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: textToTranslate }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
          })
        });
        
        if (!response.ok) {
          throw new Error(`DeepSeek API error: ${response.status}`);
        }
        
        const data = await response.json();
        const parsed = parseJSONResponse(data.choices?.[0]?.message?.content || '{}');
        setOutputText(parsed.final_corrected_translation || parsed.draft_translation || '');
        setTtsText(parsed.tts_diacritized || parsed.final_corrected_translation || parsed.draft_translation || '');
        setCorrectionIssues(parsed.detected_issues || []);
      }
    } catch (err) {
      console.error("Translation error:", err);
      setError("عذراً، حدث خطأ أثناء الترجمة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setError(null);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputText(suggestion);
    handleTranslate(suggestion);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" dir="rtl">
      {/* Header */}
      <header className="bg-emerald-800 text-white shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')]"></div>
        <div className="max-w-5xl mx-auto px-4 py-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-2"
          >
            <Sparkles className="w-8 h-8 text-emerald-300" />
            <h1 className="text-4xl font-bold tracking-tight">المترجم العربي</h1>
          </motion.div>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center text-emerald-100 text-lg font-medium"
          >
            حوّل أي نص إلى مختلف اللهجات العربية بضغطة زر
          </motion.p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-start">
          
          {/* Input Section */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[480px]"
          >
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <span className="font-bold text-slate-700">النص الأصلي</span>
              <button 
                onClick={handleClear}
                className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200"
                title="مسح النص"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            {/* Options Section */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Dialect Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <label htmlFor="dialect-select" className="text-sm font-bold text-slate-600 whitespace-nowrap">
                  اختر اللهجة:
                </label>
                <div className="relative w-full">
                  <select
                    id="dialect-select"
                    value={selectedDialect}
                    onChange={(e) => setSelectedDialect(e.target.value)}
                    className="appearance-none w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 block px-3 py-2 shadow-sm outline-none cursor-pointer pl-8"
                  >
                    {DIALECTS.map((dialect) => (
                      <option key={dialect} value={dialect}>
                        {dialect}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-slate-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              {/* Model Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <label htmlFor="model-select" className="text-sm font-bold text-slate-600 whitespace-nowrap">
                  النموذج:
                </label>
                <div className="relative w-full">
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="appearance-none w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 block px-3 py-2 shadow-sm outline-none cursor-pointer pl-8"
                  >
                    <option value="gemini">Gemini (سريع)</option>
                    <option value="deepseek">DeepSeek (دقيق)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 text-slate-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="اكتب النص هنا (بالفصحى أو أي لغة)..."
              className="flex-1 w-full p-4 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-lg leading-relaxed overflow-y-auto custom-scrollbar"
            />
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="text-xs text-slate-400 font-medium">
                {inputText.length} حرف
              </span>
              <button
                onClick={() => handleTranslate()}
                disabled={!inputText.trim() || isTranslating}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition-all flex items-center gap-2 shadow-sm hover:shadow active:scale-95"
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الترجمة...
                  </>
                ) : (
                  <>
                    ترجم الحين
                    <ArrowLeftRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* Center Icon (Desktop only) */}
          <div className="hidden lg:flex h-full items-center justify-center pt-12">
            <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 shadow-inner">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
          </div>

          {/* Output Section */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[480px]"
          >
            <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex justify-between items-center">
              <span className="font-bold text-emerald-800">{selectedDialect}</span>
              <div className="flex items-center gap-1 sm:gap-2">
                <button 
                  onClick={() => setShowAudioSettings(!showAudioSettings)}
                  className={`text-emerald-600 hover:text-emerald-800 transition-colors p-1.5 rounded-md flex items-center gap-1.5 text-sm font-medium ${showAudioSettings ? 'bg-emerald-200' : 'hover:bg-emerald-100'}`}
                  title="إعدادات الصوت"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={toggleSpeech}
                  disabled={!outputText || isAudioLoading}
                  className="text-emerald-600 hover:text-emerald-800 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors p-1.5 rounded-md hover:bg-emerald-100 flex items-center gap-1.5 text-sm font-medium"
                  title={isSpeaking ? "إيقاف" : "استماع"}
                >
                  {isAudioLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isSpeaking ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />)}
                  <span className="hidden sm:inline">{isAudioLoading ? 'جاري التحضير...' : (isSpeaking ? 'إيقاف' : 'استماع')}</span>
                </button>
                <div className="w-px h-4 bg-emerald-200 hidden sm:block"></div>
                <button 
                  onClick={handleCopy}
                  disabled={!outputText}
                  className="text-emerald-600 hover:text-emerald-800 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors p-1.5 rounded-md hover:bg-emerald-100 flex items-center gap-1.5 text-sm font-medium"
                  title="نسخ النص"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="hidden sm:inline">{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showAudioSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-emerald-50/50 border-b border-emerald-100 overflow-hidden"
                >
                  <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <label className="text-sm font-bold text-emerald-800 whitespace-nowrap">الصوت:</label>
                      <select 
                        value={selectedVoiceURI} 
                        onChange={e => setSelectedVoiceURI(e.target.value)}
                        className="flex-1 appearance-none bg-white border border-emerald-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 block px-3 py-2 outline-none cursor-pointer"
                      >
                        {GEMINI_VOICES.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <label className="text-sm font-bold text-emerald-800 whitespace-nowrap min-w-[60px]">
                        السرعة: {speechRate}x
                      </label>
                      <input 
                        type="range" 
                        min="0.5" max="2" step="0.1" 
                        value={speechRate} 
                        onChange={e => setSpeechRate(parseFloat(e.target.value))}
                        className="flex-1 accent-emerald-600"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="flex-1 flex flex-col relative bg-emerald-50/30 overflow-hidden">
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                  {isTranslating ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-emerald-600 gap-3"
                    >
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="font-medium animate-pulse">لحظات طال عمرك...</span>
                    </motion.div>
                  ) : outputText ? (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xl leading-relaxed text-slate-800 font-medium whitespace-pre-wrap"
                    >
                      {outputText}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3"
                    >
                      <MessageSquareQuote className="w-12 h-12 opacity-20" />
                      <span className="text-sm">الترجمة بتطلع هنا...</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </motion.div>

        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 text-center font-medium"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggestions */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12"
        >
          <h3 className="text-slate-500 font-bold mb-4 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            جرب هالجمل:
          </h3>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 px-4 py-2 rounded-full text-sm font-medium transition-all text-right shadow-sm"
              >
                "{suggestion}"
              </button>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
