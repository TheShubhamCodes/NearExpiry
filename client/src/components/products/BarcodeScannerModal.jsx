import React, { useState, useEffect, useRef } from 'react';
import { 
  ScanLine, 
  Camera, 
  VideoOff, 
  RefreshCw, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  X,
  FlipHorizontal
} from 'lucide-react';
import { BrowserMultiFormatReader, BrowserCodeReader } from '@zxing/browser';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onDetected
}) {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannedCode, setScannedCode] = useState(null);

  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const controlsRef = useRef(null);
  const isScanningRef = useRef(false);

  // Play pleasant subtle chime on detection
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {
      // AudioContext may be restricted by autoplay policy; ignore safely
    }
  };

  // Stop camera stream safely
  const stopScanning = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner controls:', err);
      }
      controlsRef.current = null;
    }
    isScanningRef.current = false;
  };

  // Enumerate video devices and start stream
  useEffect(() => {
    if (!isOpen) {
      stopScanning();
      setScannedCode(null);
      setScannerError('');
      setManualBarcode('');
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setScannerError('');
    setScannedCode(null);

    const initScanner = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera streaming is not supported by your current browser.');
        }

        const videoInputDevices = await BrowserCodeReader.listVideoInputDevices();
        if (!isMounted) return;

        setDevices(videoInputDevices || []);

        // Pick preferred device: back/environment camera if available, or first
        let deviceToUse = selectedDeviceId;
        if (!deviceToUse && videoInputDevices.length > 0) {
          const backCam = videoInputDevices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
          );
          deviceToUse = backCam ? backCam.deviceId : videoInputDevices[0].deviceId;
          setSelectedDeviceId(deviceToUse);
        }

        if (!videoRef.current) return;

        codeReaderRef.current = new BrowserMultiFormatReader();
        isScanningRef.current = true;

        const controls = await codeReaderRef.current.decodeFromVideoDevice(
          deviceToUse || undefined,
          videoRef.current,
          (result, error, controls) => {
            if (!isMounted || !isScanningRef.current) return;

            if (result) {
              const text = result.getText();
              if (text && text.trim().length > 0) {
                isScanningRef.current = false;
                playBeep();
                setScannedCode(text.trim());
                setTimeout(() => {
                  stopScanning();
                  onDetected(text.trim());
                }, 400);
              }
            }
          }
        );

        if (isMounted) {
          controlsRef.current = controls;
          setIsInitializing(false);
        } else {
          controls.stop();
        }

      } catch (err) {
        if (!isMounted) return;
        setIsInitializing(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setScannerError('Camera permission was denied. Please allow camera permissions in your browser or type the barcode manually below.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setScannerError('No camera found on this device. Please use the manual barcode input below.');
        } else {
          setScannerError(err.message || 'Could not start camera. Please enter barcode manually.');
        }
      }
    };

    initScanner();

    return () => {
      isMounted = false;
      stopScanning();
    };
  }, [isOpen, selectedDeviceId]);

  // Handle manual input submission
  const handleManualSubmit = (e) => {
    e?.preventDefault();
    if (manualBarcode.trim()) {
      stopScanning();
      onDetected(manualBarcode.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopScanning();
        onClose();
      }}
      title="Barcode Scanner"
      description="Scan standard supermarket barcodes (EAN-13, EAN-8, UPC, Code-128) using your device camera."
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              stopScanning();
              onClose();
            }}
          >
            Cancel
          </Button>
          <span className="text-[11px] text-slate-400">
            Powered by ZXing Barcode Engine
          </span>
        </div>
      }
    >
      <div className="space-y-4">

        {/* Camera Viewport Container */}
        <div className="relative w-full aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-inner">
          
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isInitializing || scannerError ? 'opacity-0' : 'opacity-100'
            }`}
            autoPlay
            playsInline
            muted
          />

          {/* Loading Indicator */}
          {isInitializing && !scannerError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-2.5">
              <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
              <p className="text-xs font-medium">Activating camera hardware...</p>
            </div>
          )}

          {/* Camera Permission / Error Fallback inside viewport */}
          {scannerError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 text-slate-300">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                <VideoOff className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-white max-w-xs leading-relaxed mb-2">
                Camera Unavailable
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                {scannerError}
              </p>
            </div>
          )}

          {/* Viewfinder Overlay & Animated Laser when scanning */}
          {!scannerError && !isInitializing && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Target Bounding Box */}
              <div className="relative w-64 h-40 sm:w-72 sm:h-44 border-2 border-emerald-400/40 rounded-xl overflow-hidden shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]">
                
                {/* 4 Corner Accents */}
                <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />

                {/* Animated Green Laser Scan Line */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce duration-1000" />
              </div>
            </div>
          )}

          {/* Scanned Success Confirmation Overlay */}
          {scannedCode && (
            <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mb-2 shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-200">Barcode Captured</p>
              <p className="text-base font-mono font-extrabold text-white mt-1 tracking-wider">{scannedCode}</p>
            </div>
          )}
        </div>

        {/* Camera Switcher (if multiple cameras detected) */}
        {devices.length > 1 && !scannerError && (
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Camera className="w-3.5 h-3.5 text-slate-400" />
              <span>Camera source:</span>
            </span>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                stopScanning();
                setSelectedDeviceId(e.target.value);
              }}
              className="text-xs bg-white/70 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Manual Barcode Input Fallback */}
        <div className="pt-2 border-t border-slate-200/80">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Or Enter Barcode Manually
          </p>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g. 3017620422003"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                icon={ScanLine}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              icon={ArrowRight}
              disabled={!manualBarcode.trim()}
            >
              Lookup
            </Button>
          </form>
        </div>

      </div>
    </Modal>
  );
}

