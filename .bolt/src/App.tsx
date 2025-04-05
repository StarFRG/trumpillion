import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelGrid from "./components/PixelGrid";
import PixelModal from "./components/PixelModal";
import { Logo } from "./components/Logo";
import { WalletButton } from "./components/WalletButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronRight, Users, Lock, Coins } from "lucide-react";
import "./index.css";

const App: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
  const [selectedPixelData, setSelectedPixelData] = useState<any>(null);
  const [fromButton, setFromButton] = useState(false);
  const { connected } = useWallet();

  const openModal = (pixel: { x: number; y: number; data?: any }) => {
    setSelectedPixel(pixel);
    setSelectedPixelData(pixel.data);
    setFromButton(false);
    setShowModal(true);
  };

  const openModalFromButton = () => {
    setFromButton(true);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPixel(null);
    setSelectedPixelData(null);
    setFromButton(false);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
      <header className="relative backdrop-blur-[2px]">
        <nav className="max-w-[2000px] mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex-shrink-0">
            <Logo />
          </div>
          <div className="flex-shrink-0">
            <WalletButton />
          </div>
        </nav>
      </header>

      <main className="h-[calc(100vh-72px)] grid lg:grid-cols-[45fr,55fr]">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col justify-center p-8 lg:p-20 relative z-10"
        >
          <div className="space-y-8 max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-sm font-medium text-red-500 tracking-wider uppercase mb-2">
                THE TRUMP LEGACY
              </h2>
              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
                Be a Part of History!
              </h1>
            </motion.div>

            <motion.div 
              className="space-y-6 text-gray-300 text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <p>
                Create a monumental Trump portrait with a million others - 
                a mosaic of unique moments. Your selfie, your message, 
                your Trump moment - immortalized forever.
              </p>
              <div className="grid gap-6 mt-8">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className="flex items-center gap-4 bg-white/5 p-4 rounded-lg hover:bg-white/10 transition-colors"
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
              className="flex flex-col sm:flex-row gap-4 pt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <button
                onClick={openModalFromButton}
                className="group bg-red-500 px-8 py-3 rounded-lg hover:bg-red-600 transition-all flex items-center justify-center gap-2 font-medium text-lg"
              >
                Buy Pixel Now
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </div>
        </motion.div>

        <div className="relative h-full">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <PixelGrid onPixelClick={openModal} />
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
  );
};

export default App;