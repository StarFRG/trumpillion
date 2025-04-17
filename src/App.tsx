import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PixelGrid from "./components/PixelGrid";
import PixelModal from "./components/PixelModal/PixelModal";
import { Logo } from "./components/Logo";
import { WalletButton } from "./components/WalletButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronRight, Users, Lock, Coins } from "lucide-react";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      cacheTime: 300000,
    },
  },
});

const App: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
  const [fromButton, setFromButton] = useState(false);
  const { connected } = useWallet();

  const openModal = (pixel: { x: number; y: number; data?: any }) => {
    try {
      setSelectedPixel(pixel);
      setFromButton(false);
      setShowModal(true);
    } catch (error) {
      console.error("Fehler beim Öffnen des Modals:", error);
      toast.error(`Modal konnte nicht geöffnet werden: ${(error as Error).message}`);
    }
  };

  const openModalFromButton = () => {
    try {
      setFromButton(true);
      setShowModal(true);
    } catch (error) {
      console.error("Fehler beim Öffnen des Button-Modals:", error);
      toast.error(`Modal konnte nicht geöffnet werden: ${(error as Error).message}`);
    }
  };

  const closeModal = () => {
    try {
      setShowModal(false);
      setSelectedPixel(null);
      setFromButton(false);
    } catch (error) {
      console.error("Fehler beim Schließen des Modals:", error);
      toast.error(`Modal konnte nicht geschlossen werden: ${(error as Error).message}`);
    }
  };

  const features = [
    {
      icon: <Users className="w-6 h-6" />,
      title: "Join the Movement",
      description: "Be part of a historic community-driven art piece"
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: "Secure Ownership",
      description: "Your pixel is secured on the blockchain forever"
    },
    {
      icon: <Coins className="w-6 h-6" />,
      title: "Trade & Collect",
      description: "Buy, sell, and trade your piece of history"
    }
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
        <Toaster position="top-center" />
        
        <header>
          <nav>
            <div className="logo-container">
              <Logo />
            </div>
            <div className="wallet-button-container">
              <WalletButton />
            </div>
          </nav>
        </header>

        <main>
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="content-section"
          >
            <div className="space-y-6 max-w-2xl mx-auto lg:mx-0">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className="text-sm font-medium text-red-500 tracking-wider uppercase mb-2">
                  THE TRUMP LEGACY
                </h2>
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                  Be a Part of History!
                </h1>
              </motion.div>

              <motion.div 
                className="space-y-4 text-gray-300 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <p>
                  Create a monumental Trump portrait with a million others - 
                  a mosaic of unique moments. Your selfie, your message, 
                  your Trump moment - immortalized forever.
                </p>
                
                <div className="features-grid">
                  {features.map((feature, index) => (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + index * 0.1 }}
                      className="feature-card"
                    >
                      <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                        {feature.icon}
                      </div>
                      <div>
                        <h3 className="font-medium text-white">{feature.title}</h3>
                        <p className="text-sm text-gray-400">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="pt-4"
              >
                <button
                  onClick={openModalFromButton}
                  className="buy-button group"
                >
                  Buy Pixel Now
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </motion.div>
            </div>
          </motion.div>

          <div className="grid-section">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              className="absolute inset-0"
            >
              <PixelGrid 
                onPixelClick={openModal} 
                selectedPixel={selectedPixel}
              />
            </motion.div>
          </div>
        </main>

        <AnimatePresence>
          {showModal && (
            <PixelModal 
              isOpen={showModal}
              onClose={closeModal} 
              pixel={selectedPixel}
              setSelectedPixel={setSelectedPixel}
              fromButton={fromButton}
            />
          )}
        </AnimatePresence>
      </div>
    </QueryClientProvider>
  );
};

export default App;