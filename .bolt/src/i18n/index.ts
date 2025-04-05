import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const resources = {
  en: {
    translation: {
      common: {
        loading: "Loading...",
        error: "An error occurred",
        retry: "Retry",
        close: "Close"
      },
      wallet: {
        connect: {
          prompt: "Please connect your wallet to continue"
        },
        error: {
          notConnected: "Wallet not connected",
          invalid: "Invalid wallet"
        }
      },
      pixel: {
        title: "Your Trump Moment",
        coordinates: "Selected Pixel",
        defaultTitle: "Untitled Trump Moment",
        defaultDescription: "No description provided",
        error: {
          noPixel: "No pixel selected",
          noFreePixel: "No free pixels available",
          alreadyOwned: "This pixel is already owned"
        },
        upload: {
          title: "Upload Image",
          formats: "Supports JPG, PNG and GIF • Max 10MB",
          error: {
            format: "Please upload only JPG, PNG or GIF files",
            size: "File size must be between 1KB and 10MB",
            noFile: "Please select a file"
          }
        },
        mint: {
          button: "Mint NFT (1 SOL)",
          processing: "Processing..."
        }
      }
    }
  },
  de: {
    translation: {
      common: {
        loading: "Lädt...",
        error: "Ein Fehler ist aufgetreten",
        retry: "Erneut versuchen",
        close: "Schließen"
      },
      wallet: {
        connect: {
          prompt: "Bitte verbinde dein Wallet um fortzufahren"
        },
        error: {
          notConnected: "Wallet nicht verbunden",
          invalid: "Ungültiges Wallet"
        }
      },
      pixel: {
        title: "Dein Trump Moment",
        coordinates: "Ausgewähltes Pixel",
        defaultTitle: "Unbenannter Trump Moment",
        defaultDescription: "Keine Beschreibung vorhanden",
        error: {
          noPixel: "Kein Pixel ausgewählt",
          noFreePixel: "Keine freien Pixel verfügbar",
          alreadyOwned: "Dieses Pixel ist bereits vergeben"
        },
        upload: {
          title: "Bild hochladen",
          formats: "Unterstützt JPG, PNG und GIF • Max 10MB",
          error: {
            format: "Bitte nur JPG, PNG oder GIF-Dateien hochladen",
            size: "Dateigröße muss zwischen 1KB und 10MB liegen",
            noFile: "Bitte wähle eine Datei aus"
          }
        },
        mint: {
          button: "NFT erstellen (1 SOL)",
          processing: "Verarbeite..."
        }
      }
    }
  }
};

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;