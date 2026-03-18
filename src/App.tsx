import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioProcessor } from './services/audioProcessor';

const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-09-2025";

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcript, setTranscript] = useState<string>("");
  const [aiTranscript, setAiTranscript] = useState<string>("");
  
  const sessionRef = useRef<any>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const aiRef = useRef<any>(null);

  const startSession = async () => {
    if (status !== 'idle') return;
    
    setStatus('connecting');
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");

      aiRef.current = new GoogleGenAI({ apiKey });
      
      audioProcessorRef.current = new AudioProcessor((base64Data) => {
        if (sessionRef.current && !isMuted) {
          sessionRef.current.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      });

      const session = await aiRef.current.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Echo, a helpful and friendly voice assistant. Keep your responses concise and natural for a voice conversation. You can hear and speak in real-time.",
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Session opened");
            setIsConnected(true);
            setStatus('active');
            audioProcessorRef.current?.startCapture();
          },
          onmessage: async (message: any) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              audioProcessorRef.current?.playAudioChunk(base64Audio);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              audioProcessorRef.current?.stopPlayback();
            }

            const userTranscript = message.serverContent?.userTurn?.parts?.[0]?.text;
            if (userTranscript) {
              setTranscript(userTranscript);
            }

            const modelTranscript = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelTranscript) {
              setAiTranscript(modelTranscript);
            }
          },
          onclose: () => {
            console.log("Session closed");
            stopSession();
          },
          onerror: (err: any) => {
            console.error("Session error:", err);
            setStatus('error');
          }
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to start session:", err);
      setStatus('error');
    }
  };

  const stopSession = () => {
    sessionRef.current?.close();
    audioProcessorRef.current?.stopCapture();
    setIsConnected(false);
    setStatus('idle');
    setTranscript("");
    setAiTranscript("");
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <div className="atmosphere" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center max-w-2xl w-full space-y-12"
      >
        <header className="space-y-2">
          <motion.h1 
            className="text-6xl font-serif italic tracking-tighter text-white/90"
            animate={status === 'active' ? { opacity: [0.5, 1, 0.5] } : {}}
            transition={{ duration: 3, repeat: Infinity }}
          >
            Echo
          </motion.h1>
          <p className="text-sm font-sans uppercase tracking-[0.3em] text-white/40">
            Native Voice Intelligence
          </p>
        </header>

        <div className="relative flex items-center justify-center py-20">
          <AnimatePresence mode="wait">
            {status === 'active' ? (
              <motion.div
                key="active"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative"
              >
                <div className="w-48 h-48 rounded-full glass flex items-center justify-center relative z-10">
                  <Sparkles className={`w-12 h-12 ${isMuted ? 'text-white/20' : 'text-orange-500'} transition-colors`} />
                </div>
                {!isMuted && (
                  <>
                    <div className="absolute inset-0 rounded-full border border-orange-500/30 pulse-ring" />
                    <div className="absolute inset-[-20px] rounded-full border border-orange-500/10 pulse-ring" style={{ animationDelay: '0.5s' }} />
                  </>
                )}
              </motion.div>
            ) : (
              <motion.button
                key="idle"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startSession}
                disabled={status === 'connecting'}
                className="w-48 h-48 rounded-full glass flex flex-col items-center justify-center space-y-3 group transition-all hover:bg-white/10"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-orange-500 transition-colors">
                  <Mic className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-sans uppercase tracking-widest text-white/60">
                  {status === 'connecting' ? 'Connecting...' : 'Start Session'}
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-32">
          <div className="glass rounded-2xl p-4 flex flex-col items-start text-left space-y-2 overflow-hidden">
            <div className="flex items-center space-x-2 text-white/40">
              <Mic className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">You</span>
            </div>
            <p className="text-sm text-white/70 line-clamp-3 font-sans italic">
              {transcript || "Listening..."}
            </p>
          </div>
          
          <div className="glass rounded-2xl p-4 flex flex-col items-start text-left space-y-2 overflow-hidden">
            <div className="flex items-center space-x-2 text-orange-500/60">
              <Sparkles className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Echo</span>
            </div>
            <p className="text-sm text-white/70 line-clamp-3 font-sans italic">
              {aiTranscript || "Waiting for response..."}
            </p>
          </div>
        </div>

        {status === 'active' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center space-x-4 pt-8"
          >
            <button
              onClick={toggleMute}
              className="p-4 rounded-full glass hover:bg-white/10 transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-white" />}
            </button>
            <button
              onClick={stopSession}
              className="px-8 py-4 rounded-full bg-white text-black font-sans text-xs uppercase tracking-widest font-bold hover:bg-white/90 transition-colors"
            >
              End Session
            </button>
          </motion.div>
        )}

        {status === 'error' && (
          <p className="text-red-400 text-xs font-sans uppercase tracking-widest">
            Connection failed. Please check your API key and try again.
          </p>
        )}
      </motion.div>

      <footer className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-[10px] font-sans uppercase tracking-[0.4em] text-white/20">
          Powered by Gemini 2.5 Flash Live
        </p>
      </footer>
    </div>
  );
}
